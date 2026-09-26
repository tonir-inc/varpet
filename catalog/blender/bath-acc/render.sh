#!/bin/sh
# Re-render bath-acc previews (deletes PNGs for the given slugs, or all) and rebuild the contact sheet.
cd "$(dirname "$0")/../.." || exit 1
P=data/previews-extra/bpy-bath-acc
mkdir -p $P
if [ $# -eq 0 ]; then rm -f $P/*.png; else for s in "$@"; do rm -f $P/$s.png; done; fi
blender -b --python render_previews_studio.py -- data/extra/bpy-bath-acc $P >/dev/null 2>&1
uv run python blender/bath-acc/sheet.py
