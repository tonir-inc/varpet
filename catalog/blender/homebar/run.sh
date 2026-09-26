#!/bin/sh
# build the given slugs (or all), then render missing studio previews and the contact sheet
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/homebar/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-homebar data/previews-extra/bpy-homebar 2>&1 | grep -E "PREVIEW|Error"
uv run python blender/homebar/sheet.py
