"""Search results say where a piece goes (tags.extra.placement), so wall pieces can be hung without guessing."""
from search import _static_rec


def _row(tags):
    return ("extra:bpy-wall2:shelf", "Oak floating shelf 90", "wall_hanging", [0.9, 0.22, 0.04], "confirmed", 12000,
            ["brown"], None, [], [], None, None, "x.glb", {}, tags, 0.0, "AMD", "extra", "mock")


def test_placement_from_extra_tags():
    assert _static_rec(_row({"extra": {"placement": "wall"}}))[0]["placement"] == "wall"


def test_placement_absent_is_none():
    assert _static_rec(_row(None))[0]["placement"] is None
    assert _static_rec(_row({"astra": {}}))[0]["placement"] is None
