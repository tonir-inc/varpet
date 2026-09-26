import * as THREE from 'three';
import type { EntityMetadata, Opening } from '../contracts';
import { openingModelEntry, type OpeningModelEntry } from '../core/opening-catalog';
import type { OpeningProjection } from './structure';

export type { OpeningModelEntry } from '../core/opening-catalog';

const urls = import.meta.glob('../../../../catalog/openings/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** The model an opening's assetId names, or undefined when it names none (the procedural opening stays). */
export function openingModel(assetId: string | undefined): { url: string; entry: OpeningModelEntry } | undefined {
  const entry = openingModelEntry(assetId);
  const url = entry && Object.entries(urls).find(([path]) => path.endsWith(`/${entry.file}`))?.[1];
  return entry && url ? { url, entry } : undefined;
}

interface Motion { pivot: THREE.Object3D; axis: 'x' | 'y' | 'slide'; max: number; sign: number }

/** How a moving part opens, read from the manifest's motion text; the tilt of a tilt-turn sash only when the opening tilts. */
function motionOf(text: string, point: number[], mechanism: string): Omit<Motion, 'pivot'> {
  const slide = /translate 0\.\.([\d.]+) m along ([+-])X/.exec(text);
  if (slide) return { axis: 'slide', max: Number(slide[1]), sign: slide[2] === '-' ? -1 : 1 };
  const tilt = /(?:tilt:|about X)[^;]*?0\.\.(\d+)deg/.exec(text);
  if (tilt && (mechanism === 'tilt' || !text.includes('about +Y'))) return { axis: 'x', max: THREE.MathUtils.degToRad(Number(tilt[1])), sign: 1 };
  // A leaf hinged on the left (-X) reaches +Z turning negatively about +Y; a right leaf and a -Z swing flip it.
  return { axis: 'y', max: Math.PI / 2, sign: (point[0]! < 0 ? -1 : 1) * (text.includes('(-Z)') ? -1 : 1) };
}

/**
 * Draw an opening with its catalog model in place of the procedural frame and leaves, which stay (hidden) for
 * the checks and fallbacks that read them. The model is placed by its own origin, bottom centre of the hole on
 * the wall's mid-plane, and scaled to the opening; hinge and swing mirror it. setAngle drives its moving parts.
 */
export function installOpeningModel(projection: OpeningProjection, opening: Opening, metadata: EntityMetadata, entry: OpeningModelEntry, model: THREE.Group): void {
  const { group } = projection;
  for (const child of group.children) if (child !== group.userData.envelope && !(child instanceof THREE.Sprite)) child.visible = false;
  const outward = Object.values(entry.moving).some(part => part.motion.includes('(-Z)')) ? -1 : 1;
  const mirrorX = entry.mechanism === 'hinged' && metadata.hinge === 'right' ? -1 : 1;
  const holder = new THREE.Group(); holder.name = 'opening-model';
  holder.position.set(opening.width / 2, 0, 0);
  holder.scale.set(mirrorX * opening.width / entry.opening_m.width, opening.height / entry.opening_m.height, outward * (metadata.swing ?? 1));
  holder.add(model); model.updateMatrixWorld(true);
  const motions: Motion[] = [];
  for (const [prefix, part] of Object.entries(entry.moving).sort(([a], [b]) => b.length - a.length)) {
    const parts: THREE.Object3D[] = [];
    model.traverse(object => { if (object.name.startsWith(prefix) && !parts.some(p => isInside(object, p)) && !motions.some(m => isInside(object, m.pivot))) parts.push(object); });
    if (!parts.length) continue;
    const pivot = new THREE.Group(); pivot.position.fromArray(part.point_m); model.add(pivot); pivot.updateMatrixWorld(true);
    for (const object of parts) pivot.attach(object);
    motions.push({ pivot, ...motionOf(part.motion, part.point_m, metadata.mechanism ?? entry.mechanism) });
  }
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const clear = (Array.isArray(object.material) ? object.material : [object.material]).some(material => material.transparent);
    object.castShadow = !clear; object.receiveShadow = !clear;
  });
  group.add(holder);
  const procedural = projection.setAngle;
  projection.setAngle = (angle: number) => {
    procedural(angle);
    const t = projection.angle / (Math.PI / 2);
    for (const { pivot, axis, max, sign } of motions) {
      pivot.rotation.set(0, 0, 0);
      if (axis === 'slide') pivot.position.x = pivot.userData.restX + sign * max * t;
      else pivot.rotation[axis] = sign * max * t;
    }
    group.updateMatrixWorld(true);
  };
  for (const { pivot } of motions) pivot.userData.restX = pivot.position.x;
  projection.setAngle(projection.angle);
}

function isInside(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
}
