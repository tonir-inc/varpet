import type { FinishMaterial, Operation, SceneDocument } from '../contracts';
import { resolveWallFinishTargets } from './wall-finish-targets';

export type FinishPattern = 'solid' | 'tile' | 'wood' | 'terrazzo';
export interface FinishPreset {
  id: string;
  name: string;
  category: 'floor' | 'wall';
  color: string;
  accent: string;
  pattern: FinishPattern;
  /** Pattern repeat in metres, along the surface's two axes. */
  size: [number, number];
  roughness: number;
  description: string;
  /** Bundled seamless surface maps; identity persists through the preset marker. */
  texture?: 'oak' | 'walnut' | 'travertine' | 'marble';
}

export const FINISH_DRAG_TYPE = 'application/x-varpet-finish';

export const FINISH_PRESETS: FinishPreset[] = [
  { id: 'limestone', name: 'Warm limestone', category: 'floor', color: '#d7c8af', accent: '#b8aa95', pattern: 'tile', size: [0.6, 0.6], roughness: 0.88, texture: 'travertine', description: '60 × 60 cm · travertine stone' },
  { id: 'porcelain', name: 'Cloud porcelain', category: 'floor', color: '#e1e1db', accent: '#b9bdb6', pattern: 'tile', size: [0.6, 0.6], roughness: 0.58, texture: 'marble', description: '60 × 60 cm · marble-look tile' },
  { id: 'terracotta', name: 'Terracotta', category: 'floor', color: '#b87960', accent: '#8d6151', pattern: 'tile', size: [0.3, 0.3], roughness: 0.92, description: '30 × 30 cm · natural clay' },
  { id: 'slate', name: 'Charcoal slate', category: 'floor', color: '#646c6b', accent: '#444c4c', pattern: 'tile', size: [0.6, 0.4], roughness: 0.86, description: '60 × 40 cm · honed stone' },
  { id: 'oak', name: 'Natural oak', category: 'floor', color: '#b9956b', accent: '#887050', pattern: 'wood', size: [1.2, 0.18], roughness: 0.72, texture: 'oak', description: '18 × 120 cm · oak planks' },
  { id: 'walnut', name: 'Smoked walnut', category: 'floor', color: '#806249', accent: '#543f31', pattern: 'wood', size: [1.2, 0.18], roughness: 0.68, texture: 'walnut', description: '18 × 120 cm · walnut planks' },
  { id: 'terrazzo', name: 'Ivory terrazzo', category: 'floor', color: '#ddd8cc', accent: '#a69883', pattern: 'terrazzo', size: [0.6, 0.6], roughness: 0.66, description: '60 × 60 cm · fine aggregate' },
  { id: 'sage-terrazzo', name: 'Sage terrazzo', category: 'floor', color: '#a5afa3', accent: '#697b6c', pattern: 'terrazzo', size: [0.6, 0.6], roughness: 0.68, description: '60 × 60 cm · fine aggregate' },
  { id: 'chalk', name: 'Chalk white', category: 'wall', color: '#eeeae0', accent: '#d2cdc2', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Warm white · matte paint' },
  { id: 'linen', name: 'Soft linen', category: 'wall', color: '#d8c9b5', accent: '#bbad99', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Natural neutral · matte paint' },
  { id: 'sage', name: 'Quiet sage', category: 'wall', color: '#9eae98', accent: '#7d8f79', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Muted green · matte paint' },
  { id: 'olive', name: 'Olive grove', category: 'wall', color: '#85896c', accent: '#636a52', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Earthy green · matte paint' },
  { id: 'clay', name: 'Blush clay', category: 'wall', color: '#c89882', accent: '#ac7b66', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Warm terracotta · matte paint' },
  { id: 'rose', name: 'Dusty rose', category: 'wall', color: '#c5a5a3', accent: '#a78a88', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Soft pink · matte paint' },
  { id: 'blue', name: 'Blue hour', category: 'wall', color: '#8299ad', accent: '#647e95', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Muted blue · matte paint' },
  { id: 'graphite', name: 'Graphite', category: 'wall', color: '#575e64', accent: '#41474d', pattern: 'solid', size: [1, 1], roughness: 0.94, description: 'Deep grey · matte paint' },
];

export function getFinishPreset(id: string): FinishPreset | undefined {
  return FINISH_PRESETS.find(preset => preset.id === id);
}

const materialMarker = (preset: FinishPreset): string => `[varpet-finish:${preset.id}]`;

export function materialForPreset(preset: FinishPreset): FinishMaterial {
  return {
    id: `builtin-finish:${preset.id}`,
    name: preset.name,
    color: preset.color,
    unit: 'm2',
    unitCost: 0,
    thickness: preset.category === 'wall' ? 0.0002 : preset.pattern === 'wood' ? 0.014 : 0.01,
    wastePercent: 0,
    notes: `${materialMarker(preset)} Conceptual finish sample; no supplier or price has been specified. Set a quoted unit cost before budgeting.`,
  };
}

/** Pattern identity survives color edits and collision-safe material IDs. */
export function getPresetForMaterial(material: FinishMaterial | undefined): FinishPreset | undefined {
  if (!material || material.unit !== 'm2') return undefined;
  return FINISH_PRESETS.find(preset => material.notes?.startsWith(`${materialMarker(preset)} `));
}

export function buildFinishOperations(
  scene: SceneDocument,
  preset: FinishPreset,
  entityId: string,
  surface: 'floor' | 'wall-front' | 'wall-back',
): Operation[] {
  const floor = surface === 'floor';
  if (preset.category !== (floor ? 'floor' : 'wall')) throw new Error(`Choose ${floor ? 'a floor material' : 'a wall paint'} for this surface.`);
  const entity = floor ? scene.rooms.find(room => room.id === entityId) : scene.walls.find(wall => wall.id === entityId);
  if (!entity) throw new Error(`This ${floor ? 'floor' : 'wall'} no longer exists.`);
  const project = scene.project;
  const targets = surface === 'floor' ? [{ entityId, surface }] : resolveWallFinishTargets(scene, entityId, surface);
  for (const target of targets) {
    const metadata = project?.metadata[target.entityId];
    if (metadata?.locked) throw new Error(`This ${floor ? 'room' : 'wall face includes a section that'} is locked. Unlock it in its properties before applying a finish.`);
    if (metadata?.phase === 'remove') throw new Error(`This ${floor ? 'room' : 'wall face includes a section that'} is marked for removal. Restore it before applying a finish.`);
  }
  // A tinted sample retains its pattern, but choosing the original swatch must
  // restore the original color without changing other surfaces using that tint.
  const matchesPreset = (material: FinishMaterial | undefined): boolean => getPresetForMaterial(material)?.id === preset.id && material?.color.toLowerCase() === preset.color.toLowerCase();
  const assignments = targets.map(target => ({ ...target,
    existing: project?.finishes.find(finish => finish.entityId === target.entityId && finish.surface === target.surface),
  }));
  const changed = assignments.filter(target => !matchesPreset(project?.materials.find(material => material.id === target.existing?.materialId)));
  if (!changed.length) return [];

  // IDs are shared with geometry and project records, including inactive designs.
  // A user's material may occupy the preferred ID; it must never be overwritten.
  const records: { id: string }[] = [...scene.rooms, ...scene.walls, ...scene.walls.flatMap(wall => wall.openings), ...scene.objects];
  if (project) {
    records.push(...project.components, ...project.routes, ...project.sources, ...project.assumptions, ...project.materials, ...project.finishes, ...project.tasks, ...project.options);
    for (const snapshot of [project.baseline, ...project.options.map(option => option.snapshot)]) {
      if (snapshot) records.push(...snapshot.rooms, ...snapshot.walls, ...snapshot.walls.flatMap(wall => wall.openings), ...snapshot.objects, ...snapshot.components, ...snapshot.routes, ...snapshot.finishes);
    }
  }
  const usedIds = new Set(records.map(record => record.id));
  const freeId = (base: string): string => {
    const stem = base.slice(0, 90);
    let id = stem, suffix = 1;
    while (usedIds.has(id)) id = `${stem}:${suffix++}`;
    usedIds.add(id);
    return id;
  };

  const operations: Operation[] = scene.version === 1 ? [{ type: 'migrate-project' }] : [];
  let material = project?.materials.find(matchesPreset);
  if (!material) {
    material = materialForPreset(preset);
    material.id = freeId(material.id);
    operations.push({ type: 'upsert-material', material });
  }
  for (const target of changed) operations.push({ type: 'upsert-finish', finish: {
    id: target.existing?.id ?? freeId(`finish:${target.entityId}:${target.surface}`),
    entityId: target.entityId, surface: target.surface, materialId: material.id,
  } });
  return operations;
}
