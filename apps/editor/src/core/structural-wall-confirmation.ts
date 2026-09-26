import type { EntityMetadata, Operation, SceneDocument, Wall } from '../contracts';

export interface StructuralWallChange {
  id: string;
  name: string;
  role: 'structural' | 'unknown';
  boundary?: EntityMetadata['boundary'];
}

/** Imports and saved-option switches have their own review/navigation workflow. */
export function mayChangeWallStructure(operation: Operation): boolean {
  switch (operation.type) {
    case 'update-wall': return ['start', 'end', 'height', 'thickness'].some(key => Object.hasOwn(operation.patch, key));
    case 'update-opening': return ['offset', 'width', 'height', 'sill'].some(key => Object.hasOwn(operation.patch, key));
    case 'add-wall':
    case 'delete-wall':
    case 'split-wall':
    case 'join-walls':
    case 'add-opening':
    case 'delete-opening': return true;
    case 'set-metadata': return Object.hasOwn(operation.patch, 'elevation') || operation.patch.phase === 'remove' || operation.patch.phase === 'replace';
    default: return false;
  }
}

/** An opening's installed product can change without cutting a different hole. */
function wallGeometry(scene: SceneDocument, wall: Wall): string {
  const openings = wall.openings.map(opening => [opening.offset, opening.width, opening.height, opening.sill])
    .sort((first, second) => {
      for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) return first[i]! - second[i]!;
      return 0;
    });
  return JSON.stringify([wall.start, wall.end, wall.height, wall.thickness, scene.project?.metadata[wall.id]?.elevation ?? 0, openings]);
}

/**
 * Inspect the same checked candidate the store would commit, including connected
 * walls and topology normalization. This never edits either snapshot or infers a
 * structural classification from a wall's thickness, boundary or edit lock.
 *
 * Operations distinguish an explicit demolition/replacement from the incidental
 * replacement phase that existing operations also set for paint or product edits.
 */
export function structuralWallChanges(scene: SceneDocument, candidate: SceneDocument, operations: readonly Operation[]): StructuralWallChange[] {
  if (!operations.some(mayChangeWallStructure)) return [];
  const explicitPhases = new Set<string>();
  for (const operation of operations) {
    if (operation.type === 'delete-wall') explicitPhases.add(operation.id);
    if (operation.type === 'set-metadata' && (operation.patch.phase === 'remove' || operation.patch.phase === 'replace')) explicitPhases.add(operation.id);
  }
  const changedPhase = (id: string): boolean => {
    if (!explicitPhases.has(id)) return false;
    const before = scene.project?.metadata[id]?.phase ?? 'existing';
    const after = candidate.project?.metadata[id]?.phase ?? 'existing';
    return before !== after && (after === 'remove' || after === 'replace');
  };
  const nextWalls = new Map(candidate.walls.map(wall => [wall.id, wall]));
  return scene.walls.flatMap(wall => {
    const before = scene.project?.metadata[wall.id], after = candidate.project?.metadata[wall.id];
    const beforeRole = before?.structuralRole ?? 'unknown', afterRole = after?.structuralRole ?? beforeRole;
    // Reclassification in the same command must not silently bypass a warning.
    if (beforeRole === 'partition' && afterRole === 'partition') return [];
    const next = nextWalls.get(wall.id);
    const changed = !next || wallGeometry(scene, wall) !== wallGeometry(candidate, next)
      || changedPhase(wall.id) || wall.openings.some(opening => changedPhase(opening.id));
    if (!changed) return [];
    return [{
      id: wall.id,
      name: before?.name?.trim() || after?.name?.trim() || wall.id,
      role: beforeRole === 'structural' || afterRole === 'structural' ? 'structural' as const : 'unknown' as const,
      boundary: before?.boundary ?? after?.boundary,
    }];
  });
}
