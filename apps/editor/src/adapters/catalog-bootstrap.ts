import type { CatalogAsset } from '../contracts';
import { demoScene, localCatalog } from '../core/demo';
import { validateScene } from '../core/validation';
import { createCatalogHttpAdapter, mergeCatalogs } from './catalog-http';

/** Resolve the complete catalog before constructing the immutable editor store. */
export async function loadEditorCatalog(url?: string): Promise<CatalogAsset[]> {
  if (!url?.trim()) return localCatalog;
  try {
    const catalog = mergeCatalogs(localCatalog, await createCatalogHttpAdapter({ url }).list());
    const checked = validateScene(demoScene, catalog);
    if (!checked.ok) throw new Error(checked.errors.join(' '));
    return catalog;
  } catch (error) {
    console.warn('Catalog service unavailable, using the demo catalog', error);
    return localCatalog;
  }
}
