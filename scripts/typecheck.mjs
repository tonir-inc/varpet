// Pascal's editor is TypeScript source (our fork, vendor/pascal), so tsc walks into it and reports its own errors.
// Fail only on errors in our files.
import { spawnSync } from 'node:child_process'

const out = spawnSync('tsc', ['--noEmit', '-p', process.argv[2] ?? '.'], { encoding: 'utf8', shell: true })
const lines = `${out.stdout}${out.stderr}`.split('\n')
const ours = lines.filter((line) => /error TS\d+/.test(line) && !line.includes('node_modules/') && !line.includes('vendor/pascal/'))
for (const line of ours) console.error(line)
if (out.status !== 0 && ours.length === 0 && !lines.some((line) => /error TS\d+/.test(line))) {
  console.error(`${out.stdout}${out.stderr}`)
  process.exit(out.status ?? 1)
}
process.exit(ours.length ? 1 : 0)
