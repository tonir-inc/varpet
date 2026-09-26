import type { BuildingComponent, CeilingDesign, Operation, PropertyAssumption, Room, SceneDocument, Vec2 } from '../contracts';
import { buildCeilingDesignOperations, defaultCeilingDesign } from './ceiling-design';
import { componentPosition, wallLength } from './geometry';
import { hasRoomCeiling, roomCeilingHeight } from './heights';
import { migrateScene } from './renovation';
import { wallSurfaceSpans } from './wall-surfaces';

const EPS = 1e-6;
const SWITCH_WIDTH = .085, SWITCH_HEIGHT = .085, SWITCH_DEPTH = .025;
type Interval = [number, number];

function inside([x, z]: Vec2, polygon: Vec2[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!, b = polygon[i]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

const active = (scene: SceneDocument, component: BuildingComponent) => component.phase !== 'remove' && scene.project?.metadata[component.id]?.phase !== 'remove';

function designAssumption(entityId: string, property: string, value: string, rationale: string, alternatives: string[], dependsOn?: string[]): PropertyAssumption {
  return { id: crypto.randomUUID(), entityId, property, value, status: 'unresolved', sourceKind: 'design', sourceIds: [], rationale, alternatives, dependsOn,
    question: 'Keep this proposed design, choose another option, or confirm it against the actual apartment?' };
}

function subtract(intervals: Interval[], low: number, high: number): Interval[] {
  return intervals.flatMap(([start, end]): Interval[] => high <= start || low >= end ? [[start, end]]
    : [[start, Math.min(end, low)], [Math.max(start, high), end]].filter(([a, b]) => b! - a! > EPS) as Interval[]);
}

/** A reviewable room control. Placement is a proposed choice, never inferred electrical evidence. */
export function buildCeilingSwitchOperations(scene: SceneDocument, roomId: string): Operation[] {
  const room = scene.rooms.find(candidate => candidate.id === roomId);
  if (!room) throw new Error('Select an existing room for its ceiling switch.');
  const metadata = scene.project?.metadata[roomId];
  if (metadata?.locked) throw new Error('Unlock this room before adding its ceiling switch.');
  if (metadata?.phase === 'remove' || !hasRoomCeiling(scene, room) || !metadata?.ceilingDesign) return [];
  if (scene.project!.components.some(component => active(scene, component) && component.kind === 'switch' && component.control?.targets.includes(roomId))) return [];
  if (scene.project!.components.length >= 500 || scene.project!.assumptions.length >= 2000) return [];
  const elevation = (metadata.elevation ?? 0) + 1.1;
  if (elevation < -10 || elevation > 20) return [];
  const half = SWITCH_WIDTH / 2;
  const candidates: { component: BuildingComponent; score: number }[] = [];
  for (const wall of scene.walls) {
    const wallMeta = scene.project?.metadata[wall.id];
    const base = wallMeta?.elevation ?? 0;
    if (wallMeta?.phase === 'remove' || wallMeta?.locked || elevation < base || elevation + SWITCH_HEIGHT > base + wall.height) continue;
    const length = wallLength(wall);
    if (length < .4) continue;
    const dx = (wall.end[0] - wall.start[0]) / length, dz = (wall.end[1] - wall.start[1]) / length;
    for (const span of wallSurfaceSpans(wall, [room], scene.project?.metadata)) for (const side of [1, -1] as const) {
      if (!(side === 1 ? span.front : span.back)) continue;
      let available: Interval[] = [[Math.max(.2, span.start + half + .05), Math.min(100, length - .2, span.end - half - .05)]];
      if (available[0]![1] < available[0]![0]) continue;
      for (const opening of wall.openings) {
        if (scene.project?.metadata[opening.id]?.phase === 'remove') continue;
        if (base + opening.sill < elevation + SWITCH_HEIGHT && base + opening.sill + opening.height > elevation)
          available = subtract(available, opening.offset - half - .15, opening.offset + opening.width + half + .15);
      }
      for (const component of scene.project!.components) {
        if (!active(scene, component) || component.host?.wallId !== wall.id || component.host.side !== side) continue;
        if (component.host.elevation < elevation + SWITCH_HEIGHT && component.host.elevation + component.dimensions[1] > elevation)
          available = subtract(available, component.host.offset - component.dimensions[0] / 2 - half - .1, component.host.offset + component.dimensions[0] / 2 + half + .1);
      }
      for (const [start, end] of available) for (const offset of [start, end, (start + end) / 2]) {
        // Check the complete footprint beyond the finished wall face, including concave rooms.
        const fits = [-half, half].every(along => [.001, SWITCH_DEPTH].every(depth => {
          const across = side * (wall.thickness / 2 + depth);
          return inside([wall.start[0] + dx * (offset + along) - dz * across, wall.start[1] + dz * (offset + along) + dx * across], room.polygon);
        }));
        if (!fits) continue;
        const component: BuildingComponent = { id: '', name: `${room.name.slice(0, 105)} ceiling switch`, kind: 'switch', position: [0, elevation, 0], dimensions: [SWITCH_WIDTH, SWITCH_HEIGHT, SWITCH_DEPTH],
          rotation: 0, color: '#f4f1e9', phase: 'new', roomId, host: { wallId: wall.id, offset, elevation, side },
          control: { type: 'single', targets: [roomId], gangs: 1 },
          notes: 'Proposed ceiling-light control at 1.10 m above this room’s floor. Position and wiring need review; no electrical route is inferred.' };
        component.position = componentPosition(scene, component);
        const doors = wall.openings.filter(opening => opening.kind === 'door' && scene.project?.metadata[opening.id]?.phase !== 'remove');
        const score = doors.length ? Math.min(...doors.flatMap(door => [Math.abs(offset - door.offset), Math.abs(offset - door.offset - door.width)])) : 100 + offset;
        candidates.push({ component, score });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  const component = candidates[0]?.component;
  if (!component) return [];
  component.id = crypto.randomUUID();
  const assumption = designAssumption(component.id, 'host', 'Proposed room ceiling switch, 1.10 m above the floor',
    'Added as an editable design choice on a clear inward-facing wall surface. The plan does not establish an existing switch, its wiring, or installation suitability.',
    ['Move the switch to a confirmed location', 'Use another existing control', 'Remove the proposed switch'], [roomId, component.host!.wallId]);
  return [{ type: 'upsert-component', component }, { type: 'upsert-assumption', assumption }];
}

function hasAuthoredLight(scene: SceneDocument, room: Room): boolean {
  const floor = scene.project?.metadata[room.id]?.elevation ?? 0, top = floor + roomCeilingHeight(scene, room);
  return scene.project!.components.some(component => {
    if (component.kind !== 'light' || !active(scene, component)) return false;
    if (component.roomId) return component.roomId === room.id;
    const position = componentPosition(scene, component);
    return position[1] >= floor - EPS && position[1] <= top + EPS && inside([position[0], position[2]], room.polygon);
  });
}

/** Generation-only defaults. Never call from general scene migration, save/load or JSON import. */
export function decorateGeneratedCeilings(input: SceneDocument): SceneDocument {
  const scene = migrateScene(input), project = scene.project!;
  for (const room of scene.rooms) {
    const metadata = project.metadata[room.id];
    if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) continue;
    if (metadata?.locked || metadata?.phase === 'remove' || !hasRoomCeiling(scene, room)) continue;
    if (!Object.hasOwn(metadata ?? {}, 'ceilingDesign') && !hasAuthoredLight(scene, room) && project.assumptions.length < 1999) {
      let design: CeilingDesign | undefined;
      for (const inset of [.55, .35, .15]) {
        const candidate = { ...defaultCeilingDesign('quiet'), inset };
        try { buildCeilingDesignOperations(scene, room.id, candidate); design = candidate; break; } catch { /* An optional design must never prevent shell reconstruction. */ }
      }
      if (design) {
        project.metadata[room.id] = { ...metadata, ceilingDesign: design };
        project.assumptions.push(designAssumption(room.id, 'ceilingDesign', 'Recessed spotlights (editable starter design)',
          'Added while generating the apartment as a proposed lighting choice. No supplied plan or photograph confirms these fixtures.',
          ['Track lighting', 'Concealed LED lighting', 'Plain ceiling without added fixtures']));
      } else if (!project.assumptions.some(entry => entry.entityId === room.id && entry.property === 'ceilingDesign')) {
        project.assumptions.push(designAssumption(room.id, 'ceilingDesign', 'No starter design fits this room',
          'The ceiling needs an individual design because the starter layout could not fit the room geometry or headroom.', ['Keep the plain ceiling', 'Design individual lighting for this room']));
      }
    }
    for (const operation of buildCeilingSwitchOperations(scene, room.id)) {
      if (operation.type === 'upsert-component') project.components.push(operation.component);
      if (operation.type === 'upsert-assumption') project.assumptions.push(operation.assumption);
    }
  }
  return scene;
}
