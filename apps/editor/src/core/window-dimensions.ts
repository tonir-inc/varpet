import type { Opening, Operation, SceneDocument, Wall } from '../contracts';

export type WindowDimensionMatch = 'height' | 'size';
interface WindowTarget { wall: Wall; opening: Opening }

function sourceWindow(scene: SceneDocument, id: string): WindowTarget {
  const wall = scene.walls.find(candidate => candidate.openings.some(opening => opening.id === id));
  const opening = wall?.openings.find(candidate => candidate.id === id);
  if (!wall || !opening || opening.kind !== 'window') throw new Error('Select an existing window to match its dimensions.');
  return { wall, opening };
}

/** Saved dimensions define the batch; locks remain visible in the affected count. */
export function windowDimensionTargets(scene: SceneDocument, id: string, match: WindowDimensionMatch): WindowTarget[] {
  if (match !== 'height' && match !== 'size') throw new Error('Choose height only or width and height to match windows.');
  const source = sourceWindow(scene, id).opening;
  return scene.walls.flatMap(wall => scene.project?.metadata[wall.id]?.phase === 'remove' ? [] : wall.openings
    .filter(opening => opening.id !== id && opening.kind === 'window' && scene.project?.metadata[opening.id]?.phase !== 'remove'
      && (opening.height !== source.height || match === 'size' && opening.width !== source.width))
    .map(opening => ({ wall, opening })));
}

function requireEditable(scene: SceneDocument, id: string, fallback: string): void {
  const metadata = scene.project?.metadata[id];
  const name = metadata?.name?.trim() || fallback;
  if (metadata?.locked) throw new Error(`“${name}” is locked. Unlock it in Renovate before matching window dimensions.`);
  if (metadata?.phase === 'remove') throw new Error(`“${name}” is marked for removal. Restore it before matching window dimensions.`);
}

/** One checked transaction preserves every target's sill, position and product. */
export function buildWindowDimensionOperations(scene: SceneDocument, id: string, match: WindowDimensionMatch): Operation[] {
  const source = sourceWindow(scene, id);
  requireEditable(scene, source.wall.id, `Wall ${source.wall.id}`);
  requireEditable(scene, id, `Window ${id}`);
  const targets = windowDimensionTargets(scene, id, match);
  if (!targets.length) return [];
  const migrate = scene.version === 1;
  if (targets.length + Number(migrate) > 100) throw new Error('Matching these windows exceeds the 100-operation limit. Resize some windows individually, then try again.');
  const operations: Operation[] = migrate ? [{ type: 'migrate-project' }] : [];
  for (const { wall, opening } of targets) {
    requireEditable(scene, wall.id, `Wall ${wall.id}`);
    requireEditable(scene, opening.id, `Window ${opening.id}`);
    operations.push({ type: 'update-opening', id: opening.id, patch: match === 'height'
      ? { height: source.opening.height }
      : { width: source.opening.width, height: source.opening.height } });
  }
  return operations;
}
