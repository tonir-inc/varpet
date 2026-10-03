# Lights with a settable drop

These 53 generated ceiling and wall lights cover a gap in the catalog. Its Amazon ceiling lights (kind `light`, 196
items) have fixed cords and few sizes, so the designer hung pendants 1 to 2.3 m above tables. Every hanging piece
here keeps its cord as a separate glTF node, so the drop can be set when the piece is placed.

| Family | Count | Sizes | Finishes | AMD |
|---|---|---|---|---|
| Dining pendants: dome, opal globe, cone, rattan bell, linen drum | 21 | 25-60 cm | black, white, brass, opal, rattan, linen | 18k-58k |
| Linear pendants: LED bar, 3 or 4 domes on a bar | 8 | 60, 90, 120 cm | black, brass, white | 39k-135k |
| Chandeliers: 6-arm brass with opal globes, 8-arm black candle, LED ring and double ring, sputnik x2, two-tier rattan | 7 | 60-90 cm | brass, black, rattan | 89k-210k |
| Flush ceiling lights | 6 | 30-50 cm | white with opal, brass rim, linen, rattan | 15k-38k |
| Semi-flush ceiling lights | 4 | 25-45 cm | brass with opal, rattan, linen on black | 34k-46k |
| Wall sconces | 7 | 15-26 cm (swing arm 55 cm reach) | brass, black, white, opal, linen, rattan | 19k-42k |

Contact sheet: `sheet.jpg`.

## Node contract

Ceiling pieces use glTF axes: Y is up, units are metres, and the origin is the ceiling attachment point. All
geometry is at y <= 0.

```
<slug>  (root, extras.varpet_hang = JSON, extras.placement)
  canopy   y from -canopy_m to 0
  cord     origin at the canopy's underside; the mesh runs from y 0 to -cord_m (one node, even with 2-3 cables)
  body     origin at the cord's lower end; the mesh runs from y 0 to -body_m
```

To hang the shade's bottom at drop `D` below the ceiling:

1. Work out the cord length: `c = clamp(D - canopy_m - body_m, cord_min_m, cord_max_m)`.
2. Set `cord.scale.y = c / cord_m`.
3. Set `body.position.y = -(canopy_m + c)`.

Straight cords still meet the body after scaling, including the slanted cables of the ring chandeliers.

The pieces are built with a 1.0 m drop (the chandeliers vary). `render.py` sets the drop through this contract
before every preview, so a broken contract would show up as a gap.

Flush and semi-flush pieces have only a `body` node, with `adjustable: false`. A sconce's origin is the centre of
its wall plate, with the plate's back at z 0 and the front facing +Z. Its `mount_height_m` is a suggested height
for the plate centre.

The same hang data is stored in each entry as `hang` and in the GLB root's extras. In the entry it holds
`canopy_m`, `cord_m`, `body_m`, `drop_m`, `cord_min_m`, `cord_max_m`, `drop_min_m` and `drop_max_m`. v1
`ingest_extra.py` copies `placement` into `tags.extra.placement` and keeps the whole entry, including `hang`, in
`raw`.

## Run

```
/opt/homebrew/bin/blender -b --factory-startup --python catalog/blender/lights/build.py -- [slug ...|all]
/opt/homebrew/bin/blender -b --factory-startup --python catalog/blender/lights/render.py -- [slug ...]
python3 catalog/blender/lights/sheet.py            # writes sheet.jpg from out/previews
```

`out/` is gitignored and holds the GLBs, `entries.json` (the v1 `ingest_extra` format), `previews/`, and textures
fetched from `origin/main:catalog/materials`. To import, copy `out/` to `catalog/data/extra/bpy-lights/`.
`ingest_extra.py` accepts all 53 entries in a dry run.

Do not run these GLBs through `gltf-transform optimize` with its defaults. Its flatten and join steps would merge
the `cord` node away. The GLBs are 14-312 kB and the pieces use 250-7,700 triangles, so they need no optimizing.

`lkit.py` is a trimmed copy of Ashot's `kit.py` and `lighting2/parts.py` from `experimental/floor-plans-3d`. It
adds an exporter that keeps the named nodes.
