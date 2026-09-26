#!/bin/sh
# build the given slugs (or all), then render missing studio previews
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/sofabeds/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-sofabeds data/previews-extra/bpy-sofabeds 2>&1 | grep -E "PREVIEW|Error|rror"
