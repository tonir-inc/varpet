#!/bin/sh
# build the given slugs (or all), then render missing studio previews
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/beds-dressed/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \""
$B -b --python render_previews_studio.py -- data/extra/bpy-beds-dressed data/previews-extra/bpy-beds-dressed 2>&1 | grep -E "PREVIEW|Error|rror"
