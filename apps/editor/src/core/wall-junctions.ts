import type { EntityMetadata, FinishAssignment, RenovationSnapshot, SceneDocument, Vec2, Wall } from '../contracts';
import { wallLength } from './geometry';
import { invalidateAssumptions } from './renovation';

const EPS = 1e-6;
const MIN_LENGTH = .05;
const subtract = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS;
const active = (scene: SceneDocument, wall: Wall) => scene.project?.metadata[wall.id]?.phase !== 'remove';
const elevation = (scene: SceneDocument, wall: Wall) => scene.project?.metadata[wall.id]?.elevation ?? 0;
function overlapsHeight(aScene: SceneDocument, a: Wall, bScene: SceneDocument, b: Wall): boolean {
  const lowA = elevation(aScene, a), lowB = elevation(bScene, b);
  return Math.min(lowA + a.height, lowB + b.height) - Math.max(lowA, lowB) > EPS;
}
function parallel(a: Wall, b: Wall): boolean {
  return Math.abs(cross(subtract(a.end, a.start), subtract(b.end, b.start))) <= 1e-8 * wallLength(a) * wallLength(b);
}
function along(wall: Wall, point: Vec2): number {
  return dot(subtract(point, wall.start), subtract(wall.end, wall.start)) / wallLength(wall);
}
function contains(wall: Wall, point: Vec2): boolean {
  const length = wallLength(wall), distance = along(wall, point);
  return distance >= -EPS && distance <= length + EPS && Math.abs(cross(subtract(point, wall.start), subtract(wall.end, wall.start))) <= EPS * length;
}
function intersection(a: Wall, b: Wall): Vec2 | null {
  if (parallel(a, b)) return null;
  const u = subtract(a.end, a.start), v = subtract(b.end, b.start), delta = subtract(b.start, a.start);
  const denominator = cross(u, v), t = cross(delta, v) / denominator, s = cross(delta, u) / denominator;
  if (t * wallLength(a) < -EPS || (t - 1) * wallLength(a) > EPS || s * wallLength(b) < -EPS || (s - 1) * wallLength(b) > EPS) return null;
  const point: Vec2 = [a.start[0] + u[0] * t, a.start[1] + u[1] * t];
  return [a.start, a.end, b.start, b.end].find(endpoint => same(endpoint, point)) ?? point;
}
function identifiers(scene: SceneDocument): Set<string> {
  const project = scene.project;
  const ids = new Set([...scene.rooms, ...scene.walls, ...scene.walls.flatMap(w => w.openings), ...scene.objects].map(item => item.id));
  if (project) {
    for (const list of [project.components, project.routes, project.sources, project.assumptions, project.materials, project.finishes, project.tasks, project.options]) for (const item of list) ids.add(item.id);
    // An inactive option can still own evidence for an old section. Do not give
    // that identity to newly introduced geometry in the active option.
    for (const snapshot of [project.baseline, ...project.options.map(option => option.snapshot)]) if (snapshot) {
      for (const list of [snapshot.rooms, snapshot.walls, snapshot.walls.flatMap(w => w.openings), snapshot.objects, snapshot.components, snapshot.routes, snapshot.finishes]) for (const item of list) ids.add(item.id);
    }
  }
  return ids;
}
function nextId(ids: Set<string>, original: string, kind: string): string {
  let index = 1, result: string;
  do { result = `${original.slice(0, 75)}:${kind}-${index++}`; } while (ids.has(result));
  ids.add(result); return result;
}

const snapshots = (scene: SceneDocument): RenovationSnapshot[] => scene.project ? [...(scene.project.baseline ? [scene.project.baseline] : []), ...scene.project.options.map(option => option.snapshot)] : [];
const geometrySignature = (wall: Wall, base: number) => JSON.stringify([wall.start, wall.end, wall.height, wall.thickness, base]);
function hash(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(36);
}
interface SectionIdentities { ids: Set<string>; nonWallIds: Set<string>; geometry: Map<string, Set<string>>; allocated: Map<string, string> }
function sectionIdentities(scene: SceneDocument): SectionIdentities {
  const ids = identifiers(scene), geometry = new Map<string, Set<string>>(), nonWallIds = new Set<string>();
  const record = (walls: Wall[], metadata: Record<string, EntityMetadata>, otherIds: string[]) => {
    for (const wall of walls) {
      const signatures = geometry.get(wall.id) ?? new Set<string>();
      signatures.add(geometrySignature(wall, metadata[wall.id]?.elevation ?? 0)); geometry.set(wall.id, signatures);
    }
    for (const id of otherIds) nonWallIds.add(id);
  };
  record(scene.walls, scene.project?.metadata ?? {}, [...scene.rooms, ...scene.objects, ...scene.walls.flatMap(wall => wall.openings)].map(item => item.id));
  if (scene.project) for (const list of [scene.project.components, scene.project.routes, scene.project.sources, scene.project.assumptions, scene.project.materials, scene.project.finishes, scene.project.tasks, scene.project.options]) for (const item of list) nonWallIds.add(item.id);
  for (const snapshot of snapshots(scene)) record(snapshot.walls, snapshot.metadata, [...snapshot.rooms, ...snapshot.objects, ...snapshot.walls.flatMap(wall => wall.openings), ...snapshot.components, ...snapshot.routes, ...snapshot.finishes].map(item => item.id));
  return { ids, nonWallIds, geometry, allocated: new Map() };
}
function sectionId(context: SectionIdentities, localIds: Set<string>, source: string, section: Wall, base: number): string {
  const signature = geometrySignature(section, base), key = JSON.stringify([source, signature]);
  const existing = context.allocated.get(key);
  if (existing && !localIds.has(existing)) { localIds.add(existing); return existing; }
  const stem = `${source.slice(0, 70)}:section-${hash(key)}`;
  let candidate = stem, suffix = 1;
  while (localIds.has(candidate) || (context.ids.has(candidate) && (context.nonWallIds.has(candidate) || !context.geometry.get(candidate)?.has(signature) || context.geometry.get(candidate)!.size !== 1))) candidate = `${stem}-${suffix++}`;
  context.ids.add(candidate); localIds.add(candidate); context.geometry.set(candidate, new Set([signature])); context.allocated.set(key, candidate);
  return candidate;
}

function splitJunctions(scene: SceneDocument, context: SectionIdentities): Map<string, string[]> {
  const cuts = new Map<string, number[]>();
  const cutPoints = new Map<string, Map<number, Vec2>>();
  for (let i = 0; i < scene.walls.length; i++) {
    const a = scene.walls[i]!;
    if (!active(scene, a)) continue;
    for (const b of scene.walls.slice(i + 1)) {
      if (!active(scene, b) || !overlapsHeight(scene, a, scene, b)) continue;
      const point = intersection(a, b);
      if (!point) continue;
      for (const wall of [a, b]) {
        const distance = along(wall, point), length = wallLength(wall);
        if (distance <= EPS || distance >= length - EPS) continue;
        const list = cuts.get(wall.id) ?? [];
        if (!list.some(cut => Math.abs(cut - distance) <= EPS)) {
          list.push(distance);
          const points = cutPoints.get(wall.id) ?? new Map<number, Vec2>();
          points.set(distance, point); cutPoints.set(wall.id, points);
        }
        cuts.set(wall.id, list);
      }
    }
  }
  if (scene.walls.length + [...cuts.values()].reduce((sum, list) => sum + list.length, 0) > 160) throw new Error('These junctions would create more than 160 wall sections. Simplify the wall layout.');
  const ids = context.ids, localIds = new Set(scene.walls.map(wall => wall.id)), replacements = new Map<string, string[]>(), result: Wall[] = [];
  const project = scene.project;
  for (const wall of scene.walls) {
    const interior = cuts.get(wall.id);
    if (!interior?.length) { result.push(wall); continue; }
    const length = wallLength(wall), bounds = [0, ...interior.sort((a, b) => a - b), length];
    for (let i = 1; i < bounds.length; i++) if (bounds[i]! - bounds[i - 1]! < MIN_LENGTH - EPS) throw new Error(`The junction on wall “${wall.id}” leaves a section shorter than 0.05 m. Move the junction clear of the corner.`);
    for (const cut of interior) {
      if (wall.openings.some(opening => opening.offset < cut - EPS && opening.offset + opening.width > cut + EPS)) throw new Error(`The junction on wall “${wall.id}” crosses an opening. Move the opening or the dividing wall before splitting this wall.`);
      if (project?.components.some(component => component.host?.wallId === wall.id && component.host.offset - component.dimensions[0] / 2 < cut - EPS && component.host.offset + component.dimensions[0] / 2 > cut + EPS)) throw new Error(`The junction on wall “${wall.id}” crosses a mounted component. Move the component clear of the junction first.`);
    }
    const point = (distance: number): Vec2 => distance === 0 ? [...wall.start] : distance === length ? [...wall.end] : [...cutPoints.get(wall.id)!.get(distance)!];
    const sections: Wall[] = [];
    for (let i = 1; i < bounds.length; i++) {
      const from = bounds[i - 1]!, to = bounds[i]!;
      const section: Wall = { ...wall, start: point(from), end: point(to), openings: wall.openings.filter(opening => opening.offset >= from - EPS && opening.offset + opening.width <= to + EPS).map(opening => ({ ...opening, offset: Math.max(0, opening.offset - from) })) };
      if (i !== 1) section.id = sectionId(context, localIds, wall.id, section, elevation(scene, wall));
      sections.push(section); result.push(section);
      if (!project || i === 1) continue;
      if (project.metadata[wall.id]) project.metadata[section.id] = structuredClone(project.metadata[wall.id]!);
      for (const finish of project.finishes.filter(f => f.entityId === wall.id)) project.finishes.push({ ...finish, id: nextId(ids, finish.id, 'section'), entityId: section.id });
    }
    for (const opening of wall.openings) if (sections.reduce((count, section) => count + section.openings.filter(item => item.id === opening.id).length, 0) !== 1) throw new Error(`Opening “${opening.id}” cannot be assigned to one wall section. Check its position and width before splitting the wall.`);
    replacements.set(wall.id, sections.map(section => section.id));
    if (project) for (const component of project.components) if (component.host?.wallId === wall.id) {
      const index = bounds.findIndex((bound, i) => i < bounds.length - 1 && component.host!.offset >= bound - EPS && component.host!.offset < bounds[i + 1]! - EPS);
      const selected = Math.max(0, index);
      component.host.wallId = sections[selected]!.id; component.host.offset -= bounds[selected]!;
    }
  }
  scene.walls = result;
  return replacements;
}
function expandReferences(scene: SceneDocument, replacements: Map<string, string[]>, ids: Set<string>): void {
  const project = scene.project;
  if (!project || !replacements.size) return;
  const expand = (values: string[]) => [...new Set(values.flatMap(id => replacements.get(id) ?? [id]))];
  for (const task of project.tasks) task.entityIds = expand(task.entityIds);
  for (const assumption of [...project.assumptions]) {
    if (assumption.dependsOn) assumption.dependsOn = expand(assumption.dependsOn);
    const sections = replacements.get(assumption.entityId);
    if (!sections) continue;
    // Evidence stays attached, but a measurement of the former full wall must
    // not become a verified measurement of each shorter section.
    assumption.status = 'stale';
    for (const sectionId of sections.slice(1)) project.assumptions.push({ ...structuredClone(assumption), id: nextId(ids, assumption.id, 'section'), entityId: sectionId });
  }
  invalidateAssumptions(scene, [...replacements.values()].flat());
}

const metadataSignature = (metadata: EntityMetadata | undefined) => JSON.stringify(Object.entries(metadata ?? {}).sort(([a], [b]) => a.localeCompare(b)));
function surface(surface: FinishAssignment['surface'], reverse: boolean): FinishAssignment['surface'] {
  return reverse && surface === 'wall-front' ? 'wall-back' : reverse && surface === 'wall-back' ? 'wall-front' : surface;
}
function finishSignature(scene: SceneDocument, wall: Wall, reverse = false): string {
  return JSON.stringify((scene.project?.finishes ?? []).filter(finish => finish.entityId === wall.id).map(finish => [surface(finish.surface, reverse), finish.materialId]).sort());
}
function mergeAtReleasedJunctions(scene: SceneDocument, previous: SceneDocument): void {
  const savedIds = new Set(snapshots(scene).flatMap(snapshot => snapshot.walls.map(wall => wall.id)));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < scene.walls.length; i++) {
      const wall = scene.walls[i]!;
      if (!active(scene, wall)) continue;
      for (const other of scene.walls.slice(i + 1)) {
        if (!active(scene, other) || !parallel(wall, other) || !overlapsHeight(scene, wall, scene, other)) continue;
        const point = [wall.start, wall.end].find(p => same(p, other.start) || same(p, other.end));
        if (!point) continue;
        const firstFar = same(wall.start, point) ? wall.end : wall.start, secondFar = same(other.start, point) ? other.end : other.start;
        if (dot(subtract(firstFar, point), subtract(secondFar, point)) >= 0) continue;
        const oldDivider = previous.walls.some(divider => divider.id !== wall.id && divider.id !== other.id && active(previous, divider) && !parallel(wall, divider) && contains(divider, point) && overlapsHeight(scene, wall, previous, divider));
        if (!oldDivider) continue;
        const remaining = scene.walls.some(divider => divider !== wall && divider !== other && active(scene, divider) && contains(divider, point) && overlapsHeight(scene, wall, scene, divider));
        if (remaining) continue;
        const reverse = dot(subtract(wall.end, wall.start), subtract(other.end, other.start)) < 0;
        if (wall.height !== other.height || wall.thickness !== other.thickness || wall.color !== other.color || wall.openings.length + other.openings.length > 16 || wallLength(wall) + wallLength(other) > 100
          || metadataSignature(scene.project?.metadata[wall.id]) !== metadataSignature(scene.project?.metadata[other.id]) || finishSignature(scene, wall) !== finishSignature(scene, other, reverse)
          || (reverse && (wall.openings.length || other.openings.length))) continue;
        const prepend = same(wall.start, point), addedLength = wallLength(other), otherLength = addedLength;
        const start: Vec2 = prepend ? [...secondFar] : [...wall.start], end: Vec2 = prepend ? [...wall.end] : [...secondFar];
        const merged: Wall = { ...wall, start, end, openings: [
          ...wall.openings.map(opening => ({ ...opening, offset: opening.offset + (prepend ? addedLength : 0) })),
          ...other.openings.map(opening => ({ ...opening, offset: (prepend ? 0 : wallLength(wall)) + (reverse ? otherLength - opening.offset - opening.width : opening.offset) })),
        ].sort((a, b) => a.offset - b.offset) };
        const project = scene.project;
        if (project) {
          for (const component of project.components) if (component.host) {
            if (component.host.wallId === wall.id && prepend) component.host.offset += addedLength;
            else if (component.host.wallId === other.id) {
              component.host.offset = (prepend ? 0 : wallLength(wall)) + (reverse ? otherLength - component.host.offset : component.host.offset);
              if (reverse) component.host.side = component.host.side === 1 ? -1 : 1;
              component.host.wallId = wall.id;
            }
          }
          const redirect = (id: string): string[] => id === other.id ? savedIds.has(id) ? [id, wall.id] : [wall.id] : [id];
          for (const assumption of project.assumptions) {
            if (assumption.entityId === other.id) {
              if (savedIds.has(other.id)) assumption.dependsOn = [...new Set([...(assumption.dependsOn ?? []), wall.id])];
              else assumption.entityId = wall.id;
            }
            if (assumption.dependsOn) assumption.dependsOn = [...new Set(assumption.dependsOn.flatMap(redirect))];
          }
          for (const task of project.tasks) task.entityIds = [...new Set(task.entityIds.flatMap(redirect))];
          project.finishes = project.finishes.filter(finish => finish.entityId !== other.id);
          delete project.metadata[other.id];
          invalidateAssumptions(scene, [wall.id, other.id]);
        }
        scene.walls[i] = merged; scene.walls.splice(scene.walls.indexOf(other), 1);
        changed = true; break outer;
      }
    }
  }
}

/**
 * Convert real plan junctions into selectable wall sections without changing the
 * physical shell or its schema. Only a junction released since the previous
 * document can reconnect; deliberate standalone splits remain intact.
 *
 * A section shorter than 5 cm, an opening across a cut, or a mounted component
 * spanning it cannot be represented by the current single-wall host contract.
 * Such changes throw before the caller's document is touched.
 */
export function normalizeWallJunctions(input: SceneDocument, previous?: SceneDocument): SceneDocument {
  const scene = structuredClone(input);
  const context = sectionIdentities(scene), replacements = new Map<string, string[]>();
  const record = (mapping: Map<string, string[]>) => {
    for (const [id, sections] of mapping) replacements.set(id, [...new Set([...(replacements.get(id) ?? []), ...sections])]);
  };
  record(splitJunctions(scene, context));
  // Baselines and options are alternative views of the same stable entities.
  // Normalize them together so shared evidence never references a section that
  // disappears merely by restoring an otherwise identical saved snapshot.
  for (const snapshot of snapshots(scene)) {
    const project = scene.project!;
    const saved: SceneDocument = { ...scene, rooms: snapshot.rooms, walls: snapshot.walls, objects: snapshot.objects, project: {
      mode: project.mode, currency: project.currency, metadata: snapshot.metadata, components: snapshot.components, routes: snapshot.routes, finishes: snapshot.finishes,
      materials: project.materials, sources: [], assumptions: [], tasks: [], options: [],
    } };
    record(splitJunctions(saved, context));
    snapshot.walls = saved.walls;
  }
  expandReferences(scene, replacements, context.ids);
  if (previous?.id === scene.id) mergeAtReleasedJunctions(scene, previous);
  return scene;
}
