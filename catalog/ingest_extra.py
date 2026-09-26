"""Validate extra models; optionally stage GLBs and upsert catalog rows.

Default dry-run is read-only. Explicit --stage copies valid models even in dry-run;
--apply stages to data/models unless --stage overrides it. No schema changes.
"""
import argparse
from collections import Counter
import json
import math
import os
from pathlib import Path
import re
import shutil

DATA = Path(__file__).resolve().parent / "data"
EXTRA = DATA / "extra"
MODEL_URL = "http://100.107.246.46:8765/models"
COLORS = frozenset("black white grey beige brown red orange yellow green blue purple pink".split())
# ABO's column set, plus the explicitly supplied extra-model fields.
COLUMNS = (
    "id", "source", "source_id", "name", "brand", "description", "product_type", "kind",
    "size_m", "fit_size_m", "size_status", "size_evidence", "listing_size_m", "price",
    "currency", "price_source", "color_text", "color_std", "materials", "styles", "keywords",
    "main_image_url", "image_urls", "glb_url", "license", "raw",
    "colors_img", "tags", "glb_original_url", "glb_web_url", "editor_set",
)
UPSERT = (
    f"insert into item ({', '.join(COLUMNS)}) "
    f"values ({', '.join(['%s'] * len(COLUMNS))}) "
    "on conflict (id) do update set "
    + ", ".join(f"{c}=excluded.{c}" for c in COLUMNS if c != "id")
    + ", ingested_at=now()"
)


def safe_component(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", value) is not None


def model_identity(group, slug):
    """Return stable item ID, staged basename and public URL without I/O."""
    if not safe_component(group) or not safe_component(slug):
        raise ValueError("invalid group or slug")
    filename = f"extra-{group}-{slug}.glb"
    return f"extra:{group}:{slug}", filename, f"{MODEL_URL}/{filename}"


def valid_size(value):
    return (isinstance(value, list) and len(value) == 3
            and all(type(x) in (int, float) and math.isfinite(x) and x > 0 for x in value))


def sizes_match(size, mesh):
    """Compare W/D/H without swapping axes; tolerate roundoff at exactly 1 cm."""
    return valid_size(size) and valid_size(mesh) and all(
        abs(a - b) <= 0.01 or math.isclose(abs(a - b), 0.01, rel_tol=0, abs_tol=1e-12)
        for a, b in zip(size, mesh)
    )


def validate_entry(entry, *, glb_exists):
    """Pure validation: the caller supplies the result of checking the local file."""
    if not isinstance(entry, dict):
        return ["entry must be an object"]
    reasons = []
    if not safe_component(entry.get("slug")):
        reasons.append("invalid slug")
    for field in ("name", "kind", "source_url", "license"):
        if not isinstance(entry.get(field), str) or not entry[field].strip():
            reasons.append(f"missing or invalid {field}")
    glb = entry.get("glb")
    if not isinstance(glb, str) or Path(glb).name != glb or not glb.endswith(".glb"):
        reasons.append("invalid GLB filename")
    if not glb_exists:
        reasons.append("missing GLB file")
    if not valid_size(entry.get("size_m")) or not valid_size(entry.get("mesh_extents_m")):
        reasons.append("invalid size: expected three positive finite dimensions")
    elif not sizes_match(entry["size_m"], entry["mesh_extents_m"]):
        reasons.append("size mismatch > 1 cm")
    colors = entry.get("colors")
    if not isinstance(colors, list) or not colors or any(
        not isinstance(c, str) or c not in COLORS for c in colors
    ):
        reasons.append("bad colour: expected a nonempty list from the BRIEF palette")
    price = entry.get("price_amd")
    if price is None:
        reasons.append("missing price")
    elif type(price) is not int or not 0 < price <= 2_147_483_647:
        reasons.append("invalid price: expected positive whole AMD within PostgreSQL integer range")
    materials = entry.get("materials")
    if not isinstance(materials, list) or any(not isinstance(m, str) or not m.strip() for m in materials):
        reasons.append("invalid materials")
    for field in ("style", "attribution", "notes"):
        if entry.get(field) is not None and not isinstance(entry[field], str):
            reasons.append(f"invalid {field}")
    return reasons


def build_row(group, entry):
    """Map well-formed metadata to a plain row; validation gates ingestion separately."""
    item_id, _, url = model_identity(group, entry["slug"])
    colors = entry["colors"]
    style = entry.get("style")
    license_text = entry["license"]
    if entry.get("attribution"):
        license_text += " — " + entry["attribution"]
    row = dict.fromkeys(COLUMNS)
    row.update(
        id=item_id, source="extra", source_id=entry["slug"], name=entry["name"],
        kind=entry["kind"], size_m=entry["size_m"], fit_size_m=entry["size_m"],
        size_status="confirmed" if sizes_match(entry["size_m"], entry["mesh_extents_m"]) else "estimated",
        size_evidence={"from": "normalised mesh", "mesh_extents_m": entry["mesh_extents_m"],
                       "notes": entry.get("notes")},
        price=entry["price_amd"], currency="AMD", price_source="mock",
        color_text=colors, color_std=colors, materials=entry["materials"],
        styles=[style] if style else [], keywords=[], image_urls=[],
        tags={"extra": {"group": group, **{k: entry.get(k) for k in (
            "source_url", "license", "attribution", "notes")}},
              "astra": {"kind": entry["kind"], "main_color": colors[0],
                        "other_colors": colors[1:], "materials": entry["materials"], "style": style}},
        license=license_text, glb_url=url, glb_original_url=url, glb_web_url=url,
        editor_set=False, raw=entry,
    )
    return row


def load_entries(root):
    """Return accepted (row, GLB path) pairs, rejections and per-group/kind counts."""
    accepted, rejected, counts = [], [], {}
    seen_ids, seen_files = set(), set()
    for manifest in sorted(Path(root).glob("*/entries.json")):
        group = manifest.parent.name
        counts[group] = {"accepted": Counter(), "rejected": Counter()}
        try:
            entries = json.loads(manifest.read_text(encoding="utf-8"))
            if not isinstance(entries, list):
                raise ValueError("entries.json must contain a list")
        except (OSError, ValueError) as exc:
            rejected.append((str(manifest), str(exc)))
            counts[group]["rejected"]["unknown"] += 1
            continue
        for index, entry in enumerate(entries):
            metadata = entry if isinstance(entry, dict) else {}
            glb = metadata.get("glb")
            path = manifest.parent / glb if isinstance(glb, str) else None
            reasons = validate_entry(entry, glb_exists=path is not None and path.is_file())
            if not safe_component(group):
                reasons.append("invalid group")
            if not reasons:
                item_id, filename, _ = model_identity(group, entry["slug"])
                if item_id in seen_ids or filename in seen_files:
                    reasons.append("duplicate item ID or staged filename")
                else:
                    seen_ids.add(item_id)
                    seen_files.add(filename)
            kind = metadata.get("kind")
            kind = kind if isinstance(kind, str) and kind else "unknown"
            counts[group]["rejected" if reasons else "accepted"][kind] += 1
            if reasons:
                rejected.append((f"{group}:{metadata.get('slug', index)}", "; ".join(reasons)))
            else:
                accepted.append((build_row(group, entry), path))
    return accepted, rejected, counts


def stage_models(accepted, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    for row, source in accepted:
        _, filename, _ = model_identity(row["tags"]["extra"]["group"], row["source_id"])
        destination = directory / filename
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)


def apply_rows(rows):
    import psycopg
    from psycopg.types.json import Jsonb

    json_columns = {"size_evidence", "tags", "raw", "colors_img"}
    with psycopg.connect(os.environ["VARPET_DB_URL"],
                         options="-c lock_timeout=3000 -c statement_timeout=120000") as conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT, [tuple(
                Jsonb(row[c]) if c in json_columns and row[c] is not None else row[c]
                for c in COLUMNS
            ) for row in rows])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="validate only (default)")
    mode.add_argument("--apply", action="store_true", help="stage valid models and upsert rows")
    parser.add_argument("--stage", type=Path,
                        help=f"copy valid GLBs here, including in dry-run (apply default: {DATA / 'models'})")
    args = parser.parse_args(argv)
    accepted, rejected, counts = load_entries(EXTRA)
    for group, by_status in counts.items():
        print(f"{group}: {sum(by_status['accepted'].values())} accepted, "
              f"{sum(by_status['rejected'].values())} rejected")
        for kind in sorted(by_status["accepted"].keys() | by_status["rejected"].keys()):
            print(f"  {kind}: {by_status['accepted'][kind]} accepted, {by_status['rejected'][kind]} rejected")
    for label, reason in rejected:
        print(f"REJECTED {label}: {reason}")
    if args.stage is not None or args.apply:
        stage_models(accepted, args.stage if args.stage is not None else DATA / "models")
        print(f"staged {len(accepted)} GLBs")
    if args.apply and accepted:
        apply_rows([row for row, _ in accepted])
    print(f"{'upserted' if args.apply else 'dry-run:'} {len(accepted)} items; {len(rejected)} rejected")
    return 1 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
