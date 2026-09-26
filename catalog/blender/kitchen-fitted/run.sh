#!/bin/sh
# build the given slugs (or all), then render missing previews with the studio renderer
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/kitchen-fitted/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-kitchen-fitted data/previews-extra/bpy-kitchen-fitted 2>&1 | grep -E "PREVIEW|Error"
uv run python blender/kitchen-fitted/sheet.py
