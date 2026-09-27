#!/usr/bin/env python3
"""Recorded designer runs -> a session the editor can replay (apps/editor/public/demo-sessions/<name>.json).

    python3 tools/demo_session.py <recordings-dir> <flat.json> <name> --title "Sunday Towers, 188 m²" [--out DIR]

<recordings-dir> is the designer service's VARPET_RECORD_DIR (tools/demo_rehearse.py --record sets it): one NDJSON
file per request, `{t, record}` lines, the final reply and the design last. The session keeps the turns of one
conversation up to and including its first proposal (a question and its answer included), exactly as streamed:
progress lines, render previews, room previews (partials), the question and the proposal. Nothing is invented; the
editor plays it at 4-10x with the recorded times on the clock. Heartbeat repeats are dropped."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

MAX_BYTES = 3_000_000


def turns_of(directory: Path) -> tuple[list[dict], str, dict | None, str]:
    files = sorted(directory.glob("*.ndjson"), key=lambda path: path.stat().st_mtime)
    by_conversation: dict[str, list[list[dict]]] = {}
    for path in files:
        lines = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        conversation = path.stem.rsplit("-", 1)[0]
        by_conversation.setdefault(conversation, []).append(lines)
    for conversation, requests in by_conversation.items():
        turns, design, recorded = [], None, ""
        for lines in requests:
            head = lines[0]["record"]
            recorded = recorded or head.get("at", "")
            events, previous = [], None
            for line in lines[1:]:
                record = line["record"]
                if record.get("type") == "design":
                    design = {key: record[key] for key in ("draft", "owned", "requests")}
                    continue
                if record.get("type") == "progress" and previous == record.get("message"):
                    continue
                previous = record.get("message") if record.get("type") == "progress" else None
                events.append({"t": line["t"], "record": record})
            final = events[-1]["record"] if events else {}
            turns.append({"request": head["request"], "seconds": events[-1]["t"] if events else 0, "events": events,
                          **({"image": head["image"]} if head.get("image") else {})})
            if final.get("type") == "proposal":
                return turns, conversation, design, recorded
            if final.get("type") not in ("question", "message"):
                break
    raise SystemExit(f"no conversation in {directory} reached a proposal")


def shrink(turns: list[dict]) -> None:
    """Keep the session small: drop every other render preview until it fits (partials and the proposal stay)."""
    def size() -> int:
        return len(json.dumps(turns))
    while size() > MAX_BYTES:
        previews = [(turn, event) for turn in turns for event in turn["events"] if event["record"].get("type") == "preview"]
        if len(previews) < 2:
            break
        for turn, event in previews[1::2]:
            turn["events"].remove(event)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("recordings", type=Path)
    parser.add_argument("flat", type=Path)
    parser.add_argument("name")
    parser.add_argument("--title", required=True)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "apps/editor/public/demo-sessions")
    args = parser.parse_args()
    turns, conversation, design, recorded = turns_of(args.recordings)
    shrink(turns)
    session = {"format": "varpet.designer-session", "version": 1, "name": args.name, "title": args.title,
               "recordedAt": recorded, "flat": args.flat.stem, "scene": json.loads(args.flat.read_text()),
               "turns": turns, "conversationId": conversation, **({"design": design} if design else {})}
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / f"{args.name}.json"
    target.write_text(json.dumps(session, ensure_ascii=False, separators=(",", ":")))
    seconds = sum(turn["seconds"] for turn in turns)
    print(json.dumps({"session": str(target), "bytes": target.stat().st_size, "turns": len(turns),
                      "recorded_seconds": round(seconds, 1)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
