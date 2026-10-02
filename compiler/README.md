# compiler

Part program (JSON) to mesh via headless Blender, then checks: size, floor contact, triangle count, every part touching a supported part. Runs outside the Codex sandbox (it hides the GPU). Fallback: raw bpy with the same checks.

## Contract with the harness
`<cmd> <program.json> <workdir>`: exit 0 when every check passes. Otherwise write `<workdir>/faults.json` (what failed and where each loose part sits) and exit non-zero. The harness sends the faults back for one fix turn. The harness owns the call; this folder owns everything behind it.

## Draft DSL (until c105 lands)
`partdsl/` is a stand-in built on 26 Sept: JSON part programs after ShapeAssembly (attach unit points, `between` for legs, `mirror`, `repeat`), compiled with trimesh (no Blender needed) to a Y-up GLB. Checks: size, floor contact, support chain with loose-group locations, triangle budget. The builder prompt is `harness/prompts/part-dsl-draft.md`.

```
uv run python -m partdsl.compile examples/dining-chair.json /tmp/out
uv run pytest -q
```
