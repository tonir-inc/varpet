/**
 * The editor's own scene checks, loaded by `server/developers.mjs` (through Vite) so a published bundle
 * passes exactly the validation the editor applies when it reopens the scene.
 */
import { validateScene } from '../core/validation';
import { localCatalog } from '../core/demo';
import { sceneCatalogIds } from '../adapters/database-catalog';
import type { CatalogAsset } from '../contracts';

export { localCatalog, sceneCatalogIds };

export function checkBundleScene(scene: unknown, assets: CatalogAsset[]): { ok: boolean; errors: string[] } {
  const result = validateScene(scene, assets);
  return { ok: result.ok, errors: result.ok ? [] : result.errors.slice(0, 5) };
}
