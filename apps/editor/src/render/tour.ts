import * as THREE from 'three';
import type { CatalogAsset, Room, SceneDocument, Vec2 } from '../contracts';
import { polygonArea } from '../core/geometry';
import { findWalkSpawn, walkProbe, WALK_EYE_HEIGHT } from '../core/walkthrough';

/** One camera state of the tour. `evening` runs 0 (day) to 1 (evening) in the closing shot. */
export interface TourPose { view: 'perspective' | 'inside'; position: THREE.Vector3; target: THREE.Vector3; fov: number; evening: number }

const ease = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const easeInOut = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Rooms in presentation order: living, kitchen/dining, main bedroom, a child's room. */
export function tourRooms(scene: SceneDocument): Room[] {
  const metadata = scene.project?.metadata ?? {};
  const interior = scene.rooms.filter(room => room.polygon.length >= 3 && metadata[room.id]?.phase !== 'remove'
    && !['balcony', 'terrace'].includes(metadata[room.id]?.zone ?? 'interior'));
  const byArea = (a: Room, b: Room) => polygonArea(b.polygon) - polygonArea(a.polygon);
  const named = (pattern: RegExp) => interior.filter(room => pattern.test(room.name)).sort(byArea);
  const living = named(/living|lounge|salon|reading/i)[0] ?? [...interior].sort(byArea)[0];
  const kitchen = named(/kitchen|dining/i).find(room => room !== living);
  const bedrooms = named(/bed|master|sleep/i);
  const kids = named(/kid|child|nursery|play/i)[0] ?? bedrooms[1];
  const order: Room[] = [];
  for (const room of [living, kitchen, bedrooms[0], kids]) if (room && !order.includes(room)) order.push(room);
  return order;
}

interface Plan { points: THREE.Vector3[]; stops: Array<{ index: number; look: THREE.Vector3 }>; doors: THREE.Vector3[] }

/**
 * Plans the walking leg on a 0.3 m grid of standing space, cooperatively: call step() every frame
 * with a time budget, so planning runs while the overview orbit plays.
 */
export class TourPlanner {
  plan: Plan | null = null;
  done = false;
  private readonly work: Generator<void, Plan | null>;
  constructor(scene: SceneDocument, catalog: CatalogAsset[]) { this.work = planTour(scene, catalog); }
  step(budget: number): void {
    const started = performance.now();
    while (!this.done && performance.now() - started < budget) {
      const next = this.work.next();
      if (next.done) { this.done = true; this.plan = next.value; }
    }
  }
}

function* planTour(scene: SceneDocument, catalog: CatalogAsset[]): Generator<void, Plan | null> {
  const rooms = tourRooms(scene);
  if (!rooms.length) return null;
  const probe = walkProbe(scene, catalog);
  const floor = probe.elevation(rooms[0]!);
  const level = probe.rooms.filter(room => probe.elevation(room) === floor);
  const xs = level.flatMap(room => room.polygon.map(p => p[0])), zs = level.flatMap(room => room.polygon.map(p => p[1]));
  const minX = Math.min(...xs), minZ = Math.min(...zs), cell = 0.2;
  const nx = Math.ceil((Math.max(...xs) - minX) / cell), nz = Math.ceil((Math.max(...zs) - minZ) / cell);
  const walkable = new Uint8Array(nx * nz);
  const at = (i: number, j: number): Vec2 => [minX + (i + 0.5) * cell, minZ + (j + 0.5) * cell];
  for (let index = 0; index < walkable.length; index++) {
    const point = at(index % nx, Math.floor(index / nx));
    // safe() already requires floor under the whole body; doorway cells sit between room polygons.
    walkable[index] = probe.safe(point, floor) ? 1 : 0;
    if (index % 24 === 0) yield;
  }
  // Doorways: the body test rejects the wall-thickness gap between two room floors, so open a
  // narrow lane straight through every usable door (and only doors: never through a wall).
  const metadata = scene.project?.metadata ?? {};
  const leaves: number[] = [];
  for (const wall of scene.walls) {
    if (metadata[wall.id]?.phase === 'remove' || (metadata[wall.id]?.elevation ?? 0) !== floor) continue;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const ux = dx / length, uz = dz / length;
    for (const door of wall.openings) {
      if (door.kind !== 'door' || metadata[door.id]?.mechanism === 'fixed' || metadata[door.id]?.phase === 'remove' || door.width < 0.55) continue;
      const along = door.offset + door.width / 2;
      // The open leaf stands out from the hinge jamb; keep it solid so the path keeps its distance.
      const hinge = metadata[door.id]?.hinge === 'right' ? door.offset + door.width : door.offset;
      for (let across = -door.width; across <= door.width; across += 0.1) {
        const x = wall.start[0] + ux * hinge - uz * across, z = wall.start[1] + uz * hinge + ux * across;
        const i = Math.floor((x - minX) / cell), j = Math.floor((z - minZ) / cell);
        if (i >= 0 && j >= 0 && i < nx && j < nz) leaves.push(j * nx + i);
      }
      for (let across = -0.9; across <= 0.9; across += 0.1) for (const side of [-0.1, 0, 0.1]) {
        const x = wall.start[0] + ux * (along + side) - uz * across, z = wall.start[1] + uz * (along + side) + ux * across;
        const i = Math.floor((x - minX) / cell), j = Math.floor((z - minZ) / cell);
        if (i >= 0 && j >= 0 && i < nx && j < nz) walkable[j * nx + i] = 1;
      }
    }
  }
  const cellOf = (point: Vec2) => {
    const i = Math.floor((point[0] - minX) / cell), j = Math.floor((point[1] - minZ) / cell);
    let best = -1, bestDistance = Infinity;
    for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
      const x = i + di, z = j + dj;
      if (x < 0 || z < 0 || x >= nx || z >= nz || !walkable[z * nx + x]) continue;
      const d = di * di + dj * dj; if (d < bestDistance) { bestDistance = d; best = z * nx + x; }
    }
    return best;
  };
  // Metres to the nearest wall, furniture or door jamb (two-pass chamfer distance).
  const distance = new Float32Array(nx * nz);
  for (let index = 0; index < distance.length; index++) distance[index] = walkable[index] ? 1e9 : 0;
  const relax = (index: number, other: number, step: number) => { if (distance[other]! + step < distance[index]!) distance[index] = distance[other]! + step; };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const index = j * nx + i; if (!walkable[index]) continue;
    if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) { distance[index] = cell; continue; }
    relax(index, index - 1, cell); relax(index, index - nx, cell); relax(index, index - nx - 1, cell * 1.414); relax(index, index - nx + 1, cell * 1.414);
  }
  for (let j = nz - 2; j > 0; j--) for (let i = nx - 2; i > 0; i--) {
    const index = j * nx + i; if (!walkable[index]) continue;
    relax(index, index + 1, cell); relax(index, index + nx, cell); relax(index, index + nx + 1, cell * 1.414); relax(index, index + nx - 1, cell * 1.414);
  }
  yield;
  // Keep 0.8 m from walls, door leaves and furniture wherever the floor allows it.
  const penalty = new Float32Array(nx * nz);
  for (let index = 0; index < penalty.length; index++) penalty[index] = Math.max(0, 0.9 - distance[index]!) * 4;
  // Open door leaves: costly to brush past (a leaf filling the frame), never a wall to the route.
  for (const index of leaves) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const i = index % nx + di, j = Math.floor(index / nx) + dj;
    if (i >= 0 && j >= 0 && i < nx && j < nz) penalty[j * nx + i]! += 2.5 / (1 + Math.abs(di) + Math.abs(dj));
  }
  // Where to stand in each room: open floor 2.4-4.5 m from its focal piece (sofa, bed, table),
  // with a clear sight line and at least 0.8 m to anything; the focal piece is what the shot holds on.
  const spawns: Array<{ point: Vec2; look: THREE.Vector3 }> = [];
  for (const room of rooms) {
    if (probe.elevation(room) !== floor) continue;
    const focal = probe.focalPiece(room, floor) ?? probe.furnitureCentre(room, floor);
    if (!focal && spawns.length) continue; // an empty room has nothing to show
    let best: Vec2 | null = null, bestScore = -Infinity;
    if (focal) for (let index = 0; index < walkable.length; index++) {
      if (!walkable[index] || distance[index]! < 0.6) continue;
      const point = at(index % nx, Math.floor(index / nx));
      if (!probe.contains(room, point)) continue;
      const reach = Math.hypot(focal[0] - point[0], focal[1] - point[1]);
      if (reach < 1.6) continue;
      const score = -Math.abs(reach - 3.2) + Math.min(distance[index]!, 1.4) * 1.2;
      if (score > bestScore && !probe.wallBetween(point, focal)) { bestScore = score; best = point; }
      if (index % 64 === 0) yield;
    }
    const eye = floor + WALK_EYE_HEIGHT;
    if (best && focal) spawns.push({ point: best, look: new THREE.Vector3(focal[0], floor + 0.75, focal[1]) });
    else {
      const spawn = findWalkSpawn(scene, catalog, { roomId: room.id });
      if (spawn) spawns.push({ point: [spawn.position[0], spawn.position[2]], look: new THREE.Vector3(...spawn.target) });
    }
    yield;
  }
  if (!spawns.length) return null;
  function* route(from: number, to: number): Generator<void, number[] | null> {
    const cost = new Float32Array(nx * nz).fill(Infinity), previous = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
    const open: number[] = [from]; cost[from] = 0;
    const tx = to % nx, tz = Math.floor(to / nx);
    const heuristic = (index: number) => Math.hypot(index % nx - tx, Math.floor(index / nx) - tz);
    let expanded = 0;
    while (open.length) {
      let bestIndex = 0;
      for (let k = 1; k < open.length; k++) if (cost[open[k]!]! + heuristic(open[k]!) < cost[open[bestIndex]!]! + heuristic(open[bestIndex]!)) bestIndex = k;
      const current = open.splice(bestIndex, 1)[0]!;
      if (current === to) {
        const path = [current]; while (previous[path[0]!]! >= 0) path.unshift(previous[path[0]!]!);
        return path;
      }
      if (closed[current]) continue; closed[current] = 1;
      const i = current % nx, j = Math.floor(current / nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const x = i + di, z = j + dj; if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
        const next = z * nx + x; if (!walkable[next] || closed[next]) continue;
        // No diagonal corner-cutting past a blocked cell.
        if (di && dj && (!walkable[j * nx + x] || !walkable[z * nx + i])) continue;
        const step = Math.hypot(di, dj) + penalty[next]!;
        if (cost[current]! + step < cost[next]!) { cost[next] = cost[current]! + step; previous[next] = current; open.push(next); }
      }
      if (++expanded % 200 === 0) yield;
    }
    return null;
  }
  const clear = (a: Vec2, b: Vec2) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
    for (let s = 0; s <= steps; s++) {
      const point: Vec2 = [a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps];
      const i = Math.floor((point[0] - minX) / cell), j = Math.floor((point[1] - minZ) / cell);
      if (i < 0 || j < 0 || i >= nx || j >= nz || !walkable[j * nx + i] || distance[j * nx + i]! < 0.55) return false;
    }
    return true;
  };
  // Visit each room, then return to the first (the living room) for the evening shot.
  const waypoints = [...spawns, spawns[0]!];
  const debug: string[] = [`walkable ${walkable.reduce((a, b) => a + b, 0)}/${walkable.length}`];

  const points: Vec2[] = [waypoints[0]!.point]; const stops: Plan['stops'] = [{ index: 0, look: waypoints[0]!.look }];
  for (let w = 1; w < waypoints.length; w++) {
    const from = cellOf(points.at(-1)!), to = cellOf(waypoints[w]!.point);
    const cells = from >= 0 && to >= 0 ? yield* route(from, to) : null;
    debug.push(`${w}:${from}>${to}:${cells ? cells.length : 'none'}`);
    if (!cells) continue;
    const raw = cells.map(index => at(index % nx, Math.floor(index / nx)));
    raw[raw.length - 1] = waypoints[w]!.point;
    // String-pull: keep only corners the eye cannot see past.
    let anchor = points.at(-1)!;
    for (let k = 1; k < raw.length; k++) {
      if (k === raw.length - 1 || !clear(anchor, raw[k + 1]!)) { points.push(raw[k]!); anchor = raw[k]!; }
    }
    stops.push({ index: points.length - 1, look: waypoints[w]!.look });
    yield;
  }
  // Grid steps read as a jitter at eye height: relax the path (stops stay put) a few times.
  const fixed = new Set(stops.map(stop => stop.index));
  for (let pass = 0; pass < 4; pass++) {
    const copy = points.map(point => [...point] as Vec2);
    for (let k = 1; k < points.length - 1; k++) if (!fixed.has(k)) {
      points[k] = [copy[k - 1]![0] * 0.25 + copy[k]![0] * 0.5 + copy[k + 1]![0] * 0.25, copy[k - 1]![1] * 0.25 + copy[k]![1] * 0.5 + copy[k + 1]![1] * 0.25];
    }
  }
  const doors: Vec2[] = [];
  for (const wall of scene.walls) {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz) || 1;
    for (const door of wall.openings) if (door.kind === 'door') doors.push([wall.start[0] + dx / length * (door.offset + door.width / 2), wall.start[1] + dz / length * (door.offset + door.width / 2)]);
  }
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf'))
    console.info(`tour plan: ${rooms.map(room => room.name).join(' > ')}; ${spawns.length} standing points, ${stops.length} stops, ${points.length} path points; ${debug.join(' ')}`);
  if (stops.length < 2 || points.length < 2) return null;
  return { points: points.map(([x, z]) => new THREE.Vector3(x, floor + WALK_EYE_HEIGHT, z)), stops,
    doors: doors.map(([x, z]) => new THREE.Vector3(x, floor + WALK_EYE_HEIGHT, z)) };
}

interface Leg { start: number; end: number; pose(t: number, out: TourPose): void }
function pitched(direction: THREE.Vector3): THREE.Vector3 {
  const flat = Math.hypot(direction.x, direction.z) || 1;
  const pitch = Math.max(-0.31, Math.min(0, Math.atan2(direction.y, flat)));
  return new THREE.Vector3(direction.x / flat * Math.cos(pitch), Math.sin(pitch), direction.z / flat * Math.cos(pitch));
}

/**
 * The cinematic path: dollhouse orbit, a glide down into the living room, a walk through the
 * important rooms by their doors, and a day-to-evening fade back in the living room.
 */
export class TourPlayback {
  private legs: Leg[] = [];
  private readonly started = performance.now();
  private readonly pose: TourPose = { view: 'perspective', position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 32, evening: 0 };
  private built = false;
  private orbitEnd = 10;
  finished = false;

  constructor(private readonly planner: TourPlanner, private readonly start: { position: THREE.Vector3; target: THREE.Vector3; fov: number },
    private readonly center: THREE.Vector3, private readonly radius: number, private readonly insideFov: number) {}

  private orbit(t: number, out: TourPose): void {
    const offset = this.start.position.clone().sub(this.center);
    // Eases to a stop at 10 s; if planning runs late, it keeps drifting slowly instead of freezing.
    const azimuth = Math.atan2(offset.x, offset.z) + 1.4 * easeInOut(Math.min(1, t / 10)) + ease(Math.max(0, t - 10)) * 0.04 * Math.max(0, t - 10);
    const elevation = THREE.MathUtils.lerp(0.72, 0.6, ease(t / 10));
    const distance = this.radius;
    out.view = 'perspective'; out.fov = this.start.fov; out.evening = 0;
    out.position.set(this.center.x + Math.sin(azimuth) * Math.cos(elevation) * distance, this.center.y + Math.sin(elevation) * distance, this.center.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
    out.target.copy(this.center);
  }

  private build(plan: Plan): void {
    const t0 = this.orbitEnd, glide = 6;
    const from = new TourPoseSnapshot(), end = plan.points[0]!, look = plan.stops[0]!.look;
    this.orbit(t0, from.pose);
    const p0 = from.pose.position.clone(), q0 = from.pose.target.clone();
    const c1 = p0.clone().lerp(end, 0.35).setY(p0.y * 0.85 + end.y * 0.15);
    const back = end.clone().sub(look).setY(0).normalize();
    const c2 = end.clone().addScaledVector(back, 2.2).setY(end.y + 1.4);
    const bezier = (t: number, target: THREE.Vector3) => {
      const u = 1 - t;
      return target.set(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(c1, 3 * u * u * t).addScaledVector(c2, 3 * u * t * t).addScaledVector(end, t * t * t);
    };
    this.legs.push({ start: t0, end: t0 + glide, pose: (t, out) => {
      const k = easeInOut(t);
      out.view = 'perspective'; out.evening = 0; bezier(k, out.position);
      out.target.copy(q0).lerp(look, ease(t * 1.3)); out.fov = THREE.MathUtils.lerp(this.start.fov, this.insideFov, k);
    } });
    // Walking: constant pace between stops, a slow look around at each.
    const lengths = [0]; for (let k = 1; k < plan.points.length; k++) lengths.push(lengths[k - 1]! + plan.points[k]!.distanceTo(plan.points[k - 1]!));
    // Pace: doorways pass at twice the speed, so a door leaf never lingers in frame.
    const middle = new THREE.Vector3();
    const paced = [0]; for (let k = 1; k < plan.points.length; k++) {
      middle.copy(plan.points[k - 1]!).add(plan.points[k]!).multiplyScalar(0.5);
      const doorway = plan.doors.some(door => door.distanceTo(middle) < 1.1);
      paced.push(paced[k - 1]! + (lengths[k]! - lengths[k - 1]!) * (doorway ? 0.45 : 1));
    }
    const arcAt = (p: number) => {
      let k = 1; while (k < paced.length - 1 && paced[k]! < p) k++;
      const span = paced[k]! - paced[k - 1]!;
      return lengths[k - 1]! + (lengths[k]! - lengths[k - 1]!) * (span > 0 ? THREE.MathUtils.clamp((p - paced[k - 1]!) / span, 0, 1) : 0);
    };
    const total = paced.at(-1)!, pause = 3, evening = 6;
    const budget = 54 - (t0 + glide) - evening - pause * (plan.stops.length - 1);
    const speed = THREE.MathUtils.clamp(total / Math.max(8, budget), 0.7, 1.8);
    const at = (s: number, target: THREE.Vector3) => {
      let k = 1; while (k < lengths.length - 1 && lengths[k]! < s) k++;
      const a = plan.points[k - 1]!, b = plan.points[k]!, span = lengths[k]! - lengths[k - 1]!;
      return target.copy(a).lerp(b, span > 0 ? THREE.MathUtils.clamp((s - lengths[k - 1]!) / span, 0, 1) : 0);
    };
    const ahead = new THREE.Vector3(), sample = new THREE.Vector3();
    let clock = t0 + glide;
    for (let stop = 0; stop < plan.stops.length; stop++) {
      const here = plan.stops[stop]!, last = stop === plan.stops.length - 1;
      // Pitched down onto the focal piece (a bed reads from above its footboard), capped at 18 degrees.
      const base = pitched(here.look.clone().sub(plan.points[here.index]!));
      const hold = last ? evening : pause;
      this.legs.push({ start: clock, end: clock + hold, pose: (t, out) => {
        const swing = last ? -0.2 * ease(t) : 0.28 * Math.sin(t * Math.PI);
        out.view = 'inside'; out.fov = this.insideFov; out.evening = last ? easeInOut(Math.min(1, t / 0.75)) : 0;
        out.position.copy(plan.points[here.index]!);
        out.target.copy(out.position).add(base.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, swing));
      } });
      clock += hold;
      if (last) break;
      const next = plan.stops[stop + 1]!, s0 = lengths[here.index]!, s1 = lengths[next.index]!, p0 = paced[here.index]!, p1 = paced[next.index]!;
      const nextBase = pitched(next.look.clone().sub(plan.points[next.index]!));
      const duration = Math.max(2, (p1 - p0) / speed);
      // Only turn toward the next room's furniture once through its door.
      let lastDoor = s0;
      for (let k = here.index; k <= next.index; k++) if (plan.doors.some(door => door.distanceTo(plan.points[k]!) < 1.1)) lastDoor = lengths[k]!;
      const turnFrom = Math.min(s1 - 0.8, Math.max(lastDoor + 0.9, s0 + (s1 - s0) * 0.45));
      this.legs.push({ start: clock, end: clock + duration, pose: (t, out) => {
        const s = arcAt(p0 + (p1 - p0) * easeInOut(t));
        out.view = 'inside'; out.fov = this.insideFov; out.evening = 0;
        at(s, out.position);
        // Look along the path a little ahead, blending from and into each stop's view.
        ahead.set(0, 0, 0);
        // A long look-ahead aims through doorways instead of at the leaf beside them.
        for (let k = 1; k <= 8; k++) ahead.add(at(Math.min(s1, s + k * 0.45), sample).sub(out.position).setY(0));
        if (ahead.lengthSq() < 1e-6) ahead.copy(nextBase); ahead.normalize();
        // Arriving, turn toward the next room's furniture well before the stop.
        const blendIn = 1 - ease(t / 0.25), blendOut = ease((s - turnFrom) / Math.max(0.6, s1 - turnFrom));
        ahead.lerp(base, blendIn).lerp(nextBase, blendOut).normalize();
        out.target.copy(out.position).add(ahead);
      } });
      clock += duration;
    }
    this.built = true;
  }

  /** The pose for this frame, or null when the tour is over. */
  update(now: number): TourPose | null {
    const t = (now - this.started) / 1000;
    if (!this.built) {
      this.planner.step(3);
      if (this.planner.done && t >= this.orbitEnd - 0.001) {
        this.orbitEnd = Math.max(this.orbitEnd, t);
        if (this.planner.plan) this.build(this.planner.plan);
        else { this.finished = true; return null; }
      } else if (t > 16 && !this.planner.done) { this.finished = true; return null; }
      else { this.orbit(t, this.pose); return this.pose; }
    }
    const leg = this.legs.find(item => t < item.end) ?? this.legs.at(-1);
    if (!leg) { this.finished = true; return null; }
    leg.pose(THREE.MathUtils.clamp((t - leg.start) / (leg.end - leg.start), 0, 1), this.pose);
    if (t >= this.legs.at(-1)!.end) this.finished = true;
    return this.pose;
  }
}

class TourPoseSnapshot { readonly pose: TourPose = { view: 'perspective', position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 32, evening: 0 }; }
