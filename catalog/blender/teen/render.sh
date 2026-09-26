#!/bin/sh
# Render missing previews for the teen lane (delete a PNG to re-render it).
cd "$(dirname "$0")/../.." || exit 1
/Applications/Blender.app/Contents/MacOS/Blender -b --python render_previews_studio.py -- data/extra/bpy-teen data/previews-extra/bpy-teen 2>&1 | grep -iE "error|wrote|saved|render" | tail -40
