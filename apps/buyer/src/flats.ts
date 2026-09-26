import type { CatalogAsset, SceneDocument } from '../../editor/src/contracts';
import { validateScene } from '../../editor/src/core/validation';
import { demoScene, localCatalog } from '../../editor/src/core/demo';

/** A committed Komitas record, as apps/showcase/server/data.mjs reads it. */
export interface InputRecord { id: string; facts: Record<string, unknown>; shell: SceneDocument | null; furnished: SceneDocument | null; catalog: CatalogAsset[] | { assets: CatalogAsset[]; currency?: string }; conversation: Record<string, unknown> | null }

export interface Flat {
  id: string;
  /** Printed large in the title block, like a sheet number. */
  number: string;
  subtitle: string;
  scene: SceneDocument;
  catalog: CatalogAsset[];
  /** 'AMD' only when the catalog says so; the demo catalog's prices have no currency. */
  currency: 'AMD' | null;
  example: boolean;
}

export const areaOf = (scene: SceneDocument) => scene.rooms.reduce((sum, room) => sum + Math.abs(room.polygon.reduce((a, p, i) => {
  const q = room.polygon[(i + 1) % room.polygon.length]!; return a + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2, 0);

const subtitle = (scene: SceneDocument) => `${areaOf(scene).toFixed(0)} m², ${scene.rooms.length} spaces`;

export function exampleFlat(): Flat {
  const scene = structuredClone(demoScene);
  return { id: 'avani', number: 'Avani', subtitle: `Example flat, ${subtitle(scene)}`, scene, catalog: structuredClone(localCatalog), currency: null, example: true };
}

/** Komitas flats with a checked furnished (or shell) scene. Scenes that fail the editor's checks are skipped. */
export function komitasFlats(records: InputRecord[]): Flat[] {
  return records.flatMap(record => {
    const catalog = Array.isArray(record.catalog) ? record.catalog : record.catalog.assets;
    const scene = record.furnished ?? record.shell;
    if (!scene || !validateScene(scene, catalog).ok) return [];
    const currency = record.conversation?.catalogCurrency ?? (!Array.isArray(record.catalog) ? record.catalog.currency : undefined);
    return [{ id: record.id, number: record.id.replace(/^b(\d+)-t(\d+)$/, '$1·$2'), subtitle: subtitle(scene), scene: structuredClone(scene), catalog, currency: currency === 'AMD' ? 'AMD' : null, example: false }];
  });
}

export function money(value: number, currency: Flat['currency']): string {
  const digits = Math.round(value).toLocaleString('en-US');
  return currency === 'AMD' ? `${digits} ֏` : digits;
}
