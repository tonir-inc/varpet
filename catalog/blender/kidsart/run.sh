#!/bin/sh
# draw the artwork, build the given slugs (or all), then render missing studio previews and the contact sheet
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
uv run python blender/kidsart/art.py "$@" | grep -c ART
$B -b --factory-startup --python blender/kidsart/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-kidsart data/previews-extra/bpy-kidsart 2>&1 | grep -E "PREVIEW|Error|rror"
uv run python blender/kidsart/sheet.py
