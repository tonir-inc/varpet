"""Put the made-to-measure kitchen into the Sunday flat and take the cupboards out.

    python3 apartments/sunday-b12121/kitchen/apply.py

Run after apartments/_svg/build.py (which regenerates scene.furnished.json / startup.json from trace.svg) and after
kitchen/build.py (which writes pieces.json). Edits scene.furnished.json and startup.json in place; idempotent.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
FLAT = HERE.parent

# traced built-in cupboards (project components) and the kitchen fittings the new kitchen replaces
COMPONENTS = {"fx-kitchen-run-1", "fx-kitchen-run-2", "fx-kitchen-run-3", "fx-kitchen-return", "fx-kitchen-sink", "fx-hob",
              "fx-island", "fx-pantry", "fx-hall-wardrobe-1", "fx-bed11-closet", "fx-living-wardrobe", "fx-entry-wardrobe",
              "fx-hall-wardrobe-2", "fx-bed9-closet", "fx-bal4-store"}  # fx-bath5-duct stays: a service duct, not a cupboard
# cabinet-kind furniture (TV console, nightstands) and shelf-kind furniture outside the kitchen (bookcases)
OBJECTS = {"f-tv-unit", "f-bedside-11a", "f-bedside-11b", "f-bedside-6a", "f-bedside-6b", "f-bedside-9a", "f-bedside-9b",
           "f-bookcase-11", "f-bookcase-9", "f-stool-3", "f-entry-wardrobe", "f-wardrobe-11", "f-wardrobe-9"}
# three stools along the island's seating ledge (x = worktop edge 4.424 + 0.10 tuck - half the stool's 0.568 depth)
STOOLS = {"f-stool-0": 5.95, "f-stool-1": 6.65, "f-stool-2": 7.35}
STOOL_X = 4.24
# restylable finishes: role -> glTF material names (the editor also matches Blender '.001' copies). The green lacquer
# is one material for fronts, gables and the hood; the brass is handles and the island tap; the larder has no green.
_RUN = {"fronts": ["paint:#3c5646"], "plinth": ["paint:#1f2621"], "handles": ["metal:#c29d5f"],
        "worktop": ["terrazzo#f3eee6"], "wood": ["oak#c19568"]}
MATERIAL_SLOTS = {
    "varpet:sunday-b12121:kitchen-run": _RUN,
    "varpet:sunday-b12121:kitchen-island": _RUN,
    "varpet:sunday-b12121:kitchen-larder": {k: v for k, v in _RUN.items() if k != "fronts"},
}


def apply(scene: dict, catalog: list | None) -> None:
    pieces = json.loads((HERE / "pieces.json").read_text())
    new_ids = {o["id"] for o in pieces["objects"]}
    project = scene["project"]
    project["components"] = [c for c in project["components"] if c["id"] not in COMPONENTS]
    for key in COMPONENTS | OBJECTS:
        project["metadata"].pop(key, None)
    scene["objects"] = [o for o in scene["objects"] if o["id"] not in OBJECTS | new_ids] + pieces["objects"]
    for o in scene["objects"]:
        if o["id"] in STOOLS:
            o["position"] = [STOOL_X, 0, STOOLS[o["id"]]]
    if catalog is not None:
        for a in pieces["assets"]:
            if a["id"] in MATERIAL_SLOTS:
                a["materialSlots"] = MATERIAL_SLOTS[a["id"]]
        new_assets = {a["id"] for a in pieces["assets"]}
        used = {o["assetId"] for o in scene["objects"]}
        catalog[:] = [a for a in catalog if a["id"] in used and a["id"] not in new_assets] + pieces["assets"]


def main():
    furnished = FLAT / "scene.furnished.json"
    scene = json.loads(furnished.read_text())
    apply(scene, None)
    furnished.write_text(json.dumps(scene, indent=2, ensure_ascii=False) + "\n")
    startup = FLAT / "startup.json"
    data = json.loads(startup.read_text())
    apply(data["scene"], data["catalog"])
    startup.write_text(json.dumps(data))
    print(f"objects {len(data['scene']['objects'])}, components {len(data['scene']['project']['components'])}, "
          f"catalog {len(data['catalog'])}")


main()
