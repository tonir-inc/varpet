#!/bin/sh
# Build + re-render the given slugs (all if none): blender/plants/render.sh [slug ...]
cd "$(dirname "$0")/../.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
P=data/previews-extra/bpy-plants
mkdir -p $P
$B -b --factory-startup --python blender/plants/build.py -- "$@" 2>&1 | grep -E "BUILT|Error|Traceback|line [0-9]+" 
if [ $# -eq 0 ]; then rm -f $P/*.png; else for s in "$@"; do rm -f "$P/$s.png"; done; fi
$B -b --factory-startup --python render_previews_studio.py -- data/extra/bpy-plants $P 2>&1 | grep -E "PREVIEW|Error"
