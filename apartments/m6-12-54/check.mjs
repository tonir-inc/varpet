import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../../apps/editor/package.json', import.meta.url));
const { build } = await import(require.resolve('vite'));
const out = await mkdtemp(join(tmpdir(),'varpet-m6-plan-'));
try {
  await build({ configFile:false, publicDir:false, logLevel:'error', build:{ssr:fileURLToPath(new URL('check.ts',import.meta.url)),target:'node22',outDir:out,minify:false,rolldownOptions:{output:{entryFileNames:'check.mjs'}}}});
  const result=spawnSync(process.execPath,[join(out,'check.mjs'),...(process.argv.slice(2))],{stdio:'inherit'});
  if(result.error) throw result.error;
  process.exitCode=result.status ?? 1;
} finally { await rm(out,{recursive:true,force:true}); }
