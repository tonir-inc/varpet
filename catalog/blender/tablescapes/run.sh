#!/bin/sh
# build the given slugs (or all), re-render their studio previews, then the contact sheet: ./run.sh [slug ...]
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
OUT=data/previews-extra/bpy-tablescapes
mkdir -p "$OUT"
$B -b --factory-startup --python blender/tablescapes/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
if [ $# -eq 0 ]; then rm -f "$OUT"/*.png; else for s in "$@"; do rm -f "$OUT/$s.png"; done; fi
$B -b --python render_previews_studio.py -- data/extra/bpy-tablescapes "$OUT" 2>&1 | grep -E "PREVIEW|Error"
uv run python blender/tablescapes/sheet.py
