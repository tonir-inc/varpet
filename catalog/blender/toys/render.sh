#!/bin/sh
# Re-render the given slugs (all when none) and redraw the sheet. Run from anywhere.
set -e
CAT="$(cd "$(dirname "$0")/../.." && pwd)"
GLB="$CAT/data/extra/bpy-toys"; PNG="$CAT/data/previews-extra/bpy-toys"
mkdir -p "$PNG"
if [ $# -eq 0 ]; then rm -f "$PNG"/*.png; else for s in "$@"; do rm -f "$PNG/$s.png"; done; fi
blender -b --python "$CAT/render_previews_studio.py" -- "$GLB" "$PNG" > /dev/null 2>&1
cd "$CAT" && uv run python blender/toys/sheet.py
