#!/bin/sh
# Re-render previews for the given slugs (all if none): blender/balcony/render.sh [slug ...]
cd "$(dirname "$0")/../.." || exit 1
P=data/previews-extra/bpy-balcony
mkdir -p $P
if [ $# -eq 0 ]; then rm -f $P/*.png; else for s in "$@"; do rm -f "$P/$s.png"; done; fi
/Applications/Blender.app/Contents/MacOS/Blender -b --python render_previews_studio.py -- data/extra/bpy-balcony $P 2>&1 | grep -E "PREVIEW|Error"
