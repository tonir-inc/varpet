/**
 * The 3D half of a profile card: the catalog's furnished preview (one shared WebGL context for every card,
 * a live-scene cap, furniture stand-ins replaced by light models). Loaded lazily with three.js.
 */
import type { Bundle } from './bundles-contract';
import { mountFurnishedPreview, type FurnishedPreview } from './preview';

export function renderBundlePreview(host: HTMLElement, bundle: Bundle, reducedMotion: () => boolean): FurnishedPreview {
  return mountFurnishedPreview(host, bundle.scene, bundle.catalog.map(product => product.asset), { rise: true, reducedMotion });
}
