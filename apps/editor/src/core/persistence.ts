import type { CatalogAsset, SceneDocument } from '../contracts';
import { validateScene } from './validation';

export const STORAGE_KEY = 'varpet.editor.scene.v1';
const MAX_JSON_LENGTH = 4_000_000;

export function serializeScene(scene: SceneDocument): string {
  return JSON.stringify(scene, null, 2);
}

export function parseScene(text: string, catalog: CatalogAsset[]): SceneDocument {
  if (typeof text !== 'string' || text.length > MAX_JSON_LENGTH) throw new Error('Scene file is too large. Use a JSON document smaller than 4 MB.');
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON. Export a Varpet scene and try again.'); }
  const validation = validateScene(input, catalog);
  if (!validation.ok) throw new Error(`Cannot import this scene: ${validation.errors.join(' ')}`);
  return input as SceneDocument;
}

export function saveLocal(scene: SceneDocument): void {
  try { localStorage.setItem(STORAGE_KEY, serializeScene(scene)); }
  catch { throw new Error('Local save is unavailable or storage is full. Export the scene as JSON to keep a copy.'); }
}

export function loadLocal(catalog: CatalogAsset[]): SceneDocument | null {
  let text: string | null;
  try { text = localStorage.getItem(STORAGE_KEY); }
  catch { throw new Error('Local storage is unavailable in this browser. Import a saved scene JSON instead.'); }
  return text === null ? null : parseScene(text, catalog);
}
