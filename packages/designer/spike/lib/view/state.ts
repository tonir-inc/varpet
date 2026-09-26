import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const key = createHash('sha1').update(fileURLToPath(import.meta.url)).digest('hex').slice(0, 10);
/** One warm render daemon per checkout. */
export const STATE_FILE = join(tmpdir(), `varpet-render-view-${key}.json`);
export const CATALOG_CACHE = join(tmpdir(), `varpet-render-view-catalog-${key}.json`);

import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/** Newest mtime of the daemon's code, so a client restarts a daemon running stale code. */
export function codeVersion(): number {
  const view = dirname(fileURLToPath(import.meta.url));
  const files = [...readdirSync(view).map(name => resolve(view, name)), resolve(view, '../finishes.ts')];
  return Math.max(...files.map(file => { try { return statSync(file).mtimeMs; } catch { return 0; } }));
}
