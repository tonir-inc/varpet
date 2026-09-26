#!/bin/sh
# build the given slugs (or all), render missing studio previews, redraw the contact sheet
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/storage/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --factory-startup --python render_previews_studio.py -- data/extra/bpy-storage data/previews-extra/bpy-storage 2>&1 | grep -E "PREVIEW|Error|Traceback"
uv run python blender/storage/sheet.py
