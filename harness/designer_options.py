"""Bounded parallel layout exploration, consuming accepted MCP proposals only.

The injected runner owns its SDK process group and must stop it when cancel_event
is set or the shared monotonic deadline expires. No model or network dependency
is imported here; the same orchestration is exercised by offline tests.
"""

from __future__ import annotations

from copy import deepcopy
import json
import math
import queue
import threading
import time
from typing import Callable


STRATEGIES = ("most_open_floor", "best_daylight_for_work", "social_living")
STRATEGY_LABELS = {
    "most_open_floor": "Most open floor",
    "best_daylight_for_work": "Daylight for work",
    "social_living": "Social living",
}
STRATEGY_INSTRUCTIONS = {
    "most_open_floor": (
        "Maximize the living room's largest usable free rectangle, then free floor area, "
        "while keeping every door and furniture access path safe. Compare measured score_layout numbers."
    ),
    "best_daylight_for_work": (
        "Prioritize existing desks near a window with light arriving from the side. "
        "Call sun and compare score_layout.daylight_for_work, preserving safe paths. "
        "If there is no desk, use an existing reading chair near a window and state that "
        "desk daylight is unavailable. Never add a desk unless the customer asked for one. "
        "A distance/alignment score is a geometric daylight proxy, not measured illumination."
    ),
    "social_living": (
        "Prioritize existing seating facing other seating within conversation distance, "
        "and a sofa-to-coffee-table gap of 0.36–0.46 m when those pieces exist. "
        "Compare score_layout.social_living and function clearances, preserving safe paths."
    ),
}


def explorer_request(request: str, strategy: str) -> str:
    """One customer task and one strategy, with the ordinary tools and skill."""
    return (request + "\n\nEXPLORER STRATEGY: " + STRATEGY_LABELS[strategy] + "\n"
            + STRATEGY_INSTRUCTIONS[strategy]
            + "\nReturn one distinct checked layout. Keep the customer's requested room and intent. "
            "Use only the existing designer tools and interior-design-rules skill. "
            "Keep existing furniture unless the customer explicitly requested adds/removals. "
            "Work within the time budget: move only strategy-relevant pieces unless a hard check requires another move. "
            "Request joint placements for interacting furniture. Batch candidates already contain check and score results; "
            "use those numbers and propose the best complete returned ops immediately, without redundant check/score calls. "
            "A rejected proposal or a prose claim is not a returned option. "
            "Never apply the proposal: it remains a preview awaiting the customer's yes.")


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _finite_json(value) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(_finite_json(item) for item in value.values())
    if isinstance(value, list):
        return all(_finite_json(item) for item in value)
    return True


def _valid_metrics(metrics) -> bool:
    if not isinstance(metrics, dict):
        return False
    space = metrics.get("space")
    if not isinstance(space, dict) or not _number(space.get("free_area_m2")):
        return False
    rooms = space.get("rooms")
    if not isinstance(rooms, list):
        return False
    for room in rooms:
        if not isinstance(room, dict) or not _number(room.get("free_area_m2")):
            return False
        rectangle = room.get("largest_free_rectangle")
        if rectangle is not None and (not isinstance(rectangle, dict) or not _number(rectangle.get("area_m2"))):
            return False
        if not isinstance(room.get("walkways"), list):
            return False
        if any(not isinstance(path, dict) or not _number(path.get("width_m")) for path in room["walkways"]):
            return False
    return isinstance(metrics.get("function_clearances"), list)


def _valid_proposal(proposal) -> bool:
    if not isinstance(proposal, dict) or not isinstance(proposal.get("id"), str):
        return False
    if not isinstance(proposal.get("ops"), list) or not proposal["ops"]:
        return False
    if any(not isinstance(op, dict) or op.get("type") not in ("move", "add", "remove", "rotate") for op in proposal["ops"]):
        return False
    if any(not isinstance(proposal.get(field), dict) or proposal[field].get("ok") is not True
           for field in ("checks", "request_check")):
        return False
    if proposal.get("requires_user_acceptance") is not True or proposal.get("application_status") != "not_applied":
        return False
    score = proposal.get("score")
    return (isinstance(score, dict) and _valid_metrics(score.get("before"))
            and _valid_metrics(score.get("after")) and _number(score.get("cost_dram"))
            and _finite_json(proposal))


def accepted_proposals(events: list[dict]) -> list[dict]:
    """Read accepted tool payloads; model final text is never a trust source."""
    proposals = []
    for record in events:
        if not isinstance(record, dict):
            continue
        event = record.get("event", record)
        if not isinstance(event, dict) or event.get("method") != "item/completed":
            continue
        payload = event.get("payload")
        item = payload.get("item") if isinstance(payload, dict) else None
        if not isinstance(item, dict) or item.get("type") != "mcpToolCall":
            continue
        if item.get("server") != "varpet-designer" or item.get("tool") != "propose":
            continue
        if item.get("status") != "completed" or item.get("error"):
            continue
        result = item.get("result")
        if not isinstance(result, dict) or result.get("isError") is True:
            continue
        values = [result["structuredContent"]] if isinstance(result.get("structuredContent"), dict) else []
        for content in result.get("content", []) or []:
            if not isinstance(content, dict) or content.get("type") != "text":
                continue
            try:
                values.append(json.loads(content.get("text", "")))
            except (TypeError, ValueError):
                continue
        for value in values:
            if not isinstance(value, dict) or value.get("ok") is not True:
                continue
            proposal = value.get("proposal")
            if _valid_proposal(proposal) and value.get("proposal_id") == proposal["id"]:
                proposals.append(deepcopy(proposal))
                break
    return proposals


def layout_key(proposal: dict, scene: dict | None = None) -> str:
    """Compare final furniture geometry when the immutable snapshot is available.

    Item identity, room, kind, pose, size and SKU remain significant. Intermediate
    moves, no-op moves, whole-turn rotations and display names do not. Without a
    scene, retain the legacy operation key, ignoring cross-item operation order.
    """
    if scene is not None:
        items = {item["id"]: deepcopy(item) for item in scene.get("items", [])}
        fixed = {item["id"]: deepcopy(item) for item in scene.get("fixed", [])}
        for op in proposal["ops"]:
            if op["type"] == "add":
                items[op["item"]["id"]] = deepcopy(op["item"])
            elif op["type"] == "remove":
                items.pop(op["id"], None)
            elif op["type"] == "move":
                target = items.setdefault(op["id"], {"id": op["id"]})
                for field in ("pos", "rot", "room_id"):
                    if field in op:
                        target[field] = deepcopy(op[field])

        def geometry(item: dict) -> dict:
            result = {field: item[field] for field in ("id", "room_id", "kind", "sku") if field in item}
            for field in ("pos", "size"):
                if field in item:
                    result[field] = [round(float(value), 10) for value in item[field]]
            if "rot" in item:
                result["rot"] = round(float(item["rot"]) % 360, 10) % 360
            return result

        final_items = {**items, **fixed}
        final = [geometry(final_items[item_id]) for item_id in sorted(final_items)]
        return json.dumps(final, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    by_item = {}
    for op in proposal["ops"]:
        item_id = op.get("id", op.get("item", {}).get("id", ""))
        by_item.setdefault(item_id, []).append(op)
    return json.dumps(by_item, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _metric_numbers(metrics: dict, room_id: str | None, items: dict) -> dict:
    rooms = [room for room in metrics["space"]["rooms"] if room_id is None or room.get("room_id") == room_id]
    rectangles = [room["largest_free_rectangle"]["area_m2"] for room in rooms if room.get("largest_free_rectangle")]
    paths = [path["width_m"] for room in rooms for path in room["walkways"]]
    clearances = [value for value in metrics["function_clearances"] if isinstance(value, dict)
                  and (room_id is None or items.get(value.get("item_id"), {}).get("room_id", room_id) == room_id)]
    coffee = [value["clearance_m"] for value in clearances
              if value.get("function") == "sofa_coffee" and _number(value.get("clearance_m"))]
    daylight, social = metrics.get("daylight_for_work"), metrics.get("social_living")
    return {
        "free_area_m2": sum(room["free_area_m2"] for room in rooms),
        "largest_free_rectangle_m2": max(rectangles, default=0),
        "narrowest_walkway_m": min(paths) if paths else None,
        "clearance_warnings": sum(value.get("status") == "warn" for value in clearances),
        "sofa_coffee_gap_m": min(coffee) if coffee else None,
        "daylight_for_work": deepcopy(daylight) if isinstance(daylight, dict) else None,
        "social_living": deepcopy(social) if isinstance(social, dict) else None,
    }


def proposal_metrics(proposal: dict, scene: dict) -> dict:
    room_id = proposal.get("intent", {}).get("room_id")
    items = {item["id"]: item for item in scene.get("items", []) if isinstance(item, dict) and "id" in item}
    for op in proposal["ops"]:
        if op["type"] == "add" and isinstance(op.get("item"), dict):
            items[op["item"]["id"]] = op["item"]
    return {phase: _metric_numbers(proposal["score"][phase], room_id, items) for phase in ("before", "after")}


def _strategy_value(numbers: dict, strategy: str):
    if strategy == "most_open_floor":
        return numbers["largest_free_rectangle_m2"]
    key = "daylight_for_work" if strategy == "best_daylight_for_work" else "social_living"
    metric = numbers.get(key)
    if isinstance(metric, dict) and _number(metric.get("score")):
        return metric["score"]
    if strategy == "social_living" and numbers["sofa_coffee_gap_m"] is not None:
        gap = numbers["sofa_coffee_gap_m"]
        return -max(0, .36 - gap, gap - .46)
    return None


def _rank(candidates: list[dict]) -> list[dict]:
    """Equal-weight observed strategy metrics, min/max normalized across options.

    This is a derived selection rule, not an extra physical score or model vote.
    Unknown or invariant dimensions do not affect the average. Circulation,
    warning count and cost break ties, followed by deterministic strategy order.
    """
    dimensions = []
    for strategy in STRATEGIES:
        values = [_strategy_value(candidate["metrics"]["after"], strategy) for candidate in candidates]
        known = [value for value in values if value is not None]
        if len(known) != len(values) or not known or max(known) == min(known):
            continue
        low, high = min(known), max(known)
        dimensions.append([(value - low) / (high - low) for value in values])
    for index, candidate in enumerate(candidates):
        candidate["rank_score"] = sum(dimension[index] for dimension in dimensions) / len(dimensions) if dimensions else 0.0
        candidate["rank_basis"] = "derived: equal mean of varying, available score_layout strategy metrics normalized across accepted options"
    return sorted(candidates, key=lambda candidate: (
        -candidate["rank_score"],
        -(candidate["metrics"]["after"]["narrowest_walkway_m"] or 0),
        candidate["metrics"]["after"]["clearance_warnings"],
        candidate["score"]["cost_dram"],
        STRATEGIES.index(candidate["strategy"]), layout_key(candidate["proposal"])))


def _describe(option: dict) -> str:
    before, after = option["metrics"]["before"], option["metrics"]["after"]
    text = (STRATEGY_LABELS[option["strategy"]] + ": largest clear rectangle "
            + f'{before["largest_free_rectangle_m2"]:.2f} → {after["largest_free_rectangle_m2"]:.2f} m²; '
            + f'free floor {before["free_area_m2"]:.2f} → {after["free_area_m2"]:.2f} m²')
    if after["narrowest_walkway_m"] is not None:
        text += f'; narrowest path {after["narrowest_walkway_m"]:.2f} m'
    if after["sofa_coffee_gap_m"] is not None:
        text += f'; sofa–coffee-table gap {after["sofa_coffee_gap_m"]:.2f} m'
    daylight = after["daylight_for_work"]
    if isinstance(daylight, dict) and _number(daylight.get("score")):
        text += f'; desk daylight geometry score {daylight["score"]:.3f} (a proxy, not illumination)'
    social = after["social_living"]
    if isinstance(social, dict) and _number(social.get("score")):
        text += f'; social seating score {social["score"]:.3f}'
    text += f'; {option["score"]["cost_dram"]:,.0f} ֏. Preview awaiting your acceptance.'
    return text


def _strategy_contrast(options: list[dict]) -> dict:
    comparisons = []
    if len(options) == 2:
        for index, option in enumerate(options):
            strategy = option["strategy"]
            own = _strategy_value(option["metrics"]["after"], strategy)
            other = _strategy_value(options[1 - index]["metrics"]["after"], strategy)
            comparisons.append({"strategy": strategy, "selected_value": own, "other_value": other,
                                "leads": own is not None and other is not None and own > other + 1e-9})
    return {"proven": len(comparisons) == 2 and all(value["leads"] for value in comparisons),
            "basis": "derived: each selected layout must lead the other in its assigned strategy's measured score",
            "comparisons": comparisons}


def explore_options(scene: dict, request: str, runner: Callable, timeout: float = 115.0) -> dict:
    """Start exactly three low-effort explorers against independent scene copies.

    Runner keyword contract: scene, request, strategy, effort, deadline,
    cancel_event. Its result contains SDK events plus status/usage_limited/stderr.
    The runner must watch cancel_event during execution, not only after it exits.
    """
    if not _number(timeout) or not 0 < timeout < 120:
        raise ValueError("The options wall budget must be positive and under 120 seconds")
    started = time.monotonic()
    final_deadline = started + timeout
    # Keep cleanup inside the caller's wall budget, allowing watchdogs to kill
    # their child process groups before daemon driver threads are abandoned.
    cleanup_budget = min(.3, timeout / 10)
    deadline = final_deadline - cleanup_budget
    cancelled = threading.Event()
    finished = queue.Queue()

    def run(strategy: str) -> None:
        try:
            result = runner(scene=deepcopy(scene), request=explorer_request(request, strategy),
                            strategy=strategy, effort="low", deadline=deadline, cancel_event=cancelled)
            if not isinstance(result, dict):
                raise TypeError("Explorer runner must return a result dictionary")
        except Exception as error:
            result = {"status": "failed", "error": f"{type(error).__name__}: {error}", "events": []}
        limited = bool(result.get("usage_limited")) or "usage limit" in str(result.get("stderr", "")).lower()
        if limited:
            cancelled.set()
        finished.put((strategy, result, limited))

    threads = [threading.Thread(target=run, args=(strategy,), daemon=True, name="explorer-" + strategy)
               for strategy in STRATEGIES]
    for thread in threads:
        thread.start()
    diagnostics, candidates = [], []
    status = None

    def collect(strategy, result, limited):
        proposals = accepted_proposals(result.get("events", []))
        diagnostics.append({"strategy": strategy, "status": result.get("status", "completed"),
                            "accepted_count": len(proposals), "usage_limited": limited,
                            "error": result.get("error"), "seconds": result.get("seconds"),
                            "usage": result.get("usage"), "thread_id": result.get("thread_id")})
        for proposal in proposals:
            candidates.append({"strategy": strategy, "proposal": proposal,
                               "score": deepcopy(proposal["score"]),
                               "metrics": proposal_metrics(proposal, scene)})

    try:
        for _ in STRATEGIES:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                status = "timeout"
                break
            try:
                strategy, result, limited = finished.get(timeout=remaining)
            except queue.Empty:
                status = "timeout"
                break
            collect(strategy, result, limited)
            if limited:
                status = "usage_limit"
                break
    finally:
        cancelled.set()
        cleanup_deadline = min(final_deadline, time.monotonic() + cleanup_budget)
        for thread in threads:
            remaining = cleanup_deadline - time.monotonic()
            if remaining <= 0:
                break
            thread.join(timeout=remaining)
        while True:
            try:
                strategy, result, limited = finished.get_nowait()
            except queue.Empty:
                break
            collect(strategy, result, limited)
            if limited:
                status = "usage_limit"
    # No executor context manager can extend the wall deadline waiting on a runner.
    # Process-group cleanup is the runner's responsibility and is signalled above.
    # One explorer contributes at most one option, even if it called propose twice.
    by_strategy = []
    for strategy in STRATEGIES:
        returned = [candidate for candidate in candidates if candidate["strategy"] == strategy]
        if returned:
            def strategy_rank(candidate: dict) -> tuple:
                value = _strategy_value(candidate["metrics"]["after"], strategy)
                return (value if value is not None else -math.inf,
                        candidate["metrics"]["after"]["largest_free_rectangle_m2"])
            by_strategy.append(max(returned, key=strategy_rank))
    seen, distinct = set(), []
    for candidate in _rank(by_strategy):
        key = layout_key(candidate["proposal"], scene)
        if key not in seen:
            seen.add(key)
            distinct.append(candidate)
    selected = distinct[:2] if status != "usage_limit" else []
    for option in selected:
        option["explanation"] = _describe(option)
    if status is None or (status == "timeout" and len(selected) == 2):
        status = "completed" if len(selected) == 2 else "partial" if selected else "unresolved"
    contrast = _strategy_contrast(selected)
    response = "\n\n".join(f'{index}. {option["explanation"]}' for index, option in enumerate(selected, 1))
    if len(selected) == 2 and not contrast["proven"]:
        response += "\n\nThe measured comparison does not establish a distinct advantage for both assigned strategies."
    if len(selected) < 2:
        reason = {"usage_limit": "The usage limit stopped all explorers.",
                  "timeout": "The options time budget expired.",
                  "partial": "Only one distinct accepted layout was returned.",
                  "unresolved": "No accepted layout was returned."}[status]
        response = (response + "\n\n" if response else "") + reason + " Two checked options are not yet available."
    return {"status": status, "options": selected, "explorers": diagnostics,
            "strategy_contrast": contrast, "seconds": time.monotonic() - started, "response": response}
