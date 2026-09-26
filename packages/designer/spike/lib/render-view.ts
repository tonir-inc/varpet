/** 3D look at a furnished room through the product editor's own viewport (real catalog GLBs, materials, lighting).
 * A warm daemon (view/server.ts: editor Vite server + headless Chrome) does the work; this is a thin HTTP client.
 * The daemon starts on first use and exits after 30 idle minutes. Runners inside a sandbox should call
 * startViewDaemon() outside it first: the daemon then fetches the catalog and launches Chrome, and the sandboxed
 * caller only needs 127.0.0.1. */
import { spawn } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scene } from '../../src/scene.js';
import type { Draft, ViewCamera } from './view/document.js';
import { STATE_FILE, codeVersion } from './view/state.js';

export type { Draft, ViewCamera } from './view/document.js';
/** time: day (afternoon sun, lamps off) or evening (after dusk, every designed light on). */
/** roomId undefined frames the whole flat (overview/top cameras only). source: the flat's editor document (source.json);
 * without it the Avani demo shell is used. */
export interface RenderViewOptions { roomId?: string; source?: unknown; camera?: ViewCamera; time?: 'day' | 'evening'; width?: number; height?: number }

const here = dirname(fileURLToPath(import.meta.url));
const designerRoot = resolve(here, '../..');
const LOG = STATE_FILE.replace(/\.json$/, '.log');

async function ping(): Promise<number | null> {
  try {
    const { port, version } = JSON.parse(await readFile(STATE_FILE, 'utf8')) as { port: number; version?: number };
    const response = await fetch(`http://127.0.0.1:${port}/ping`, { signal: AbortSignal.timeout(1500) });
    if (response.ok && version !== codeVersion()) {
      // Code changed since the daemon started: stop it so the next call starts a fresh one.
      await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST' }).catch(() => {});
      await new Promise(r => setTimeout(r, 500));
      return null;
    }
    return response.ok ? port : null;
  } catch { return null; }
}

async function daemon(): Promise<number> {
  const warm = await ping();
  if (warm) return warm;
  const tsx = resolve(designerRoot, 'node_modules/.bin/tsx');
  if (!existsSync(tsx)) throw new Error(`renderView needs tsx at ${tsx} (pnpm install)`);
  const log = openSync(LOG, 'a');
  const child = spawn(tsx, [resolve(here, 'view/server.ts')], { detached: true, stdio: ['ignore', log, log] });
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.unref();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !exited) {
    await new Promise(r => setTimeout(r, 300));
    const port = await ping();
    if (port) return port;
  }
  throw new Error(`renderView daemon did not start; see ${LOG}`);
}

export async function startViewDaemon(): Promise<void> { await daemon(); }

export async function renderView(scene: Scene, draft: Draft, outPng: string, options: RenderViewOptions): Promise<string> {
  const port = await daemon();
  const response = await fetch(`http://127.0.0.1:${port}/render`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scene, draft, source: options.source, roomId: options.roomId, camera: options.camera ?? 'overview', time: options.time ?? 'day', outPng: resolve(outPng),
      width: options.width ?? 1200, height: options.height ?? 800, assetTimeoutMs: 25_000 }) });
  const result = await response.json() as { ok: boolean; error?: string; missing?: string[]; timedOut?: boolean };
  if (!result.ok) throw new Error(`renderView failed: ${result.error}`);
  if (result.missing?.length) process.stderr.write(`renderView: models not loaded (${result.timedOut ? 'timeout' : 'failed'}): ${result.missing.join(', ')}\n`);
  return resolve(outPng);
}
/** Human-facing shots of one room: cutaway overview and eye level by day, eye level in the evening. */
export async function renderViewsForReport(scene: Scene, draft: Draft, outDir: string, roomId: string, source?: unknown): Promise<string[]> {
  return [await renderView(scene, draft, resolve(outDir, `${roomId}-overview.png`), { roomId, source, camera: 'overview' }),
    await renderView(scene, draft, resolve(outDir, `${roomId}-eye.png`), { roomId, source, camera: 'eye' }),
    await renderView(scene, draft, resolve(outDir, `${roomId}-evening.png`), { roomId, source, camera: 'eye', time: 'evening' })];
}

/** Whole-flat shots: cutaway overview and top view. */
export async function renderFlatForReport(scene: Scene, draft: Draft, outDir: string, source?: unknown): Promise<string[]> {
  return [await renderView(scene, draft, resolve(outDir, 'flat-overview.png'), { source, camera: 'overview' }),
    await renderView(scene, draft, resolve(outDir, 'flat-top.png'), { source, camera: 'top' })];
}

/** Stop the warm daemon (runners call this at the end of a batch; it also exits on its own when idle). */
export async function stopViewDaemon(): Promise<void> {
  const port = await ping();
  if (port) await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST' }).catch(() => {});
}
