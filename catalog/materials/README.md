# Material library

One folder per finish: `catalog/materials/<id>/`.

| File | Content |
|---|---|
| `basecolor.jpg` | 1024x1024, seamless. **Tint-ready**: colour removed so the mean is a light neutral grey (about #c8c8c8); the builder's hex tint multiplies it (glTF baseColorFactor) |
| `normal.jpg` | OpenGL convention (+Y up), seamless |
| `roughness.jpg` | greyscale, seamless |
| `material.json` | see below |

```json
{
  "id": "oak",
  "family": "wood | fabric | leather | stone | metal | laminate | paint | ceramic",
  "tile_m": 0.8,
  "grain": true,
  "default_color": "#a57c52",
  "metal": 0.0,
  "source": "polyhaven:<asset> | ambientcg:<asset> | procedural",
  "license": "CC0"
}
```

- `tile_m`: real-world width of one tile in metres; the compiler UV-maps in metres, so scale is always true.
- `grain`: the texture has a direction (U axis runs along the grain).
- `default_color`: the original mean colour, used when the builder gives no tint.
- ids: lowercase, `-` separated. Procedural sets end in `-gen` until they beat the downloaded one.

## Which set won (26 Sept, same rounded cushion + table, same tint)
- Procedural won `linen`, `marble-white`, `brushed-steel`; the CC0 versions are kept as `<id>-alt`.
- CC0 won oak, walnut, boucle, velvet, wool-felt, leather-brown; the `-gen` versions stay as candidates.
- Swap with `python catalog/tools/promote.py <id>=<set>`. The builder skill lists plain ids only
  (`uv run python -m partdsl.finishes` in `compiler/`).
- Downloads: `catalog/tools/import_cc0.py`. Procedural: `catalog/texgen/gen.py`.
