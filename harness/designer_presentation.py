"""Presentation only: accepted operations, rationale and eval scores stay untouched."""
from __future__ import annotations

import math
import re


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _n(value):
    return f"{value:,.2f}".rstrip("0").rstrip(".")


def _piece(name, kind="piece"):
    name = str(name).lower()
    for pattern, label in [(r"coffee table", "coffee table"), (r"armchair", "armchair"),
                           (r"sofa|loveseat", "sofa"), (r"chair|recliner", "chair"),
                           (r"wardrobe", "wardrobe"), (r"cabinet", "cabinet"),
                           (r"desk", "desk"), (r"table", "table"), (r"bed\b", "bed"),
                           (r"shelf|bookcase", "shelf"), (r"rug", "rug"), (r"lamp", "lamp")]:
        if re.search(pattern, name):
            return label
    return kind if kind in {"sofa", "chair", "bed", "table", "cabinet", "shelf", "rug", "plant", "lamp"} else "piece"


def format_presentation(saved, scene, translated_proposal, request):
    """Return bounded display fields, never a command or a changed grading result.

    Location claims require accepted intent, not a word in the customer's request.
    Numbers come only from the accepted score; no new geometry or model call runs.
    """
    ops = saved.get("ops", [])
    if not ops:
        return {"title": translated_proposal["title"], "description": translated_proposal["description"]}
    intent, score = saved.get("intent", {}), saved.get("score", {})
    before, after = score.get("before", {}), score.get("after", {})
    adds = [op["item"] for op in ops if op.get("type") == "add"]
    moves = [op for op in ops if op.get("type") == "move"]
    removes = [op for op in ops if op.get("type") == "remove"]
    colours = [op for op in ops if op.get("type") == "color"]
    changed = {op.get("id") for op in ops} | {item.get("id") for item in adds}
    objects = {item["id"]: item for item in scene.get("objects", [])}
    room_id = intent.get("room_id")
    if not room_id and adds and len({item.get("room_id") for item in adds}) == 1:
        room_id = adds[0].get("room_id")
    room = next((room for room in scene.get("rooms", []) if room.get("id") == room_id), None)
    if room is None:
        named_rooms = [room for room in scene.get("rooms", [])
                       if room.get("name") and re.search(r"\b" + re.escape(room["name"]) + r"\b", request, re.I)]
        if len(named_rooms) == 1:
            room = named_rooms[0]
            room_id = room["id"]
    room_name = re.sub(r"\s+", " ", str(room.get("name", "room"))).strip().lower()[:70] if room else "room"
    room_name = room_name.replace(" & ", " and ")
    if room_name in {"living and dining", "living/dining"}:
        room_name = "living and dining area"
    location = f"the {room_name}"
    near_ids = {pref.get("item_id") for pref in intent.get("preferences", []) if pref.get("type") == "near_window"}
    reading = len(adds) == 1 and adds[0].get("kind") == "chair" and bool(re.search(r"read|armchair", request, re.I))
    by_window = reading and adds[0].get("id") in near_ids
    only_colour = bool(colours) and len(colours) == len(ops)
    wall_colour = any(op.get("target") == "wall" for op in colours)
    sentences, notes = [], []

    if reading:
        title = "A reading corner by the window" if by_window else f"A reading corner in {location}"
        chair = _piece(adds[0].get("name", ""), "chair")
        sentences.append(f"I’ve added a{'n' if chair == 'armchair' else ''} {chair}{' beside the window' if by_window else ''}, giving you a place to settle in with a book.")
    elif adds:
        title = f"New furniture for {location}"
        label = f"a new {_piece(adds[0].get('name', ''), adds[0].get('kind'))}" if len(adds) == 1 else f"{len(adds)} new pieces"
        sentences.append(f"I’ve added {label} to {location}.")
    elif only_colour:
        title = f"Fresh colour for {location}"
        wall_count = len({op.get("id") for op in colours if op.get("target") == "wall"})
        target = f"{wall_count} wall {'section' if wall_count == 1 else 'sections'}" if wall_colour else "your furniture"
        sentences.append(f"I’ve given {target} a fresh colour, keeping the layout just as it is.")
    elif moves:
        title = f"More room in {location}" if re.search(r"bigger|open|space", request, re.I) else f"A new layout for {location}"
    elif removes:
        title = f"Less furniture in {location}"
    else:
        title = f"A fresh look for {location}"
        sentences.append("Here’s a new arrangement to try in your room.")

    if moves:
        labels = list(dict.fromkeys(_piece(objects.get(op.get("id"), {}).get("name", "")) for op in moves))
        names = " and ".join(labels) if len(labels) <= 2 else ", ".join(labels[:-1]) + " and " + labels[-1]
        sentences.append(f"I’ve moved the {names} into new positions.")
    if removes:
        sentences.append(f"I’ve taken {len(removes)} {'piece' if len(removes) == 1 else 'pieces'} out of the layout.")
    if colours and not only_colour:
        sentences.append(f"I’ve also updated {'the wall colour' if wall_colour else 'the furniture colour'}.")

    def room_metrics(side):
        return next((room for room in side.get("space", {}).get("rooms", []) if room.get("room_id") == room_id), {})

    old_room, new_room = room_metrics(before), room_metrics(after)
    old_rect = old_room.get("largest_free_rectangle") or {}
    new_rect = new_room.get("largest_free_rectangle") or {}
    old_area, new_area = old_rect.get("area_m2"), new_rect.get("area_m2")
    if not only_colour and _number(old_area) and _number(new_area):
        if new_area > old_area + .005:
            sentences.append(f"Your largest open area grows from {_n(old_area)} to {_n(new_area)} m².")
        elif adds and abs(new_area - old_area) <= .005:
            sentences.append(f"Your largest open area stays at {_n(new_area)} m².")
    cost = score.get("cost_dram")
    if adds and _number(cost) and cost >= 0:
        sentences.append(f"Catalog price: {cost:,.0f} ֏.")
    elif not adds:
        sentences.append("No furniture purchases are needed.")

    warnings = [entry for entry in after.get("function_clearances", [])
                if entry.get("item_id") in changed and entry.get("status") == "warn" and _number(entry.get("clearance_m"))]
    old_free, new_free = old_room.get("free_area_m2"), new_room.get("free_area_m2")
    facing_before = before.get("social_living", {}).get("mean_facing_alignment")
    facing_after = after.get("social_living", {}).get("mean_facing_alignment")
    if wall_colour:
        tradeoff = "the colour covers both sides of each selected wall, including shared walls"
    elif warnings:
        warning = min(warnings, key=lambda entry: entry["clearance_m"])
        side = {"back": "behind", "front": "in front of", "left": "beside", "right": "beside"}.get(warning.get("side"), "around")
        item = next((item for item in adds if item.get("id") == warning.get("item_id")), objects.get(warning.get("item_id"), {}))
        label = _piece(item.get("name", ""), item.get("kind", "piece"))
        tradeoff = f"a tight {round(warning['clearance_m'] * 100)} cm gap {side} the {label}"
    elif adds and _number(old_free) and _number(new_free) and old_free > new_free + .005:
        tradeoff = f"{_n(old_free - new_free)} m² less open floor for the new furniture"
    elif moves and _number(facing_before) and _number(facing_after) and facing_after < facing_before - .01:
        tradeoff = "the seats face each other less directly"
    elif removes:
        tradeoff = "you’ll need somewhere else for the pieces taken out"
    elif moves:
        tradeoff = "changing the familiar positions of your furniture"
    elif adds:
        tradeoff = "making room for an extra piece of furniture"
    elif colours:
        tradeoff = "the finish work still needs to be arranged"
    else:
        tradeoff = "adjusting to a different arrangement"
    sentences.append(f"The trade-off: {tradeoff}.")

    rationale = str(saved.get("rationale", translated_proposal.get("description", "")))
    if rationale.startswith('Partial layout:'):
        title = f"Partial layout for {location}"
        # Do not turn an honest incremental result into a complete-room claim.
        sentences.insert(0, rationale[:2200])
    if adds:
        notes.append("Sample catalog price, not a shop quote." if re.search(r"\bmock\b|sample pric", rationale, re.I)
                     else "Confirm catalog prices with the shop.")
        if intent.get("budget_dram") is None:
            notes.append("Budget not set.")
    if not only_colour and (after.get("daylight", {}).get("status") == "unknown" or re.search(r"(?:solar|north|sun).*?(?:unknown|unverified|unconfirmed)", rationale, re.I)):
        notes.append("Sun direction still needs checking.")
    checks = saved.get("checks", {})
    if not only_colour and (any(entry.get("check") == "door_swing" and entry.get("status") in {"unavailable", "warning"} for entry in checks.get("checks", []))
                           or re.search(r"door[- ](?:sweep|swing).*?(?:unknown|unverified|unconfirmed)", rationale, re.I)):
        notes.append("Door swings still need checking.")
    if any(entry.get("baseline") for entry in checks.get("notes", [])):
        notes.append("Existing access problems remain; this proposal does not make them worse.")
    if colours:
        notes.append("Paint and labour are not priced.")
    result = {"title": title[:160], "description": " ".join(sentences)[:4000]}
    if notes:
        result["notes"] = " ".join(notes)[:1600]
    return result
