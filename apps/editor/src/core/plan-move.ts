import type { BuildingComponent, CatalogAsset, Operation, SceneDocument, SceneObject, Vec2, Wall } from '../contracts';
import { wallLength } from './geometry';
import { furnitureMembers, furnitureUpdates } from './grouping';
import { constrainOpeningOffset, findOpeningMove, type OpeningMoveContext } from './opening-move';
import { applyRenovationOperation, invalidateAssumptions } from './renovation';
import { validateScene } from './validation';

interface PlanMoveBase {
  source: SceneDocument;
  id: string;
  label: string;
}
export type PlanMove = PlanMoveBase & (
  | { kind: 'wall'; wall: Wall }
  | { kind: 'endpoint'; wall: Wall; endpoint: 'start' | 'end' }
  | { kind: 'opening'; context: OpeningMoveContext }
  | { kind: 'object'; object: SceneObject }
  | { kind: 'component'; component: BuildingComponent; wall?: Wall }
);
export interface PlanMovePreview { scene: SceneDocument | null; operation: Operation | null; error?: string }
type MoveOperation = Extract<Operation, { type: 'update' | 'update-wall' | 'update-opening' | 'upsert-component' }>;

const EPS = 1e-9;
const unchanged = (a: number, b: number) => Math.abs(a - b) < EPS;
const quantize = (value: number, step: number, snap: boolean) => snap ? Math.round(value * (1 / step)) / (1 / step) : value;
const wallProjection = (wall: Wall, delta: Vec2): number =>
  (delta[0] * (wall.end[0] - wall.start[0]) + delta[1] * (wall.end[1] - wall.start[1])) / wallLength(wall);

/** Capture one immutable scene as the origin for every preview in this gesture. */
export function createPlanMove(scene: SceneDocument, id: string, endpoint?: 'start' | 'end'): PlanMove | undefined {
  if (scene.project?.metadata[id]?.locked) return;
  const base = { source: scene, id };
  const wall = scene.walls.find(item => item.id === id);
  if (wall) return endpoint
    ? { ...base, kind: 'endpoint', wall, endpoint, label: 'Move wall endpoint' }
    : { ...base, kind: 'wall', wall, label: 'Move wall' };
  if (endpoint) return;
  const context = findOpeningMove(scene, id);
  if (context) return { ...base, kind: 'opening', context, label: `Move ${context.opening.kind}` };
  const object = scene.objects.find(item => item.id === id);
  if (object) {
    if (furnitureMembers(scene, id).some(member => scene.project?.metadata[member.id]?.locked)) return;
    return { ...base, kind: 'object', object, label: 'Move furniture' };
  }
  const component = scene.project?.components.find(item => item.id === id);
  if (component) {
    const host = component.host ? scene.walls.find(item => item.id === component.host!.wallId) : undefined;
    if (component.host && (!host || scene.project?.metadata[host.id]?.locked)) return;
    return { ...base, kind: 'component', component, wall: host, label: 'Move component' };
  }
}

function movementOperation(move: PlanMove, delta: Vec2, snap: boolean): MoveOperation | null {
  if (unchanged(delta[0], 0) && unchanged(delta[1], 0)) return null;
  switch (move.kind) {
    case 'wall': {
      const { wall } = move, length = wallLength(wall);
      const normal: Vec2 = [-(wall.end[1] - wall.start[1]) / length, (wall.end[0] - wall.start[0]) / length];
      const distance = quantize(delta[0] * normal[0] + delta[1] * normal[1], 0.05, snap);
      if (unchanged(distance, 0)) return null;
      return { type: 'update-wall', id: move.id, patch: {
        start: [wall.start[0] + normal[0] * distance, wall.start[1] + normal[1] * distance],
        end: [wall.end[0] + normal[0] * distance, wall.end[1] + normal[1] * distance],
      } };
    }
    case 'endpoint': {
      const origin = move.wall[move.endpoint];
      const point: Vec2 = [quantize(origin[0] + delta[0], 0.05, snap), quantize(origin[1] + delta[1], 0.05, snap)];
      if (unchanged(point[0], origin[0]) && unchanged(point[1], origin[1])) return null;
      return { type: 'update-wall', id: move.id, patch: { [move.endpoint]: point } };
    }
    case 'opening': {
      const distance = wallProjection(move.context.wall, delta);
      if (unchanged(distance, 0)) return null;
      const offset = constrainOpeningOffset(move.context, move.context.opening.offset + distance, snap);
      return unchanged(offset, move.context.opening.offset) ? null : { type: 'update-opening', id: move.id, patch: { offset } };
    }
    case 'object': {
      const origin = move.object.position;
      const x = quantize(origin[0] + delta[0], 0.25, snap), z = quantize(origin[2] + delta[1], 0.25, snap);
      return unchanged(x, origin[0]) && unchanged(z, origin[2]) ? null : { type: 'update', id: move.id, patch: { position: [x, origin[1], z] } };
    }
    case 'component': {
      const component = structuredClone(move.component);
      if (component.host && move.wall) {
        const distance = wallProjection(move.wall, delta);
        if (unchanged(distance, 0)) return null;
        const halfWidth = component.dimensions[0] / 2;
        const offset = Math.max(halfWidth, Math.min(wallLength(move.wall) - halfWidth, quantize(component.host.offset + distance, 0.05, snap)));
        if (unchanged(offset, component.host.offset)) return null;
        component.host.offset = offset;
      } else {
        const origin = component.position;
        const x = quantize(origin[0] + delta[0], 0.05, snap), z = quantize(origin[2] + delta[1], 0.05, snap);
        if (unchanged(x, origin[0]) && unchanged(z, origin[2])) return null;
        component.position = [x, origin[1], z];
      }
      return { type: 'upsert-component', component };
    }
  }
}

/** A preview is disposable; only its checked semantic operation may enter history. */
export function previewPlanMove(move: PlanMove, delta: Vec2, snap: boolean, catalog: CatalogAsset[]): PlanMovePreview {
  const reject = (error: string): PlanMovePreview => ({ scene: null, operation: null, error });
  if (!delta.every(Number.isFinite)) return reject('Movement must use finite coordinates.');
  try {
    const operation = movementOperation(move, delta, snap);
    if (!operation) return { scene: move.source, operation: null };
    let candidate = structuredClone(move.source);
    if (operation.type === 'update') {
      const updates = furnitureUpdates(candidate, move.id, operation.patch);
      const byId = new Map(updates.map(object => [object.id, object]));
      candidate.objects = candidate.objects.map(object => byId.get(object.id) ?? object);
      invalidateAssumptions(candidate, updates.map(object => object.id));
    } else candidate = applyRenovationOperation(candidate, operation);
    const validation = validateScene(candidate, catalog);
    return validation.ok ? { scene: candidate, operation } : reject(validation.errors.join(' '));
  } catch (error) {
    return reject(error instanceof Error ? error.message : 'This movement could not be applied.');
  }
}
