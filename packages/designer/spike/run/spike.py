#!/usr/bin/env python3
"""Run one spike case: one Codex thread with a shell, image viewing and the spike CLI in a workspace.

uv run --project ../../../harness python run/spike.py --case a-japandi-living   (from packages/designer/spike)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections import Counter
from datetime import datetime

RUN = Path(__file__).resolve().parent
SPIKE = RUN.parent
ROOT = SPIKE.parents[2]
MODEL = "gpt-6-astra"
TSX = ROOT / "packages/designer/node_modules/.bin/tsx"
# The tsx CLI opens an IPC socket in $TMPDIR, which the workspace-write seatbelt denies (listen EPERM);
# the plain loader needs no socket.
TSX_LOADER = (ROOT / "packages/designer/node_modules/tsx/dist/loader.mjs").resolve()


def load_case(case_id: str) -> tuple[dict, Path]:
    cases = json.loads((RUN / "cases.json").read_text())
    case = next((c for c in cases["cases"] if c["id"] == case_id), None)
    if case is None:
        raise SystemExit(f"unknown case {case_id}; have {[c['id'] for c in cases['cases']]}")
    return case, SPIKE / case.get("scene", cases["scene"])


def toml(value) -> str:
    if isinstance(value, dict):
        return "{" + ", ".join(json.dumps(k) + " = " + toml(v) for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "[" + ", ".join(toml(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def wrapper(cli: Path) -> str:
    return f'#!/bin/sh\nexec node --import "{TSX_LOADER.as_uri()}" "{cli}" "$@"\n'


def make_workspace(case: dict, scene: Path, out: Path, cli: Path) -> Path:
    out.mkdir(parents=True)
    shutil.copyfile(scene, out / "scene.json")
    (out / "draft.json").write_text('{"items": []}\n')
    (out / "lib").symlink_to(SPIKE / "lib")
    if cli.resolve() == (SPIKE / "cli.ts").resolve():
        (out / "cli.ts").symlink_to(cli)
    else:  # a stub for plumbing tests: a real file in the workspace, never in spike/
        shutil.copyfile(cli, out / "cli.ts")
        cli = out / "cli.ts"
    (out / "varpet").write_text(wrapper(cli.resolve()))
    (out / "varpet").chmod(0o755)
    image_note = image_tool_note = ""
    if case.get("image"):
        image = SPIKE / case["image"]
        shutil.copyfile(image, out / ("inspiration" + image.suffix))
        image_note = (f"The customer attached an inspiration picture (the image in the first message, also "
                      f"`inspiration{image.suffix}`). Match its mood, palette, materials and key pieces; "
                      "ignore its room geometry.")
        image_tool_note = ", and the inspiration picture"
    prompt = (RUN / "AGENTS.md").read_text()
    for key, value in (("case_id", case["id"]), ("request", case["request"]), ("image_note", image_note),
                       ("image_tool_note", image_tool_note)):
        prompt = prompt.replace("{" + key + "}", value)
    (out / "AGENTS.md").write_text(prompt)
    return out


def private_home(tool_mode: str) -> tuple[Path, dict]:
    """Isolated CODEX_HOME: auth + caches only, so ~/.codex/config.toml never leaks into the measurement."""
    source = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    home = Path(tempfile.mkdtemp(prefix="varpet-spike-home-"))
    if (source / "auth.json").is_file():
        (home / "auth.json").symlink_to((source / "auth.json").resolve())
    for name in ("cloud-config-bundle-cache.json", "models_cache.json"):
        if (source / name).is_file():
            shutil.copyfile(source / name, home / name)
    extra = {}
    if tool_mode != "default":
        models = json.loads((home / "models_cache.json").read_text())["models"]
        model = next(m for m in models if m.get("slug") == MODEL)
        extra["original_tool_mode"] = model.get("tool_mode")
        model["tool_mode"] = tool_mode
        catalog = home / "spike-models.json"
        catalog.write_text(json.dumps({"models": models}))
        extra["model_catalog_json"] = str(catalog)
    return home, extra


def codex_config(effort: str, sandbox: str, network: bool, extra: dict) -> dict:
    config = {
        "model": MODEL,
        "model_reasoning_effort": effort,
        "web_search": "disabled",
        # The workspace sits in the git tree: never load the repo's AGENTS.md; the prompt goes in
        # as developer instructions instead.
        "project_doc_max_bytes": 0,
        "features": {"shell_tool": True, "unified_exec": True, "view_image": True,
                     **{name: False for name in ("apps", "plugins", "memories", "multi_agent", "multi_agent_v2",
                                                 "browser_use", "computer_use", "image_generation", "goals")}},
        "sandbox_mode": {"full-access": "danger-full-access"}.get(sandbox, sandbox),
        "sandbox_workspace_write": {"network_access": network},
    }
    if "model_catalog_json" in extra:
        config["model_catalog_json"] = extra["model_catalog_json"]
    return config


def disable_skills(codex, workspace: str) -> list[str]:
    from openai_codex.generated.v2_all import SkillsListResponse, SkillsConfigWriteResponse
    client = codex._client
    params = {"cwds": [workspace], "forceReload": True}
    for entry in client.request("skills/list", params, response_model=SkillsListResponse).data:
        for skill in entry.skills:
            if skill.enabled:
                path = skill.model_dump(mode="json", by_alias=True)["path"]
                client.request("skills/config/write", {"path": path, "enabled": False},
                               response_model=SkillsConfigWriteResponse)
    audited = client.request("skills/list", params, response_model=SkillsListResponse)
    return [skill.name for entry in audited.data for skill in entry.skills if skill.enabled]


def run_thread(workspace: Path, case: dict, args, events_path: Path) -> dict:
    from openai_codex import Codex, CodexConfig, ApprovalMode, Sandbox, LocalImageInput, TextInput
    from openai_codex.generated.v2_all import ReasoningEffort
    home, extra = private_home(args.tool_mode)
    config = codex_config(args.effort, args.sandbox, not args.no_network, extra)
    sandbox = Sandbox(args.sandbox)
    instructions = (workspace / "AGENTS.md").read_text()
    text = f"Customer request: {case['request']}\nWork in this directory as your instructions describe."
    turn_input = text
    if case.get("image"):
        turn_input = [LocalImageInput(path=str(SPIKE / case["image"])), TextInput(text=text)]
    record = {"tool_mode": args.tool_mode, "original_tool_mode": extra.get("original_tool_mode"),
              "sandbox": args.sandbox, "network": not args.no_network, "config": config}
    counts, commands, images, tools = Counter(), [], [], []
    usage = final = completed = None
    started = time.monotonic()
    sdk = CodexConfig(cwd=str(workspace), env={"CODEX_HOME": str(home)},
                      config_overrides=tuple(k + "=" + toml(v) for k, v in config.items()))
    try:
        with Codex(sdk) as codex, events_path.open("w") as log:
            record["skills_enabled"] = disable_skills(codex, str(workspace))
            thread = codex.thread_start(model=MODEL, approval_mode=ApprovalMode.deny_all, sandbox=sandbox,
                                        cwd=str(workspace), developer_instructions=instructions)
            record["thread_id"] = thread.id
            # No per-turn sandbox: the SDK's turn preset sends workspaceWrite with networkAccess=false,
            # overriding sandbox_workspace_write.network_access from the config.
            handle = thread.turn(turn_input, effort=ReasoningEffort(args.effort),
                                 approval_mode=ApprovalMode.deny_all)
            timer = threading.Timer(args.timeout, handle.interrupt)
            timer.start()
            try:
                for event in handle.stream():
                    payload = event.payload.model_dump(mode="json", by_alias=True)
                    log.write(json.dumps({"t": round(time.monotonic() - started, 3), "method": event.method,
                                          "payload": payload}, ensure_ascii=False) + "\n")
                    if event.method == "item/completed":
                        item = payload.get("item", {})
                        kind = item.get("type")
                        counts[kind] += 1
                        if kind == "commandExecution":
                            commands.append({"command": item.get("command"), "exit": item.get("exitCode"),
                                             "ms": item.get("durationMs")})
                        elif kind == "imageView":
                            images.append(item.get("path"))
                        elif kind in ("mcpToolCall", "dynamicToolCall"):
                            tools.append(item.get("tool"))
                        elif kind == "agentMessage" and item.get("phase") in (None, "final_answer"):
                            final = item.get("text")
                    elif event.method == "thread/tokenUsage/updated":
                        usage = payload.get("tokenUsage", {}).get("total")
                    elif event.method == "turn/completed":
                        completed = payload.get("turn", {})
            finally:
                timer.cancel()
    finally:
        shutil.rmtree(home, ignore_errors=True)
    seconds = time.monotonic() - started
    status = (completed or {}).get("status", "missing_completion")
    if seconds >= args.timeout:
        status = "timeout"
    ignored = {"agentMessage", "reasoning", "userMessage", None}
    return {**record, "status": status, "error": (completed or {}).get("error"), "wall_seconds": round(seconds, 1),
            "usage": usage, "tool_calls": {"total": sum(n for k, n in counts.items() if k not in ignored),
                                           "by_type": dict(counts), "commands": commands,
                                           "images_viewed": images, "tools": tools},
            "final_message": final}


def varpet(workspace: Path, *argv: str) -> dict:
    try:
        result = subprocess.run([str(workspace / "varpet"), *argv], cwd=workspace, capture_output=True,
                                text=True, timeout=300)
        return {"argv": list(argv), "exit": result.returncode, "stdout": result.stdout[-4000:],
                "stderr": result.stderr[-2000:]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"argv": list(argv), "exit": None, "error": str(error)}


def final_report(workspace: Path, case: dict) -> dict:
    room = case.get("room", "room-living")
    return {"check": varpet(workspace, "check"),
            "plan": varpet(workspace, "render-plan", "final-plan.png"),
            "plan_room": varpet(workspace, "render-plan", "final-plan-room.png", "--room", room),
            "view": varpet(workspace, "render-view", "final-view.png", "--room", room),
            "report_angles": report_angles(workspace / "scene.json", workspace / "draft.json", workspace / "report", room)}


def report_angles(scene: Path, draft: Path, out_dir: Path, room: str) -> dict:
    out_dir.mkdir(exist_ok=True)
    try:
        result = subprocess.run([str(TSX), str(RUN / "report.ts"), str(scene), str(draft), str(out_dir), room],
                                capture_output=True, text=True, timeout=300)
        return {"exit": result.returncode, "paths": result.stdout.split(), "stderr": result.stderr[-2000:]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"exit": None, "error": str(error)}


def warm_renderer(workspace: Path, room: str) -> dict:
    """Start the render daemon outside the sandbox so the thread's first render-view is not a cold start."""
    started = time.monotonic()
    result = varpet(workspace, "render-view", ".warmup.png", "--room", room)
    (workspace / ".warmup.png").unlink(missing_ok=True)
    return {**result, "seconds": round(time.monotonic() - started, 1)}


def read_draft(workspace: Path) -> tuple[dict | None, str | None]:
    try:
        draft = json.loads((workspace / "draft.json").read_text())
        return draft, None
    except (OSError, ValueError) as error:
        return None, str(error)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", required=True, help="case id from run/cases.json")
    parser.add_argument("--effort", default="medium", choices=("low", "medium", "high"))
    parser.add_argument("--tool-mode", default="default",
                        help="'default' keeps the model's tool_mode (code_mode_only); 'direct' exposes exec_command/view_image as plain tools")
    parser.add_argument("--sandbox", default="workspace-write", choices=("workspace-write", "full-access"))
    parser.add_argument("--no-network", action="store_true", help="deny network inside the sandbox")
    parser.add_argument("--timeout", type=float, default=1500.0, help="wall seconds before the turn is interrupted")
    parser.add_argument("--cli", type=Path, default=SPIKE / "cli.ts", help="CLI to expose (stub for plumbing tests)")
    parser.add_argument("--no-render", action="store_true", help="skip the final check/render report")
    args = parser.parse_args()
    case, scene = load_case(args.case)
    if not args.cli.exists():
        raise SystemExit(f"{args.cli} does not exist yet")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    workspace = make_workspace(case, scene, SPIKE / "out" / case["id"] / stamp, args.cli)
    print(f"workspace: {workspace}", flush=True)
    result = {"case": case["id"], "request": case["request"], "image": case.get("image"), "model": MODEL,
              "effort": args.effort, "workspace": str(workspace),
              "scene_sha256": hashlib.sha256(scene.read_bytes()).hexdigest()}
    if not args.no_render:
        result["warmup"] = warm_renderer(workspace, case.get("room", "room-living"))
    try:
        result.update(run_thread(workspace, case, args, workspace / "events.jsonl"))
    except Exception as error:  # record, then still report what the workspace holds
        result.update(status="error", error=f"{type(error).__name__}: {error}")
    draft, draft_error = read_draft(workspace)
    items = (draft or {}).get("items", []) if isinstance(draft, dict) else []
    result.update(draft=draft, draft_error=draft_error, item_count=len(items),
                  total_price=sum(i.get("price") or 0 for i in items if isinstance(i, dict)))
    if not args.no_render:
        result["report"] = final_report(workspace, case)
    (workspace / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    usage = result.get("usage") or {}
    print(json.dumps({k: result.get(k) for k in ("status", "error", "wall_seconds", "item_count", "total_price")}
                     | {"tokens": {k: usage.get(k) for k in ("inputTokens", "cachedInputTokens", "outputTokens",
                                                              "reasoningOutputTokens")},
                        "tool_calls": (result.get("tool_calls") or {}).get("by_type")}, indent=1), flush=True)
    print(f"result: {workspace / 'result.json'}", flush=True)
    return 0 if result.get("status") == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
