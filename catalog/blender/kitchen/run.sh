#!/bin/sh
# build the given slugs (or all), then render missing previews
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python blender/kitchen/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|error|Traceback|File \"" 
$B -b --factory-startup --python render_previews_studio.py -- data/extra/bpy-kitchen data/previews-extra/bpy-kitchen 2>&1 | grep -E "PREVIEW|Error"
