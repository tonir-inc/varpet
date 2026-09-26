# compiler

Part program (JSON) to mesh via headless Blender, then checks: size, floor contact, triangle count, every part touching a supported part. Runs outside the Codex sandbox (it hides the GPU). Fallback: raw bpy with the same checks.

## Contract with the harness
`<cmd> <program.json> <workdir>`: exit 0 when every check passes. Otherwise write `<workdir>/faults.json` (what failed and where each loose part sits) and exit non-zero. The harness sends the faults back for one fix turn. The harness owns the call; this folder owns everything behind it.
