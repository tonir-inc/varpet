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


def load_case(case_id: str, cases_path: Path = RUN / "cases.json") -> dict:
    """A case: request, optional image, `flat` ("avani" default, or an editor document / architect shell path
    relative to spike/), `rooms` ("all" or room ids; legacy `room`), optional `budget_dram`."""
    cases = json.loads(cases_path.read_text())
    case = next((c for c in cases["cases"] if c["id"] == case_id), None)
    if case is None:
        raise SystemExit(f"unknown case {case_id}; have {[c['id'] for c in cases['cases']]}")
    return case


def build_flat(case: dict, out: Path) -> list[dict]:
    """scene.json + source.json for the case's flat (run/flat.ts); returns [{id, name}] of its rooms."""
    result = subprocess.run([str(TSX), str(RUN / "flat.ts"), case.get("flat", "avani"), str(out)],
                            capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise SystemExit(f"flat {case.get('flat', 'avani')}: {result.stderr.strip()}")
    return json.loads(result.stdout)


def scope(case: dict, rooms: list[dict]) -> list[str]:
    """Room ids the case is about."""
    wanted = case.get("rooms", [case["room"]] if case.get("room") else "all")
    ids = [r["id"] for r in rooms]
    if wanted == "all":
        return ids
    unknown = [r for r in wanted if r not in ids]
    if unknown:
        raise SystemExit(f"case {case['id']}: unknown rooms {unknown}; flat has {ids}")
    return list(wanted)


def notes(case: dict, rooms: list[dict]) -> dict[str, str]:
    in_scope = scope(case, rooms)
    names = ", ".join(f"{r['id']} ({r['name']})" for r in rooms if r["id"] in in_scope)
    rooms_note = (f"Rooms in scope: all rooms ({names})." if len(in_scope) == len(rooms) else f"Rooms in scope: {names}.")
    budget = case.get("budget_dram")
    budget_note = f"Budget: {budget} AMD for furniture; ./varpet check enforces it." if budget else ""
    return {"rooms_note": rooms_note, "budget_note": budget_note}


def toml(value) -> str:
    if isinstance(value, dict):
        return "{" + ", ".join(json.dumps(k) + " = " + toml(v) for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "[" + ", ".join(toml(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def wrapper(cli: Path) -> str:
    return f'#!/bin/sh\nexec node --import "{TSX_LOADER.as_uri()}" "{cli}" "$@"\n'


def link_tools(out: Path, cli: Path = SPIKE / "cli.ts") -> None:
    """lib/, cli.ts and the ./varpet wrapper in a workspace (the designer service reuses this)."""
    (out / "lib").symlink_to(SPIKE / "lib")
    if cli.resolve() == (SPIKE / "cli.ts").resolve():
        (out / "cli.ts").symlink_to(cli)
    else:  # a stub for plumbing tests: a real file in the workspace, never in spike/
        shutil.copyfile(cli, out / "cli.ts")
        cli = out / "cli.ts"
    (out / "varpet").write_text(wrapper(cli.resolve()))
    (out / "varpet").chmod(0o755)


def fill_prompt(case: dict, rooms: list[dict], image_suffix: str | None = None) -> str:
    """run/AGENTS.md filled for a case; image_suffix when `inspiration<suffix>` sits in the workspace."""
    image_note = image_tool_note = ""
    if image_suffix:
        image_note = (f"The customer attached an inspiration picture (the image in the first message, also "
                      f"`inspiration{image_suffix}`). Match its mood, palette, materials and key pieces; "
                      "ignore its room geometry.")
        image_tool_note = ", and the inspiration picture"
    prompt = (RUN / "AGENTS.md").read_text()
    for key, value in (("case_id", case["id"]), ("request", case["request"]), ("image_note", image_note),
                       ("image_tool_note", image_tool_note), *notes(case, rooms).items()):
        prompt = prompt.replace("{" + key + "}", value)
    return prompt


def make_workspace(case: dict, out: Path, cli: Path) -> tuple[Path, list[dict]]:
    out.mkdir(parents=True)
    rooms = build_flat(case, out)
    if case.get("budget_dram"):
        (out / "budget.json").write_text(json.dumps({"budget_dram": int(case["budget_dram"])}) + "\n")
    (out / "draft.json").write_text('{"items": []}\n')
    (out / "brief.txt").write_text(case["request"] + "\n")
    link_tools(out, cli)
    suffix = None
    if case.get("image"):
        image = SPIKE / case["image"]
        suffix = image.suffix
        shutil.copyfile(image, out / ("inspiration" + suffix))
    (out / "AGENTS.md").write_text(fill_prompt(case, rooms, suffix))
    return out, rooms


def private_home(tool_mode: str, home: Path | None = None) -> tuple[Path, dict]:
    """Isolated CODEX_HOME: auth + caches only, so ~/.codex/config.toml never leaks into the measurement.
    `home` keeps it at a caller's path (the service keeps one per conversation so threads resume)."""
    source = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    if home is None:
        home = Path(tempfile.mkdtemp(prefix="varpet-spike-home-"))
    else:
        home.mkdir(parents=True, exist_ok=True)
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


SUBAGENT_SLOTS = 4


def codex_config(effort: str, sandbox: str, network: bool, extra: dict, *, subagents: str | None = None,
                 subagent_effort: str | None = None) -> dict:
    """subagents: developer instructions for room sub-agents; set, it turns on spawn_agent/wait_agent (multi-agent v2)."""
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
    if subagents:
        config["features"]["multi_agent_v2"] = {"enabled": True, "max_concurrent_threads_per_session": SUBAGENT_SLOTS,
                                                "subagent_developer_instructions": subagents}
        config["agents"] = {"default_subagent_reasoning_effort": subagent_effort or effort}
        config["approval_policy"] = "never"
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


def turn_text(case: dict) -> str:
    return f"Customer request: {case['request']}\nWork in this directory as your instructions describe."


def followup_text(answer: str) -> str:
    return (f"Customer follow-up: {answer}\nContinue the design as your instructions describe, following this answer; "
            "if you already designed, change only what this asks and keep everything else.")


def is_question(final: str | None, workspace: Path) -> bool:
    """The designer stopped to ask the customer (empty draft, a question as its final message)."""
    draft, _ = read_draft(workspace)
    items = (draft or {}).get("items", []) if isinstance(draft, dict) else []
    return not items and bool(final and "?" in final)


class Session:
    """One designer thread kept open across turns (initial request, scripted follow-ups, critic fixes)."""

    def __init__(self, workspace: Path, args, events_path: Path, parallel: bool = False):
        self.workspace, self.args, self.events_path = workspace, args, events_path
        self.home, self.extra = private_home(args.tool_mode)
        subagents = (RUN / "SUBAGENT.md").read_text() if parallel else None
        self.parallel = parallel
        self.config = codex_config(args.effort, args.sandbox, not args.no_network, self.extra, subagents=subagents,
                                   subagent_effort=getattr(args, "subagent_effort", None))
        self.counts, self.commands, self.images, self.tools = Counter(), [], [], []
        self.usage = None
        self.turns: list[dict] = []
        self.started = time.monotonic()
        self.epoch = time.time()

    def __enter__(self):
        from openai_codex import Codex, CodexConfig, ApprovalMode, Sandbox
        sdk = CodexConfig(cwd=str(self.workspace), env={"CODEX_HOME": str(self.home)},
                          config_overrides=tuple(k + "=" + toml(v) for k, v in self.config.items()))
        self.codex = Codex(sdk).__enter__()
        self.log = self.events_path.open("w")
        self.skills_enabled = disable_skills(self.codex, str(self.workspace))
        self.thread = self.codex.thread_start(model=MODEL, approval_mode=ApprovalMode.deny_all,
                                              sandbox=Sandbox(self.args.sandbox), cwd=str(self.workspace),
                                              developer_instructions=(self.workspace / "AGENTS.md").read_text())
        return self

    def __exit__(self, *exc):
        try:
            self.log.close()
            self.codex.__exit__(*exc)
        finally:
            shutil.rmtree(self.home, ignore_errors=True)

    def turn(self, turn_input, label: str) -> dict:
        from openai_codex import ApprovalMode
        from openai_codex.generated.v2_all import ReasoningEffort
        final = completed = None
        began = time.monotonic()
        # No per-turn sandbox: the SDK's turn preset sends workspaceWrite with networkAccess=false,
        # overriding sandbox_workspace_write.network_access from the config.
        handle = self.thread.turn(turn_input, effort=ReasoningEffort(self.args.effort),
                                  approval_mode=ApprovalMode.deny_all)
        timer = threading.Timer(self.args.timeout, handle.interrupt)
        timer.start()
        try:
            for event in handle.stream():
                payload = event.payload.model_dump(mode="json", by_alias=True)
                self.log.write(json.dumps({"t": round(time.monotonic() - self.started, 3), "turn": label,
                                           "method": event.method, "payload": payload}, ensure_ascii=False) + "\n")
                if event.method == "item/completed":
                    item = payload.get("item", {})
                    kind = item.get("type")
                    self.counts[kind] += 1
                    if kind == "commandExecution":
                        self.commands.append({"command": item.get("command"), "exit": item.get("exitCode"),
                                              "ms": item.get("durationMs")})
                    elif kind == "imageView":
                        self.images.append(item.get("path"))
                    elif kind in ("mcpToolCall", "dynamicToolCall"):
                        self.tools.append(item.get("tool"))
                    elif kind == "agentMessage" and item.get("phase") in (None, "final_answer"):
                        final = item.get("text")
                elif event.method == "thread/tokenUsage/updated":
                    self.usage = payload.get("tokenUsage", {}).get("total")
                elif event.method == "turn/completed":
                    completed = payload.get("turn", {})
        finally:
            timer.cancel()
        seconds = time.monotonic() - began
        status = (completed or {}).get("status", "missing_completion")
        if seconds >= self.args.timeout:
            status = "timeout"
        record = {"label": label, "status": status, "error": (completed or {}).get("error"),
                  "seconds": round(seconds, 1), "final_message": final,
                  "tokens_total": (self.usage or {}).get("totalTokens")}
        self.turns.append(record)
        return record

    def summary(self) -> dict:
        ignored = {"agentMessage", "reasoning", "userMessage", None}
        last = self.turns[-1] if self.turns else {}
        return {"parallel": self.parallel, "tool_mode": self.args.tool_mode, "original_tool_mode": self.extra.get("original_tool_mode"),
                "sandbox": self.args.sandbox, "network": not self.args.no_network, "config": self.config,
                "skills_enabled": getattr(self, "skills_enabled", None), "thread_id": getattr(self, "thread", None) and self.thread.id,
                "status": last.get("status", "missing_completion"), "error": last.get("error"),
                "wall_seconds": round(time.monotonic() - self.started, 1), "usage": self.usage, "turns": self.turns,
                "tool_calls": {"total": sum(n for k, n in self.counts.items() if k not in ignored),
                               "by_type": dict(self.counts), "commands": self.commands,
                               "images_viewed": self.images, "tools": self.tools},
                "final_message": last.get("final_message"), "milestones": milestones(self.workspace, self.epoch)}


def milestones(workspace: Path, epoch: float) -> dict:
    """Seconds from the first turn to the first room render and first room check OK (main thread or sub-agents),
    from ./varpet's .varpet-log.jsonl; per room, the last check."""
    out: dict = {"first_room_render_s": None, "first_room_ok_s": None, "rooms": {}}
    try:
        lines = [json.loads(line) for line in (workspace / ".varpet-log.jsonl").read_text().splitlines() if line.strip()]
    except (OSError, ValueError):
        return out
    for entry in lines:
        if entry.get("event") != "end" or entry.get("exit") != 0:
            continue
        t = round(entry["t"] - epoch, 1)
        room = entry.get("part")
        if entry.get("cmd") == "render-view" and "--room" in " ".join(entry.get("args") or []) + (" --room" if room else ""):
            out["first_room_render_s"] = out["first_room_render_s"] or t
        if entry.get("cmd") == "check" and room:
            out["first_room_ok_s"] = out["first_room_ok_s"] or t
            out["rooms"][room] = t
    return out


def run_thread(workspace: Path, case: dict, args, events_path: Path, result: dict) -> None:
    """Initial turn, each --followup, then up to --critic-rounds of independent critique + fix turns.
    Updates `result` as it goes so a crash still leaves what ran."""
    from openai_codex import LocalImageInput, TextInput
    first = turn_text(case)
    turn_input = [LocalImageInput(path=str(SPIKE / case["image"])), TextInput(text=first)] if case.get("image") else first
    brief = case["request"]
    rooms = json.loads((workspace / "scene.json").read_text())["rooms"]
    parallel = args.parallel == "on" or (args.parallel == "auto" and len(scope(case, rooms)) > 1)
    with Session(workspace, args, events_path, parallel) as session:
        try:
            last = session.turn(turn_input, "request")
            result["question"] = last["final_message"] if is_question(last["final_message"], workspace) else None
            answers = ([args.if_asked] if args.if_asked and result["question"] else []) + list(args.followup or [])
            for n, answer in enumerate(answers, 1):
                if last["status"] != "completed":
                    break
                brief += f"\nCustomer follow-up: {answer}"
                (workspace / "brief.txt").write_text(brief + "\n")
                last = session.turn(followup_text(answer), f"followup-{n}")
            result["critic"] = critic_loop(session, workspace, brief, args, last)
        finally:
            result.update(session.summary())


def critic_loop(session: Session, workspace: Path, brief: str, args, last: dict) -> dict:
    """critique -> fix turn, at most args.critic_rounds times; skipped for a question or a failed turn."""
    record = {"rounds": [], "skipped": None}
    if args.no_critic or args.critic_rounds <= 0:
        record["skipped"] = "disabled"
        return record
    if last["status"] != "completed":
        record["skipped"] = f"designer turn {last['status']}"
        return record
    if is_question(last["final_message"], workspace):
        record["skipped"] = "designer asked a question"
        return record
    critic = critic_module()
    reply = None
    for n in range(1, args.critic_rounds + 1):
        began = time.monotonic()
        issues = critic.critique(workspace, brief, None, n, context=reply)
        round_record = {"round": n, "issues": issues, "critic_seconds": round(time.monotonic() - began, 1)}
        try:
            detail = json.loads((workspace / "critic" / f"round-{n}" / "critic.json").read_text())
            round_record["critic_tokens"] = sum(((room.get("usage") or {}).get("total") or {}).get("totalTokens") or 0
                                                for room in detail.get("rooms", {}).values())
        except (OSError, ValueError):
            pass
        record["rounds"].append(round_record)
        serious = critic.serious(issues)
        if not serious:
            break
        text = critic.feedback(serious)
        rooms_hit = sorted({i["room"] for i in serious})
        if session.parallel and len(rooms_hit) > 1:
            text += ("\nThese are in several rooms: fix them in parallel, one sub-agent per room (fork_turns \"all\"; the "
                     "message lists that room's issues and says to fix only those with `./varpet ... --part <room id>`), fix "
                     "anything across rooms yourself, wait for all, then `./varpet merge`.")
        fix = session.turn(text, f"critic-fix-{n}")
        round_record["fix"] = {k: fix[k] for k in ("status", "seconds", "final_message")}
        reply = fix["final_message"]
        if fix["status"] != "completed":
            break
    return record


_critic = None


def critic_module():
    global _critic
    if _critic is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location("varpet_spike_critic", RUN / "critic.py")
        _critic = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_critic)
    return _critic


def varpet(workspace: Path, *argv: str) -> dict:
    try:
        result = subprocess.run([str(workspace / "varpet"), *argv], cwd=workspace, capture_output=True,
                                text=True, timeout=300)
        return {"argv": list(argv), "exit": result.returncode, "stdout": result.stdout[-4000:],
                "stderr": result.stderr[-2000:]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"argv": list(argv), "exit": None, "error": str(error)}


def furnished_rooms(workspace: Path) -> list[str]:
    """Rooms with draft items, in scene order."""
    draft, _ = read_draft(workspace)
    items = (draft or {}).get("items", []) if isinstance(draft, dict) else []
    used = {i.get("room_id") for i in items if isinstance(i, dict)}
    return [r["id"] for r in json.loads((workspace / "scene.json").read_text())["rooms"] if r["id"] in used]


def final_report(workspace: Path, case: dict) -> dict:
    """check, whole-flat plan, a plan per furnished room, and report/: overview + eye + evening per furnished room
    plus flat-overview and flat-top."""
    rooms = furnished_rooms(workspace)
    return {"check": varpet(workspace, "check"),
            "plan": varpet(workspace, "render-plan", "final-plan.png"),
            "plan_rooms": {room: varpet(workspace, "render-plan", f"final-plan-{room}.png", "--room", room) for room in rooms},
            "report_angles": report_angles(workspace / "scene.json", workspace / "draft.json", workspace / "report", rooms)}


def report_angles(scene: Path, draft: Path, out_dir: Path, rooms: list[str]) -> dict:
    """run/report.ts: every listed room (none: the whole flat only) plus the whole-flat shots."""
    out_dir.mkdir(exist_ok=True)
    try:
        result = subprocess.run([str(TSX), str(RUN / "report.ts"), str(scene), str(draft), str(out_dir), *rooms],
                                capture_output=True, text=True, timeout=300 + 120 * len(rooms))
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


def read_text(path: Path) -> str | None:
    try:
        return path.read_text()
    except OSError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", required=True, help="case id from run/cases.json")
    parser.add_argument("--cases", type=Path, default=RUN / "cases.json", help="cases file (default run/cases.json)")
    parser.add_argument("--effort", default="medium", choices=("low", "medium", "high"))
    parser.add_argument("--tool-mode", default="default",
                        help="'default' keeps the model's tool_mode (code_mode_only); 'direct' exposes exec_command/view_image as plain tools")
    parser.add_argument("--sandbox", default="workspace-write", choices=("workspace-write", "full-access"))
    parser.add_argument("--no-network", action="store_true", help="deny network inside the sandbox")
    parser.add_argument("--timeout", type=float, default=1500.0, help="wall seconds before the turn is interrupted")
    parser.add_argument("--cli", type=Path, default=SPIKE / "cli.ts", help="CLI to expose (stub for plumbing tests)")
    parser.add_argument("--no-render", action="store_true", help="skip the final check/render report")
    parser.add_argument("--followup", action="append", help="a scripted customer answer sent as the next turn on the same thread (repeatable)")
    parser.add_argument("--if-asked", help="the customer's answer, sent only when the first turn ends with a question")
    parser.add_argument("--critic-rounds", type=int, default=2, help="independent critic rounds after the design (default 2)")
    parser.add_argument("--no-critic", action="store_true", help="skip the critic")
    parser.add_argument("--parallel", default="auto", choices=("auto", "on", "off"),
                        help="room sub-agents (spawn_agent, run/SUBAGENT.md); auto = on for multi-room cases")
    parser.add_argument("--subagent-effort", choices=("low", "medium", "high"), help="sub-agent effort (default: --effort)")
    args = parser.parse_args()
    case = load_case(args.case, args.cases)
    if not args.cli.exists():
        raise SystemExit(f"{args.cli} does not exist yet")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    workspace, rooms = make_workspace(case, SPIKE / "out" / case["id"] / stamp, args.cli)
    print(f"workspace: {workspace}", flush=True)
    result = {"case": case["id"], "request": case["request"], "image": case.get("image"), "model": MODEL,
              "effort": args.effort, "workspace": str(workspace), "flat": case.get("flat", "avani"),
              "rooms": scope(case, rooms), "budget_dram": case.get("budget_dram"),
              "scene_sha256": hashlib.sha256((workspace / "scene.json").read_bytes()).hexdigest()}
    if not args.no_render:
        result["warmup"] = warm_renderer(workspace, scope(case, rooms)[0])
    try:
        run_thread(workspace, case, args, workspace / "events.jsonl", result)
    except Exception as error:  # record, then still report what the workspace holds
        result.update(status="error", error=f"{type(error).__name__}: {error}")
    draft, draft_error = read_draft(workspace)
    items = (draft or {}).get("items", []) if isinstance(draft, dict) else []
    result.update(draft=draft, draft_error=draft_error, item_count=len(items),
                  total_price=sum(i.get("price") or 0 for i in items if isinstance(i, dict)),
                  plan=read_text(workspace / "plan.md"), missing=read_text(workspace / "missing.md"))
    if not args.no_render:
        result["report"] = final_report(workspace, case)
    (workspace / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    usage = result.get("usage") or {}
    critic = result.get("critic") or {}
    print(json.dumps({k: result.get(k) for k in ("status", "error", "wall_seconds", "item_count", "total_price")}
                     | {"question": bool(result.get("question")), "turns": [(t["label"], t["seconds"]) for t in result.get("turns") or []],
                        "critic": [(r["round"], len(r["issues"]), len([i for i in r["issues"] if i["severity"] in ("blocker", "major")]))
                                   for r in critic.get("rounds") or []] or critic.get("skipped")}
                     | {"tokens": {k: usage.get(k) for k in ("inputTokens", "cachedInputTokens", "outputTokens",
                                                              "reasoningOutputTokens")},
                        "tool_calls": (result.get("tool_calls") or {}).get("by_type")}, indent=1), flush=True)
    print(f"result: {workspace / 'result.json'}", flush=True)
    return 0 if result.get("status") == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
