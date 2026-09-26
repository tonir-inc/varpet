import json

import pytest

from varpet_harness.shell import Shell, check_file
from varpet_harness.trace import TraceError, to_shell

PX, OX, OY = 100, 40, 60  # 100 px per metre, the flat drawn 40 px right and 60 px down in the image


def px(x, z):
    return f"{OX + x * PX:.1f},{OY + z * PX:.1f}"


def wall(i, a, b, cls="main", t=0.12):
    (x1, z1), (x2, z2) = a, b
    h = t / 2
    if x1 == x2:
        corners = [(x1 - h, z1), (x1 + h, z1), (x2 + h, z2), (x2 - h, z2)]
    else:
        corners = [(x1, z1 - h), (x2, z1 - h), (x2, z2 + h), (x1, z2 + h)]
    return f'<polygon id="{i}" class="wall {cls}" points="{" ".join(px(*c) for c in corners)}"/>'


def svg(extra=""):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">
{wall("w-n", (0, 0), (8, 0))}{wall("w-e", (8, 0), (8, 4))}{wall("w-s", (0, 4), (8, 4))}{wall("w-w", (0, 0), (0, 4))}
{wall("w-mid", (5, 0), (5, 4), "secondary")}
<line id="d1" class="door" x1="{OX + 5 * PX}" y1="{OY + 1.5 * PX}" x2="{OX + 5 * PX}" y2="{OY + 2.3 * PX}"/>
<line id="entry" class="door" x1="{OX + 1 * PX}" y1="{OY + 4 * PX}" x2="{OX + 1.9 * PX}" y2="{OY + 4 * PX}"/>
<polygon id="living" class="room" data-name="Living" data-printed="4.88 x 3.88 m" points="{px(0.06, 0.06)} {px(4.94, 0.06)} {px(4.94, 3.94)} {px(0.06, 3.94)}"/>
<polygon id="bed" class="room" data-name="Bedroom" data-printed="11.17 m2" points="{px(5.06, 0.06)} {px(7.94, 0.06)} {px(7.94, 3.94)} {px(5.06, 3.94)}"/>
<polygon id="wc" class="fixture" data-kind="WC" data-name="Toilet" points="{px(7.5, 0.1)} {px(7.9, 0.1)} {px(7.9, 0.8)} {px(7.5, 0.8)}"/>
{extra}</svg>"""


def test_a_labelled_trace_becomes_the_flat_in_metres(tmp_path):
    shell = to_shell(svg('<line class="dimension" data-m="5.0" x1="40" y1="30" x2="540" y2="30"/>'))
    walls = {w["id"]: w for w in shell["walls"]}
    assert walls["w-mid"]["start"] == (5.0, 0.0) and walls["w-mid"]["end"] == (5.0, 4.0) or \
        walls["w-mid"]["end"] == (5.0, 0.0)
    assert abs(walls["w-n"]["thickness"] - 0.12) < 1e-6
    door = walls["w-mid"]["openings"][0]
    assert door["kind"] == "door" and abs(door["width"] - 0.8) < 1e-3
    assert shell["printed"] == {"living": {"dims_m": [4.88, 3.88]}, "bed": {"area_m2": 11.17}}
    wc = shell["components"][0]
    assert wc["kind"] == "toilet" and wc["roomId"] == "bed" and "100.0 px/m" in shell["notes"][0]
    path = tmp_path / "shell.json"
    path.write_text(json.dumps(shell))
    assert check_file(path, tmp_path) == []


def test_without_dimension_lines_the_scale_comes_from_the_printed_areas():
    shell = to_shell(svg())
    assert abs(float(shell["notes"][0].split("scale ")[1].split(" ")[0]) - 100) < 1  # printed sizes are inside faces, like the room outlines


def test_a_trace_with_no_scale_says_how_to_give_one():
    with pytest.raises(TraceError, match="dimension"):
        to_shell(svg().replace('data-printed="4.88 x 3.88 m" ', "").replace('data-printed="11.17 m2" ', ""))
