import type { EntityMetadata, EvidenceSource, PropertyAssumption, Room, SceneDocument, Vec2, Wall } from '../contracts';
import { migrateScene } from '../core/renovation';
import { validateScene } from '../core/validation';

export interface MeasuredRoom {
  name: string; x: number; z: number; width: number; depth: number;
  elevation: number; ceilingHeight: number; zone: 'interior' | 'balcony' | 'loggia' | 'terrace';
}
export interface TraceInput {
  name: string; outline: Vec2[]; partitions: [Vec2, Vec2][];
  pixelsPerMetre: number; origin: Vec2; height: number; thickness: number; source: EvidenceSource;
}
const round = (n: number) => Math.round(n * 10000) / 10000;
const key = (p: Vec2) => `${round(p[0])},${round(p[1])}`;
const length = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const minus = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
function onSegment(point: Vec2, a: Vec2, b: Vec2, tolerance: number): boolean {
  const delta = minus(b, a), relative = minus(point, a);
  const squared = delta[0] ** 2 + delta[1] ** 2;
  if (!squared) return length(point, a) <= tolerance;
  const t = Math.max(0, Math.min(1, (relative[0] * delta[0] + relative[1] * delta[1]) / squared));
  return length(point, [a[0] + delta[0] * t, a[1] + delta[1] * t]) <= tolerance;
}
export const polygonArea = (polygon: Vec2[]) => polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length]!; return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

function baseScene(name: string): SceneDocument {
  return migrateScene({ format: 'varpet.editor', version: 1, id: crypto.randomUUID(), name, units: 'm', upAxis: 'Y', rooms: [], walls: [], objects: [] });
}

/** Split intersections and T-junctions before tracing faces. Coincident edges share one wall. */
export function planarSegments(segments: [Vec2, Vec2][]): [Vec2, Vec2][] {
  if (segments.length > 160) throw new Error('Use at most 160 traced wall segments.');
  const result = new Map<string, [Vec2, Vec2]>();
  for (const [a, b] of segments) {
    const d = minus(b, a); const len2 = d[0] ** 2 + d[1] ** 2;
    if (len2 < 0.0001) continue;
    const ts = [0, 1];
    for (const [c, e] of segments) {
      const v = minus(e, c); const den = cross(d, v);
      if (Math.abs(den) > 1e-8) {
        const t = cross(minus(c, a), v) / den;
        const u = cross(minus(c, a), d) / den;
        if (t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) ts.push(t);
      } else {
        for (const p of [c, e]) {
          if (Math.abs(cross(minus(p, a), d)) > 0.00001) continue;
          const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / len2;
          if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
        }
      }
    }
    const sorted = ts.sort((x, y) => x - y);
    const cuts = sorted.filter((t, i) => i === 0 || t - sorted[i - 1]! > 1e-9);
    for (let i = 0; i < cuts.length - 1; i++) {
      const p: Vec2 = [round(a[0] + d[0] * cuts[i]!), round(a[1] + d[1] * cuts[i]!)];
      const q: Vec2 = [round(a[0] + d[0] * cuts[i + 1]!), round(a[1] + d[1] * cuts[i + 1]!)];
      if (length(p, q) < 0.02) continue;
      result.set([key(p), key(q)].sort().join('|'), [p, q]);
    }
  }
  if (result.size > 160) throw new Error('The traced junctions create more than 160 wall segments. Simplify the outline.');
  return [...result.values()];
}

export function enclosedFaces(segments: [Vec2, Vec2][]): Vec2[][] {
  const points = new Map<string, Vec2>(); const neighbours = new Map<string, string[]>();
  for (const [a, b] of segments) {
    const ak = key(a), bk = key(b); points.set(ak, a); points.set(bk, b);
    for (const [from, to] of [[ak, bk], [bk, ak]] as [string, string][]) {
      const list = neighbours.get(from) ?? []; if (!list.includes(to)) list.push(to); neighbours.set(from, list);
    }
  }
  for (const [id, list] of neighbours) {
    const p = points.get(id)!;
    list.sort((a, b) => Math.atan2(points.get(a)![1] - p[1], points.get(a)![0] - p[0]) - Math.atan2(points.get(b)![1] - p[1], points.get(b)![0] - p[0]));
  }
  const visited = new Set<string>(); const faces: Vec2[][] = [];
  for (const [start, list] of neighbours) for (const next of list) {
    if (visited.has(`${start}|${next}`)) continue;
    let from = start, to = next; const face: Vec2[] = []; let closed = false;
    for (let step = 0; step <= segments.length * 2; step++) {
      const edge = `${from}|${to}`;
      if (visited.has(edge)) { closed = from === start && to === next; break; }
      visited.add(edge); face.push(points.get(from)!);
      const choices = neighbours.get(to)!; const reverse = choices.indexOf(from);
      const following = choices[(reverse - 1 + choices.length) % choices.length]!;
      from = to; to = following;
    }
    if (closed && face.length >= 3 && polygonArea(face) > 0.01) {
      // Remove a collinear junction from floor geometry without losing the wall junction.
      const clean = [...face];
      let changed = true;
      while (changed && clean.length >= 3) {
        changed = false;
        for (let i = 0; i < clean.length; i++) {
          const previous = clean[(i - 1 + clean.length) % clean.length]!, point = clean[i]!, next = clean[(i + 1) % clean.length]!;
          if (length(previous, point) < 1e-6 || length(previous, next) < 1e-6 || Math.abs(cross(minus(point, previous), minus(next, point))) < 1e-8) { clean.splice(i, 1); changed = true; break; }
        }
      }
      if (clean.length >= 3) faces.push(clean);
    }
  }
  return faces;
}

function assumption(entityId: string, property: string, value: string, sourceId: string, measured: boolean, question: string): PropertyAssumption {
  return { id: crypto.randomUUID(), entityId, property, value, sourceIds: [sourceId], status: measured ? 'measured' : 'unresolved', sourceKind: measured ? 'measured' : 'inferred', rationale: measured ? 'Entered by the person as a site measurement.' : 'Reconstructed from supplied evidence; review the actual apartment.', alternatives: [], question };
}

export function measuredShell(name: string, inputs: MeasuredRoom[], thickness: number, measured: boolean): SceneDocument {
  if (!inputs.length || inputs.length > 32) throw new Error('Enter between 1 and 32 rooms.');
  if (!Number.isFinite(thickness) || thickness < 0.02 || thickness > 1) throw new Error('Wall thickness must be between 0.02 and 1 m.');
  const scene = baseScene(name.trim() || 'Measured apartment'); const project = scene.project!;
  const source: EvidenceSource = { id: crypto.randomUUID(), name: 'Room dimensions entered locally', kind: 'measurement', notes: measured ? 'The person identified these dimensions as site measurements.' : 'Provisional dimensions entered by the person; verification remains open.' };
  project.sources.push(source);
  const edges: [Vec2, Vec2][] = [];
  inputs.forEach((input, index) => {
    const { x, z, width, depth, elevation, ceilingHeight } = input;
    if (![x, z, width, depth, elevation, ceilingHeight].every(Number.isFinite) || width < 0.5 || depth < 0.5 || ceilingHeight < 0.5 || ceilingHeight > 6) throw new Error(`Check the dimensions of room ${index + 1}.`);
    const polygon: Vec2[] = [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];
    const room: Room = { id: `room-${crypto.randomUUID()}`, name: input.name.trim() || `Room ${index + 1}`, polygon, color: input.zone === 'interior' ? '#d9cbb6' : '#b6bbb1' };
    // Overlapping rectangles are likely an input mistake, rather than separate storeys.
    for (const previous of scene.rooms) {
      const xs = previous.polygon.map(p => p[0]), zs = previous.polygon.map(p => p[1]);
      if (Math.min(x + width, Math.max(...xs)) - Math.max(x, Math.min(...xs)) > 0.001 && Math.min(z + depth, Math.max(...zs)) - Math.max(z, Math.min(...zs)) > 0.001) throw new Error(`${room.name} overlaps ${previous.name}. Place rooms beside each other using X and Z.`);
    }
    scene.rooms.push(room); project.metadata[room.id] = { name: room.name, zone: input.zone, elevation, ceilingHeight, phase: 'existing' };
    project.assumptions.push(assumption(room.id, 'dimensions', `${width} × ${depth} m`, source.id, measured, 'Confirm finished internal room dimensions and wall centerline offsets.'), assumption(room.id, 'ceilingHeight', String(ceilingHeight), source.id, measured, 'Measure the ceiling height.'));
    polygon.forEach((p, i) => edges.push([p, polygon[(i + 1) % 4]!]));
  });
  const segments = planarSegments(edges);
  for (const [start, end] of segments) {
    const related = inputs.filter(r => {
      const mx = (start[0] + end[0]) / 2, mz = (start[1] + end[1]) / 2;
      return mx >= r.x - 0.001 && mx <= r.x + r.width + 0.001 && mz >= r.z - 0.001 && mz <= r.z + r.depth + 0.001;
    });
    const base = related.length ? Math.min(...related.map(r => r.elevation)) : 0;
    const top = related.length ? Math.max(...related.map(r => r.elevation + r.ceilingHeight)) : 2.7;
    const wall: Wall = { id: `wall-${crypto.randomUUID()}`, start, end, thickness, height: top - base, color: '#eee9df', openings: [] };
    scene.walls.push(wall); project.metadata[wall.id] = { name: `Wall ${scene.walls.length}`, structuralRole: 'unknown', boundary: related.length > 1 ? 'interior' : 'exterior', phase: 'existing', elevation: base };
    project.assumptions.push(assumption(wall.id, 'structuralRole', 'unknown', source.id, false, 'Confirm structural function from appropriate evidence.'), assumption(wall.id, 'thickness', String(thickness), source.id, false, 'Measure wall thickness; the common value is provisional.'));
  }
  return scene;
}

export function tracedShell(input: TraceInput): SceneDocument {
  if (input.outline.length < 3 || input.outline.length > 32) throw new Error('Trace 3–32 perimeter points.');
  if (!Number.isFinite(input.pixelsPerMetre) || input.pixelsPerMetre <= 0) throw new Error('Calibrate using two points and their real distance first.');
  const convert = (p: Vec2): Vec2 => [round((p[0] - input.origin[0]) / input.pixelsPerMetre), round((p[1] - input.origin[1]) / input.pixelsPerMetre)];
  const outline = input.outline.map(convert); const raw: [Vec2, Vec2][] = outline.map((p, i) => [p, outline[(i + 1) % outline.length]!]);
  const scene = baseScene(input.name.trim() || 'Traced apartment'); const project = scene.project!;
  const outlineCheck = validateScene({ ...scene, rooms: [{ id: 'trace-outline', name: 'Outline', polygon: outline, color: '#d9cbb6' }] }, []);
  if (!outlineCheck.ok) throw new Error(`Check the traced perimeter: ${outlineCheck.errors.join(' ')}`);
  const perimeter = [...raw];
  const onBoundary = (point: Vec2) => perimeter.some(([a, b]) => onSegment(point, a, b, 0.002));
  const inside = (point: Vec2) => {
    if (onBoundary(point)) return true;
    let hit = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) { const a = outline[i]!, b = outline[j]!; if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; }
    return hit;
  };
  raw.push(...input.partitions.map(([a, b]): [Vec2, Vec2] => [convert(a), convert(b)]));
  const segments = planarSegments(raw); const faces = enclosedFaces(segments);
  if (segments.some(([a, b]) => !inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))) throw new Error('A partition extends outside the apartment perimeter. Correct its endpoints.');
  if (!faces.length || faces.length > 32 || faces.some(p => p.length > 32)) throw new Error('The traced walls do not form supported closed rooms. Close the perimeter and simplify wall junctions.');
  const strictlyInside = (point: Vec2, polygon: Vec2[]) => {
    if (polygon.some((a, i) => onSegment(point, a, polygon[(i + 1) % polygon.length]!, 1e-5))) return false;
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i]!, b = polygon[j]!; if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result; }
    return result;
  };
  if (faces.some((face, i) => faces.some((other, j) => i !== j && face.some(point => strictlyInside(point, other))))) throw new Error('An isolated closed wall loop creates an unsupported floor hole. Divide the surrounding area into closed, non-overlapping spaces with additional partitions; one connecting wall is not enough.');
  project.sources.push(structuredClone(input.source));
  faces.forEach((polygon, index) => {
    const room: Room = { id: `room-${crypto.randomUUID()}`, name: `Space ${index + 1}`, polygon, color: '#d9cbb6' };
    scene.rooms.push(room); project.metadata[room.id] = { zone: 'interior', elevation: 0, ceilingHeight: input.height, phase: 'existing' };
    project.assumptions.push(assumption(room.id, 'polygon', 'Traced plan boundary', input.source.id, false, 'Check the traced boundary against actual dimensions.'), assumption(room.id, 'ceilingHeight', String(input.height), input.source.id, false, 'Confirm ceiling height; a floor plan does not establish it.'));
  });
  for (const [start, end] of segments) {
    const wall: Wall = { id: `wall-${crypto.randomUUID()}`, start, end, thickness: input.thickness, height: input.height, color: '#eee9df', openings: [] };
    scene.walls.push(wall);
    const midpoint: Vec2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    project.metadata[wall.id] = { structuralRole: 'unknown', boundary: onBoundary(midpoint) ? 'exterior' : 'interior', phase: 'existing' };
    project.assumptions.push(assumption(wall.id, 'structuralRole', 'unknown', input.source.id, false, 'Confirm structural function; plan appearance alone is not verification.'), assumption(wall.id, 'thickness', String(input.thickness), input.source.id, false, 'Confirm wall thickness; tracing uses the entered common value.'));
  }
  return scene;
}

export interface ReconstructionDifference { id: string; kind: 'room' | 'wall'; label: string; action: 'add' | 'update'; before: string; after: string }
export function reconstructionDifferences(current: SceneDocument, incoming: SceneDocument): ReconstructionDifference[] {
  const result: ReconstructionDifference[] = [];
  for (const kind of ['room', 'wall'] as const) {
    const previous = kind === 'room' ? current.rooms : current.walls;
    const proposed = kind === 'room' ? incoming.rooms : incoming.walls;
    for (const value of proposed) {
      const old = previous.find(p => p.id === value.id);
      if (JSON.stringify(old) !== JSON.stringify(value)) result.push({ id: value.id, kind, label: 'name' in value ? value.name : incoming.project?.metadata[value.id]?.name ?? value.id, action: old ? 'update' : 'add', before: old ? JSON.stringify(old) : 'Not present', after: JSON.stringify(value) });
    }
  }
  return result;
}

/** Only chosen identities change. Existing decisions and unrelated content remain intact. */
export function mergeReconstruction(current: SceneDocument, incoming: SceneDocument, selected: Set<string>): SceneDocument {
  const candidate = migrateScene(current); const project = candidate.project!;
  const allowedIds = new Set<string>();
  const merge = <T extends { id: string }>(old: T[], next: T[]): T[] => {
    const output = structuredClone(old);
    for (const item of next) if (selected.has(item.id)) {
      const index = output.findIndex(i => i.id === item.id);
      if (index >= 0) output[index] = structuredClone(item); else output.push(structuredClone(item));
      allowedIds.add(item.id);
    }
    return output;
  };
  candidate.rooms = merge(candidate.rooms, incoming.rooms); candidate.walls = merge(candidate.walls, incoming.walls);
  candidate.walls.filter(w => selected.has(w.id)).forEach(w => w.openings.forEach(o => allowedIds.add(o.id)));
  const entityIds = new Set([...candidate.rooms, ...candidate.walls, ...candidate.walls.flatMap(w => w.openings), ...candidate.objects, ...project.components, ...project.routes].map(v => v.id));
  // Do not silently discard evidence when a reconstruction omits a previously known opening.
  for (const assumption of project.assumptions) {
    if (!entityIds.has(assumption.entityId)) throw new Error(`The reconstruction removes an opening with evidence (${assumption.entityId}). Resolve that opening in Shell first.`);
    if (selected.has(assumption.entityId)) assumption.status = 'stale';
  }
  for (const id of Object.keys(project.metadata)) if (!entityIds.has(id)) throw new Error(`The reconstruction removes a reviewed element (${id}). Resolve the conflict in Shell first.`);
  if (incoming.project) {
    const sources = incoming.project.sources;
    for (const source of sources) if (!project.sources.some(s => s.id === source.id)) project.sources.push(structuredClone(source));
    for (const [id, metadata] of Object.entries(incoming.project.metadata)) if (allowedIds.has(id) && !project.metadata[id]) project.metadata[id] = structuredClone(metadata as EntityMetadata);
    for (const entry of incoming.project.assumptions) if (allowedIds.has(entry.entityId) && !project.assumptions.some(a => a.id === entry.id)) project.assumptions.push(structuredClone(entry));
  }
  return candidate;
}
