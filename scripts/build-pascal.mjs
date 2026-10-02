// Builds the dist of our Pascal fork (vendor/pascal) the way its own package scripts do, without bun:
// `tsc --build` for core, viewer, nodes, mcp (incremental, a no-op when nothing changed), then the
// extensionless-import fix on core/dist and mcp/dist so they run under plain node (the scene MCP).
// The editor package ships TypeScript source; Next transpiles it.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pascal = join(root, 'vendor/pascal')
const packages = ['core', 'viewer', 'nodes', 'mcp'].map((name) => join(pascal, 'packages', name))
const tsc = join(pascal, 'packages/mcp/node_modules/.bin/tsc')

function run(command, args, cwd) {
  const out = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (out.status !== 0) {
    console.error(`build-pascal: ${command} ${args.join(' ')} failed in ${cwd}`)
    process.exit(out.status ?? 1)
  }
}

if (!existsSync(tsc)) {
  console.error('build-pascal: vendor/pascal has no TypeScript yet; run pnpm install first')
  process.exit(1)
}
run(tsc, ['--build', ...packages], pascal)
for (const dist of ['packages/core/dist', 'packages/mcp/dist']) {
  run(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/fix-node-esm-imports.ts', dist], pascal)
}
