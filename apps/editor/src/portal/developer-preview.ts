/** The 3D half of a profile card. Loaded lazily with three.js, only once a card scrolls into view. */
import type { Bundle } from './bundles-contract';
import { renderApartmentPreview } from './preview';

export function renderBundlePreview(host: HTMLElement, bundle: Bundle): () => void {
  return renderApartmentPreview(host, bundle.scene);
}
