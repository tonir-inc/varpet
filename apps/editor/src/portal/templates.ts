import type { SceneDocument } from '../contracts';
import { parseScene } from '../core/persistence';
import { createInitialScene } from '../core/initial-scene';
import m6 from '../../../../apartments/m6-12-54/scene.json';

export interface ApartmentTemplate {
  id: string; name: string; developer: string; location: string; description: string;
  bedrooms: number; area: number; scene: SceneDocument;
}
function area(scene: SceneDocument) {
  return Math.round(scene.rooms.reduce((total, room) => total + Math.abs(room.polygon.reduce((sum, p, i) => {
    const q = room.polygon[(i + 1) % room.polygon.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2, 0));
}
const avani = createInitialScene();
const balcony = parseScene(JSON.stringify(m6), []);
export const apartmentTemplates: ApartmentTemplate[] = [
  { id: 'avani', name: 'The Avani Apartment', developer: 'Varpet sample collection', location: 'Sample apartment',
    description: 'An open living and dining space, a separate kitchen, and a quiet bedroom. A generous starting point for making room for your everyday life.',
    bedrooms: 1, area: area(avani), scene: avani },
  { id: 'm6', name: 'The Balcony Apartment', developer: 'M6 plan collection', location: 'Plan estimate · location not supplied',
    description: 'Two bedrooms and two balconies, traced from the M6 developer plan. Dimensions are estimates; the original plan and measurement assumptions stay with your apartment.',
    bedrooms: 2, area: area(balcony), scene: balcony },
];
export const getTemplate = (id: string) => apartmentTemplates.find(plan => plan.id === id);
export function createTemplateScene(id: string): SceneDocument {
  const template = getTemplate(id);
  if (!template) throw new Error('This apartment plan was not found. Choose another plan.');
  const scene = structuredClone(template.scene);
  scene.id = crypto.randomUUID();
  return scene;
}

/** The thumbnail is a view of the same model opened by the editor. */
export function mountPlanPreview(host: HTMLElement, scene: SceneDocument): () => void {
  let disposed = false;
  let cleanup: (() => void) | undefined;
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', `${scene.name} · 3D floor plan`);
  void import('./preview').then(module => {
    if (!disposed) cleanup = module.renderApartmentPreview(host, scene);
  }).catch(() => { if (!disposed) host.textContent = '3D preview unavailable. You can still open this apartment.'; });
  return () => { disposed = true; cleanup?.(); };
}
