import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
assert(await access(join(root, 'src/render/skybox.ts')).then(() => true, () => false), 'Skybox resource module exists');
const output = await mkdtemp(join(tmpdir(), 'varpet-skybox-check-'));
try {
  await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, build: { ssr: join(root, 'src/render/skybox-check.ts'), target: 'node22', outDir: output, emptyOutDir: false, minify: false, rolldownOptions: { output: { entryFileNames: 'check.mjs' } } } });
  const result = spawnSync(process.execPath, [join(output, 'check.mjs')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(output, { recursive: true, force: true }); }
