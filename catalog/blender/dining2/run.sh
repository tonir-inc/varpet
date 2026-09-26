#!/bin/sh
# build the given slugs (or all), then render missing studio previews and the contact sheet
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/dining2/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-dining2 data/previews-extra/bpy-dining2 2>&1 | grep -E "PREVIEW|Error"
uv run python blender/dining2/sheet.py
