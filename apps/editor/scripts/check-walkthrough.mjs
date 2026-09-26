import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-walkthrough-check-'));
try {
  await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: { ssr: join(root, 'src/core/walkthrough-check.ts'), target: 'node22', outDir: output, emptyOutDir: false, minify: false, rolldownOptions: { output: { entryFileNames: 'check.mjs' } } } });
  const result = spawnSync(process.execPath, [join(output, 'check.mjs')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(output, { recursive: true, force: true }); }
