#!/bin/sh
# Re-render studio previews for the given slugs (all if none): blender/terrace/render.sh [slug ...]
cd "$(dirname "$0")/../.." || exit 1
P=data/previews-extra/bpy-terrace
mkdir -p $P
if [ $# -eq 0 ]; then rm -f $P/*.png; else for s in "$@"; do rm -f "$P/$s.png"; done; fi
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python render_previews_studio.py -- data/extra/bpy-terrace $P 2>&1 | grep -E "PREVIEW|Error|rror"
