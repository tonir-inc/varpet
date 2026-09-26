"""Extra-model validation, mapping and staging without a database."""
import json

import pytest

import ingest_extra as extra


@pytest.fixture
def entry():
    return {
        "slug": "washer-white", "name": "White washer", "kind": "washing_machine",
        "size_m": [0.6, 0.6, 0.85], "mesh_extents_m": [0.6, 0.6, 0.85],
        "price_amd": 260000, "colors": ["white", "grey"], "materials": ["metal", "plastic"],
        "style": "modern", "glb": "washer-white.glb", "source_url": "https://example.org/model",
        "license": "CC-BY 4.0", "attribution": "Example artist", "notes": "front faces +Z",
    }


def write_group(root, group, entries):
    folder = root / group
    folder.mkdir(parents=True)
    (folder / "entries.json").write_text(json.dumps(entries))
    for entry in entries:
        (folder / entry["glb"]).write_bytes(b"glTF fake test model")
    return folder


def test_identity():
    assert extra.model_identity("appliances", "washer-white") == (
        "extra:appliances:washer-white", "extra-appliances-washer-white.glb",
        "http://100.107.246.46:8765/models/extra-appliances-washer-white.glb",
    )


@pytest.mark.parametrize("group,slug", [("../x", "washer"), ("a", "../washer"), ("a", ""), ("a/b", "c")])
def test_identity_rejects_paths(group, slug):
    with pytest.raises(ValueError):
        extra.model_identity(group, slug)


@pytest.mark.parametrize("axis", [0, 1, 2])
@pytest.mark.parametrize("delta,valid", [(0, True), (0.009, True), (0.01, True), (-0.01, True), (0.010001, False)])
def test_one_centimetre_boundary(entry, axis, delta, valid):
    entry["mesh_extents_m"][axis] += delta
    reasons = extra.validate_entry(entry, glb_exists=True)
    assert (not reasons) is valid
    assert extra.build_row("appliances", entry)["size_status"] == ("confirmed" if valid else "estimated")
    if not valid:
        assert "size mismatch > 1 cm" in reasons


@pytest.mark.parametrize("colors", [None, [], ["White"], ["silver"], "white", [None], [{}]])
def test_bad_colour(entry, colors):
    entry["colors"] = colors
    assert any("bad colour" in reason for reason in extra.validate_entry(entry, glb_exists=True))


@pytest.mark.parametrize("color", sorted(extra.COLORS))
def test_palette(entry, color):
    entry["colors"] = [color]
    assert extra.validate_entry(entry, glb_exists=True) == []


def test_missing_price_and_glb(entry):
    del entry["price_amd"]
    reasons = extra.validate_entry(entry, glb_exists=False)
    assert "missing price" in reasons
    assert "missing GLB file" in reasons


@pytest.mark.parametrize("price", [None, False, 0, -1, 1.5, "260000", 2**31])
def test_invalid_price(entry, price):
    entry["price_amd"] = price
    assert any("price" in reason for reason in extra.validate_entry(entry, glb_exists=True))


@pytest.mark.parametrize("size", [None, [], [1, 2], [1, 2, 3, 4], [0, 1, 1], [-1, 1, 1],
                                  [True, 1, 1], [float("nan"), 1, 1], [float("inf"), 1, 1], ["1", 1, 1]])
@pytest.mark.parametrize("field", ["size_m", "mesh_extents_m"])
def test_invalid_size(entry, field, size):
    entry[field] = size
    assert any("invalid size" in reason for reason in extra.validate_entry(entry, glb_exists=True))


def test_size_axes_are_not_swapped(entry):
    entry["size_m"] = [0.6, 0.8, 0.85]
    entry["mesh_extents_m"] = [0.8, 0.6, 0.85]
    assert "size mismatch > 1 cm" in extra.validate_entry(entry, glb_exists=True)


@pytest.mark.parametrize("kind", ["washing_machine", "kitchen_cabinet", "tv"])
def test_row_contract(entry, kind):
    entry["kind"] = kind
    row = extra.build_row("appliances", entry)
    assert set(row) == set(extra.COLUMNS)
    assert (row["id"], row["source"], row["source_id"]) == ("extra:appliances:washer-white", "extra", "washer-white")
    assert row["name"] == entry["name"]
    assert row["kind"] == kind
    assert row["size_m"] == row["fit_size_m"] == entry["size_m"]
    assert row["size_evidence"] == {"from": "normalised mesh", "mesh_extents_m": entry["mesh_extents_m"], "notes": entry["notes"]}
    assert (row["price"], row["currency"], row["price_source"]) == (260000, "AMD", "mock")
    assert row["color_std"] == entry["colors"]
    assert row["materials"] == entry["materials"]
    assert row["styles"] == ["modern"]
    assert row["tags"] == {
        "extra": {"group": "appliances", "source_url": entry["source_url"], "license": "CC-BY 4.0",
                  "attribution": "Example artist", "notes": "front faces +Z"},
        "astra": {"kind": kind, "main_color": "white", "other_colors": ["grey"],
                  "materials": ["metal", "plastic"], "style": "modern"},
    }
    assert row["license"] == "CC-BY 4.0 — Example artist"
    assert row["glb_url"] == row["glb_original_url"] == row["glb_web_url"] == extra.model_identity("appliances", entry["slug"])[2]
    assert row["listing_size_m"] is row["colors_img"] is row["main_image_url"] is None
    assert row["editor_set"] is False


def test_optional_metadata(entry):
    for key in ("style", "attribution", "notes"):
        entry.pop(key)
    entry["colors"] = ["white"]
    assert extra.validate_entry(entry, glb_exists=True) == []
    row = extra.build_row("appliances", entry)
    assert row["styles"] == []
    assert row["tags"]["astra"]["other_colors"] == []
    assert row["tags"]["astra"]["style"] is None
    assert row["license"] == "CC-BY 4.0"


def test_load_all_groups_reject_and_stage(tmp_path, entry):
    root = tmp_path / "extra"
    folder = write_group(root, "appliances", [entry])
    write_group(root, "kitchen", [{**entry, "kind": "kitchen_cabinet"}])
    (root / "ignored").mkdir()
    accepted, rejected, counts = extra.load_entries(root)
    assert len(accepted) == 2
    assert rejected == []
    assert set(counts) == {"appliances", "kitchen"}
    stage = tmp_path / "models"
    extra.stage_models(accepted, stage)
    assert sorted(p.name for p in stage.iterdir()) == [
        "extra-appliances-washer-white.glb", "extra-kitchen-washer-white.glb"]
    assert (stage / "extra-appliances-washer-white.glb").read_bytes() == (folder / entry["glb"]).read_bytes()
    (folder / entry["glb"]).unlink()
    accepted, rejected, counts = extra.load_entries(root)
    assert len(accepted) == 1
    assert "missing GLB file" in rejected[0][1]
    assert counts["appliances"]["rejected"]["washing_machine"] == 1


def test_duplicate_rejected(tmp_path, entry):
    write_group(tmp_path, "appliances", [entry, entry])
    accepted, rejected, _ = extra.load_entries(tmp_path)
    assert len(accepted) == len(rejected) == 1
    assert "duplicate" in rejected[0][1]


def test_malformed_manifest_does_not_hide_other_groups(tmp_path, entry):
    write_group(tmp_path, "valid", [entry])
    bad = tmp_path / "bad"
    bad.mkdir()
    (bad / "entries.json").write_text("{")
    accepted, rejected, _ = extra.load_entries(tmp_path)
    assert len(accepted) == len(rejected) == 1


def test_default_dry_run_never_connects_or_stages(tmp_path, entry, monkeypatch, capsys):
    write_group(tmp_path, "appliances", [entry])
    monkeypatch.setattr(extra, "EXTRA", tmp_path)
    monkeypatch.setattr(extra, "DATA", tmp_path)
    monkeypatch.delenv("VARPET_DB_URL", raising=False)
    monkeypatch.setattr(extra, "apply_rows", lambda rows: pytest.fail("dry-run attempted DB write"))
    assert extra.main([]) == 0
    assert not (tmp_path / "models").exists()
    output = capsys.readouterr().out
    assert "appliances: 1 accepted, 0 rejected" in output
    assert "washing_machine: 1 accepted, 0 rejected" in output
    assert extra.main(["--dry-run", "--stage", str(tmp_path / "staged")]) == 0
    assert (tmp_path / "staged" / "extra-appliances-washer-white.glb").is_file()


def test_dry_run_prints_rejection(tmp_path, entry, monkeypatch, capsys):
    del entry["price_amd"]
    write_group(tmp_path, "appliances", [entry])
    monkeypatch.setattr(extra, "EXTRA", tmp_path)
    assert extra.main(["--dry-run"]) == 1
    assert "REJECTED appliances:washer-white: missing price" in capsys.readouterr().out


def test_apply_stages_default_directory_without_real_db(tmp_path, entry, monkeypatch):
    write_group(tmp_path / "extra", "appliances", [entry])
    monkeypatch.setattr(extra, "EXTRA", tmp_path / "extra")
    monkeypatch.setattr(extra, "DATA", tmp_path)
    calls = []
    monkeypatch.setattr(extra, "apply_rows", calls.extend)
    assert extra.main(["--apply"]) == 0
    assert calls == [extra.build_row("appliances", entry)]
    assert (tmp_path / "models" / "extra-appliances-washer-white.glb").exists()
