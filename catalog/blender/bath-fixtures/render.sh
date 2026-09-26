#!/bin/sh
# Re-render previews (delete PNGs first to refresh) and rebuild the contact sheet. Run from catalog/.
/Applications/Blender.app/Contents/MacOS/Blender -b --python render_previews_studio.py -- data/extra/bpy-bath-fixtures data/previews-extra/bpy-bath-fixtures
uv run python blender/bath-fixtures/sheet.py
