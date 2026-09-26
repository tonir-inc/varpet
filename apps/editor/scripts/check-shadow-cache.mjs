import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
assert.ok(await access(join(root, 'src/render/shadow-cache.ts')).then(() => true, () => false), 'Scene-wide shadow invalidation must exist');
const output = await mkdtemp(join(tmpdir(), 'varpet-shadow-cache-'));
try {
  await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, build: { ssr: join(root, 'src/render/shadow-cache-check.ts'), target: 'node22', outDir: output, emptyOutDir: false, minify: false, rolldownOptions: { output: { entryFileNames: 'check.mjs' } } } });
  const result = spawnSync(process.execPath, [join(output, 'check.mjs')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(output, { recursive: true, force: true }); }
