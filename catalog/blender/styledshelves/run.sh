#!/bin/sh
# build the given slugs (or all), render missing studio previews, redraw the contact sheet
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/styledshelves/build.py -- "$@" 2>&1 | grep -E "BUILT|OVER|Error|error|Traceback|File \""
$B -b --factory-startup --python render_previews_studio.py -- data/extra/bpy-styledshelves data/previews-extra/bpy-styledshelves 2>&1 | grep -E "PREVIEW|Error|Traceback"
uv run python blender/styledshelves/sheet.py
