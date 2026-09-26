#!/bin/sh
# build the given slugs (or all), then render missing studio previews and the contact sheet
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/deco/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-deco data/previews-extra/bpy-deco 2>&1 | grep -E "PREVIEW|Error|rror"
uv run python blender/deco/sheet.py
