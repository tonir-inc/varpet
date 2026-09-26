#!/bin/sh
# Re-render studio previews for the given slugs (all if none): ./render.sh [slug ...]
cd "$(dirname "$0")/../.." || exit 1
OUT=data/previews-extra/bpy-office
mkdir -p "$OUT"
if [ $# -eq 0 ]; then rm -f "$OUT"/*.png; else for s in "$@"; do rm -f "$OUT/$s.png"; done; fi
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python render_previews_studio.py -- data/extra/bpy-office "$OUT" 2>&1 | grep -E "PREVIEW|Error|rror"
