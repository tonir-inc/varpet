#!/usr/bin/env python3
"""Run one demo scenario end to end on one designer thread: the brief, then each scripted follow-up.

    uv run --project ../../../harness python run/scenario.py --scenario orion-t8-family   (from packages/designer/spike)

Scenarios live in run/scenarios.json: a spike case (flat, rooms, budget_dram, image, request) plus `followups`
([{text, budget_dram?}]) and `if_asked` (the answer sent when the first turn is a question). After every turn:
draft snapshot, check, item count, furniture total, per-turn time/tokens/tool calls, the reply, the whole-flat plan
and overview + eye + evening renders of every furnished room under turn-<n>/. summary.json (no HTML) is rewritten
after each turn; the final design is exported as an editor document for /?open=/demo-flats/<scenario>.json.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import json
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spike  # noqa: E402

RUN, SPIKE, ROOT = spike.RUN, spike.SPIKE, spike.ROOT
DEFAULT_ANSWER = "Use your best judgement and go ahead with the option you think fits us best."


def load_scenario(scenario_id: str, path: Path = RUN / "scenarios.json") -> dict:
    scenarios = json.loads(path.read_text())["scenarios"]
    found = next((s for s in scenarios if s["id"] == scenario_id), None)
    if found is None:
        raise SystemExit(f"unknown scenario {scenario_id}; have {[s['id'] for s in scenarios]}")
    return found


def usage_numbers(usage: dict | None) -> dict:
    usage = usage or {}
    return {k: usage.get(k) or 0 for k in ("totalTokens", "inputTokens", "cachedInputTokens", "outputTokens",
                                           "reasoningOutputTokens")}


def delta(after: dict, before: dict) -> dict:
    return {k: after[k] - before.get(k, 0) for k in after}


def draft_numbers(workspace: Path) -> dict:
    draft, error = spike.read_draft(workspace)
    items = (draft or {}).get("items", []) if isinstance(draft, dict) else []
    items = [i for i in items if isinstance(i, dict)]
    by_room: dict[str, dict] = {}
    for item in items:
        room = by_room.setdefault(item.get("room_id") or "?", {"items": 0, "price": 0})
        room["items"] += 1
        room["price"] += item.get("price") or 0
    return {"item_count": len(items), "total_price": sum(i.get("price") or 0 for i in items), "by_room": by_room,
            "finishes": len((draft or {}).get("finishes") or []), "lights": len((draft or {}).get("lighting") or []),
            "draft_error": error}


DECOR = {"decor", "vase", "candle", "books", "cushion", "throw_blanket", "basket", "tray", "bowl", "lantern", "picture_frame",
         "planter", "plant", "clock", "wall_hanging", "wall_art", "mirror", "rug", "curtain", "blind", "toy"}


def styling(draft: dict) -> dict:
    """Per room: pieces, decor pieces (styling layer: art, textiles, plants, objects) and the wall, floor and accent colours."""
    rooms: dict[str, dict] = {}
    for item in draft.get("items") or []:
        room = rooms.setdefault(item.get("room_id") or "?", {"items": 0, "decor": 0, "walls": None, "accents": [], "floor": None})
        room["items"] += 1
        room["decor"] += item.get("kind") in DECOR
    for finish in draft.get("finishes") or []:
        room = rooms.setdefault(finish.get("room_id") or "?", {"items": 0, "decor": 0, "walls": None, "accents": [], "floor": None})
        colour = finish.get("color") or finish.get("material")
        if finish.get("surface") == "walls":
            room["walls"] = colour
        elif finish.get("surface") == "wall":
            room["accents"].append(colour)
        elif finish.get("surface") == "floor":
            room["floor"] = finish.get("material") or colour
    return rooms


def budget(workspace: Path) -> int | None:
    try:
        return json.loads((workspace / "budget.json").read_text())["budget_dram"]
    except (OSError, ValueError, KeyError):
        return None


def snapshot(workspace: Path, n: int, label: str, record: dict, session: spike.Session, before: dict,
             render: bool) -> dict:
    """Everything a reviewer needs about the design as it stands after turn n."""
    turn_dir = workspace / f"turn-{n}"
    turn_dir.mkdir(exist_ok=True)
    shutil.copyfile(workspace / "draft.json", turn_dir / "draft.json")
    tokens = usage_numbers(session.usage)
    counts = Counter(session.counts)
    ignored = {"agentMessage", "reasoning", "userMessage", None}
    tool_delta = {k: v - before["counts"].get(k, 0) for k, v in counts.items() if k not in ignored and v - before["counts"].get(k, 0)}
    check = spike.varpet(workspace, "check")
    out = {"turn": n, "label": label, "status": record["status"], "error": record.get("error"),
           "seconds": record["seconds"], "tokens": delta(tokens, before["tokens"]), "tokens_cumulative": tokens,
           "tool_calls": tool_delta, "renders_viewed": len(session.images) - before["images"],
           "budget_dram": budget(workspace), **draft_numbers(workspace),
           "styling": styling(spike.read_draft(workspace)[0] or {}),
           "check": {"ok": check.get("exit") == 0, "output": (check.get("stdout") or check.get("error") or "").strip()[-1500:]},
           "reply": record.get("final_message")}
    if render:
        rooms = spike.furnished_rooms(workspace)
        out["plan"] = spike.varpet(workspace, "render-plan", str(turn_dir / "plan.png")).get("exit")
        angles = spike.report_angles(workspace / "scene.json", workspace / "draft.json", turn_dir / "report", rooms)
        out["renders"] = {"exit": angles.get("exit"), "paths": [str(Path(p).relative_to(workspace)) for p in angles.get("paths", [])
                                                                if p.startswith(str(workspace))],
                          "stderr": angles.get("stderr") or angles.get("error")}
    return out


def mark(session: spike.Session) -> dict:
    return {"tokens": usage_numbers(session.usage), "counts": Counter(session.counts), "images": len(session.images)}


def export(workspace: Path, scenario_id: str, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{scenario_id}.json"
    result = subprocess.run([str(spike.TSX), str(RUN / "export-editor-doc.ts"), str(workspace), str(target)],
                            capture_output=True, text=True, timeout=300)
    return {"exit": result.returncode, "path": str(target), "stdout": result.stdout.strip(), "stderr": result.stderr[-1000:]}


def run(scenario: dict, args) -> dict:
    case = {k: scenario[k] for k in ("id", "flat", "rooms", "budget_dram", "image", "request") if k in scenario}
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    workspace, rooms = spike.make_workspace(case, SPIKE / "out" / "scenarios" / scenario["id"] / stamp, SPIKE / "cli.ts")
    print(f"workspace: {workspace}", flush=True)
    summary = {"scenario": scenario["id"], "title": scenario.get("title"), "flat": scenario["flat"],
               "rooms": spike.scope(case, rooms), "image": scenario.get("image"), "model": spike.MODEL,
               "effort": args.effort, "workspace": str(workspace), "request": scenario["request"],
               "followups": scenario.get("followups", []), "turns": []}

    def save():
        (workspace / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))

    render = not args.no_render
    if render:
        summary["warmup"] = spike.warm_renderer(workspace, spike.scope(case, rooms)[0]).get("seconds")
    session_args = SimpleNamespace(tool_mode="default", effort=args.effort, sandbox="workspace-write",
                                   no_network=False, timeout=args.timeout, critic_rounds=args.critic_rounds,
                                   no_critic=args.critic_rounds <= 0, subagent_effort=None)
    # As the service does: several rooms run on parallel room designers, each reviewed by the critic as it finishes
    # (critic.Reviewer), then one cross-room critic pass on the lead thread.
    parallel = args.parallel == "on" or (args.parallel == "auto" and len(spike.scope(case, rooms)) > 1)
    live = parallel and args.critic_rounds > 0
    summary["parallel"] = parallel
    brief = scenario["request"]
    turns: list[tuple[str, object, dict]] = []  # label, input, follow-up entry
    try:
        from contextlib import nullcontext
        critic = spike.critic_module()
        with spike.Session(workspace, session_args, workspace / "events.jsonl", parallel) as session:
            from openai_codex import LocalImageInput, TextInput
            first = spike.turn_text(case)
            turn_input = [LocalImageInput(path=str(SPIKE / case["image"])), TextInput(text=first)] if case.get("image") else first
            plan = [("request", turn_input, {})]
            plan += [(f"followup-{n}", None, entry) for n, entry in enumerate(scenario.get("followups", [])[:args.turns], 1)]
            n = 0
            for label, turn_input, entry in plan:
                if entry:
                    if entry.get("budget_dram"):
                        (workspace / "budget.json").write_text(json.dumps({"budget_dram": int(entry["budget_dram"])}) + "\n")
                    brief += f"\nCustomer follow-up: {entry['text']}"
                    (workspace / "brief.txt").write_text(brief + "\n")
                    turn_input = spike.followup_text(entry["text"])
                before = mark(session)
                reviewer = critic.Reviewer(workspace, brief) if live and label == "request" else None
                if reviewer:
                    reviewer.__enter__()
                record = session.turn(turn_input, label)
                print(f"{label}: {record['status']} in {record['seconds']} s", flush=True)
                # The designer may ask before designing (and ask again after the answer): answer at most twice.
                for n_asked in range(2):
                    if not (label == "request" and record["status"] == "completed" and spike.is_question(record["final_message"], workspace)):
                        break
                    summary.setdefault("questions", []).append(record["final_message"])
                    answer = scenario.get("if_asked", DEFAULT_ANSWER) if n_asked == 0 else DEFAULT_ANSWER + " Design the whole brief now."
                    brief += f"\nCustomer follow-up: {answer}"
                    (workspace / "brief.txt").write_text(brief + "\n")
                    if reviewer:
                        reviewer.brief = brief
                    asked = session.turn(spike.followup_text(answer), f"answer-{n_asked + 1}")
                    record = {**asked, "seconds": round(record["seconds"] + asked["seconds"], 1),
                              "question": " / ".join(summary["questions"])}
                    print(f"answer-{n_asked + 1}: {asked['status']} in {asked['seconds']} s", flush=True)
                if reviewer:  # around the request and any answer turns: the first design happens in one of them
                    reviewer.__exit__(None, None, None)
                    summary["reviews"] = {room: {k: entry.get(k) for k in ("issues", "seconds", "error")}
                                          for room, entry in reviewer.records.items()}
                if label == "request" and record["status"] == "completed" and args.critic_rounds > 0:
                    review = spike.critic_loop(session, workspace, brief, session_args, record, flat=live)
                    summary["critic"] = review
                    fixes = [r["fix"] for r in review.get("rounds", []) if r.get("fix")]
                    record = {**record, "seconds": round(record["seconds"] + sum(f["seconds"] for f in fixes)
                                                         + sum(r["critic_seconds"] for r in review["rounds"]), 1)}
                    if fixes:
                        record["final_message"] = fixes[-1]["final_message"] or record["final_message"]
                n += 1
                shot = snapshot(workspace, n, label, record, session, before, render)
                shot["customer"] = entry.get("text") if entry else scenario["request"]
                if record.get("question"):
                    shot["question"] = record["question"]
                summary["turns"].append(shot)
                save()
                print(json.dumps({k: shot[k] for k in ("label", "status", "seconds", "item_count", "total_price")}
                                 | {"tokens": shot["tokens"]["totalTokens"], "check": shot["check"]["ok"]}), flush=True)
                if record["status"] != "completed":
                    break
            summary["thread"] = {k: v for k, v in session.summary().items() if k in ("thread_id", "wall_seconds", "usage", "status")}
    except Exception as error:  # keep what ran
        summary["error"] = f"{type(error).__name__}: {error}"
    if not args.no_export:
        summary["export"] = export(workspace, scenario["id"], args.export_dir)
    save()
    return summary


def rerender(workspace: Path) -> None:
    """Redraw every turn's renders from its draft snapshot with the current renderer (after a renderer fix)."""
    summary = json.loads((workspace / "summary.json").read_text())
    scene_rooms = [r["id"] for r in json.loads((workspace / "scene.json").read_text())["rooms"]]
    for turn in summary["turns"]:
        turn_dir = workspace / f"turn-{turn['turn']}"
        draft = json.loads((turn_dir / "draft.json").read_text())
        used = {i.get("room_id") for i in draft.get("items", [])}
        rooms = [r for r in scene_rooms if r in used]
        angles = spike.report_angles(workspace / "scene.json", turn_dir / "draft.json", turn_dir / "report", rooms)
        turn["renders"] = {"exit": angles.get("exit"), "paths": [str(Path(p).relative_to(workspace)) for p in angles.get("paths", [])
                                                                 if p.startswith(str(workspace))],
                           "stderr": angles.get("stderr") or angles.get("error"), "rerendered": True}
        print(f"turn {turn['turn']}: {len(turn['renders']['paths'])} renders, exit {angles.get('exit')}", flush=True)
    (workspace / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenario", help="scenario id from run/scenarios.json")
    parser.add_argument("--rerender", type=Path, help="redraw every turn of a finished scenario workspace, then exit")
    parser.add_argument("--scenarios", type=Path, default=RUN / "scenarios.json")
    parser.add_argument("--effort", default="medium", choices=("low", "medium", "high"))
    parser.add_argument("--timeout", type=float, default=None, help="wall seconds per turn (default: the scenario's, else 1500)")
    parser.add_argument("--turns", type=int, default=None, help="send only the first N follow-ups")
    parser.add_argument("--critic-rounds", type=int, default=1, help="critic rounds after the first design (default 1, as the service)")
    parser.add_argument("--parallel", default="auto", choices=("auto", "on", "off"),
                        help="parallel room designers on the first design (auto: when the scenario has several rooms)")
    parser.add_argument("--no-render", action="store_true")
    parser.add_argument("--no-export", action="store_true")
    parser.add_argument("--export-dir", type=Path, default=ROOT / "apps/editor/public/demo-flats")
    parser.add_argument("--rooms", nargs="+", help="override the scenario's rooms (smoke runs)")
    args = parser.parse_args()
    if args.rerender:
        rerender(args.rerender.resolve())
        return 0
    if not args.scenario:
        parser.error("--scenario or --rerender is required")
    scenario = load_scenario(args.scenario, args.scenarios)
    if args.rooms:
        scenario = {**scenario, "rooms": args.rooms}
    if args.timeout is None:
        args.timeout = float(scenario.get("timeout_s", 1500))
    summary = run(scenario, args)
    print(f"summary: {Path(summary['workspace']) / 'summary.json'}", flush=True)
    return 0 if summary["turns"] and all(t["status"] == "completed" for t in summary["turns"]) and not summary.get("error") else 1


if __name__ == "__main__":
    sys.exit(main())
