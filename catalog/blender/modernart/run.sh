#!/bin/sh
# draw the artwork, build the given slugs (or all), then render missing studio previews
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
uv run python blender/modernart/art.py "$@" | grep -c ART
$B -b --factory-startup --python blender/modernart/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-modernart data/previews-extra/bpy-modernart 2>&1 | grep -E "PREVIEW|Error|rror"
