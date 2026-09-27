/**
 * Plan bundles: a developer's floor plan (the source drawing) paired with the furnished 3D apartment built from it.
 *
 * Shared contract between two portal lanes. Change it only with a board message to the other lane.
 * - portal-catalog: the Catalog tab (`/?view=catalog`), opening a bundle in Design (`/?bundle=<id>`), `app.ts` routing.
 * - portal-profile: developer profiles (`/?developer=<slug>`, `/?view=studio`) and `server/developers.mjs`, which
 *   serves the HTTP API below: sample bundles shipped from `apartments/` plus bundles published through a profile.
 */
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';

export interface DeveloperSummary {
  slug: string;
  name: string;
  city: string;
  tagline: string;
  bundleCount: number;
  /** Same-origin image, or null for an initials mark. */
  logoUrl: string | null;
}

export interface Developer extends DeveloperSummary {
  about: string;
  website: string | null;
  /** True when the signed-in viewer may edit this profile and publish to it. */
  ownedByViewer: boolean;
  bundles: BundleSummary[];
}

export interface BundleSummary {
  /** Globally unique and URL-safe. */
  id: string;
  developerSlug: string;
  developerName: string;
  /** "Type 7 · top floor" */
  name: string;
  /** "Orion", "Sunday Towers · B", or null when not supplied. */
  building: string | null;
  bedrooms: number;
  /** m²: the developer's figure when supplied, otherwise summed from the scene's room polygons. */
  area: number;
  /** Same-origin URL of the original plan image. */
  blueprintUrl: string;
  /** `sample` ships from `apartments/`; `published` was uploaded through a developer profile. */
  source: 'sample' | 'published';
  furnishedPieces: number;
  updatedAt: string;
}

export interface Bundle extends BundleSummary {
  /** The furnished scene, in the editor's scene format. */
  scene: SceneDocument;
  /** Catalog products the scene references, so it reopens without guessing. */
  catalog: CatalogProduct[];
}

const enc = encodeURIComponent;

/** Public reads. Error bodies are `{error, code}` like the accounts API. */
export const BUNDLE_API = {
  /** GET → {developers: DeveloperSummary[]} */
  developers: '/api/developers',
  /** GET → {developer: Developer} */
  developer: (slug: string) => `/api/developers/${enc(slug)}`,
  /** GET, optional ?developer=<slug> → {bundles: BundleSummary[]} */
  bundles: '/api/bundles',
  /** GET → {bundle: Bundle} */
  bundle: (id: string) => `/api/bundles/${enc(id)}`,
  /** GET → image bytes */
  blueprint: (id: string) => `/api/bundles/${enc(id)}/blueprint`,
} as const;
/*
 * Owner writes (signed-in account; portal-profile lane only):
 *   POST   /api/developers                      {name, slug, city, tagline, about, website}  → {developer}
 *   PUT    /api/developers/:slug                same fields                                   → {developer}
 *   POST   /api/developers/:slug/bundles        {name, building, bedrooms?, area?, scene, catalog, blueprint: data URL} → {bundle}
 *   DELETE /api/bundles/:id                                                                   → {ok: true}
 */

export const catalogHref = '/?view=catalog';
export const developerHref = (slug: string) => `/?developer=${enc(slug)}`;
/** The signed-in account's own developer profile: create, edit, upload plans, publish. */
export const studioHref = '/?view=studio';
/** Opens the furnished bundle in the editor's Design phase, with its existing furniture and the designer chat. */
export const bundleHref = (id: string) => `/?bundle=${enc(id)}`;
