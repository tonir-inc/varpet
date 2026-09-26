import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const flatId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/;
async function json(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw new Error(`Cannot read showcase input ${path}: ${error.message}`); }
}
function factRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['flats', 'apartments', 'plans', 'fixtures']) if (Array.isArray(data[key])) return data[key];
  return Object.entries(data.flats ?? data).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value)).map(([id, value]) => ({ id, ...value }));
}
async function firstJson(dir, files) {
  for (const file of files) { const value = await json(join(dir, file)); if (value !== undefined) return value; }
}
/** Read only committed scene/result JSON. Developer images never enter the module graph or dist. */
export async function loadRecords(dir) {
  let files;
  try { files = await readdir(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const truth = factRows(await json(join(dir, 'ground-truth.json')));
  const shellIds = files.filter(file => /^[^.]+\.scene\.json$/.test(file)).map(file => file.slice(0, -11));
  const ids = [...new Set([...truth.map(row => String(row.id ?? row.plan_id ?? row.flat_id ?? '')), ...shellIds])].filter(id => flatId.test(id));
  const sharedCatalog = await json(join(dir, 'catalog.json'));
  return Promise.all(ids.sort().map(async id => ({
    id, facts: truth.find(row => String(row.id ?? row.plan_id ?? row.flat_id) === id) ?? {},
    shell: await json(join(dir, `${id}.scene.json`)) ?? null,
    furnished: await firstJson(dir, [`${id}.furnished.scene.json`, `${id}.final.scene.json`, `${id}/final.scene.json`, `${id}/furnished.scene.json`]) ?? null,
    catalog: await firstJson(dir, [`${id}.catalog.json`, `${id}/catalog.json`]) ?? sharedCatalog ?? [],
    conversation: await firstJson(dir, [`${id}.conversation.json`, `${id}.result.json`, `${id}/conversation.json`, `${id}/result.json`]) ?? null,
  })));
}
export async function planFile(dir, id) {
  if (!flatId.test(id)) return null;
  for (const extension of ['png', 'jpg', 'jpeg']) {
    const path = join(dir, `${id}.${extension}`);
    try { if ((await stat(path)).isFile()) return path; } catch { /* Private plan absent on this machine. */ }
  }
  return null;
}
