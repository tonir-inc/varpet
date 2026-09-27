import * as THREE from 'three';
import type { Vec2 } from '../contracts';
import { label3d } from './annotations';

// Folio designer ink and its soft tint (ui/theme.css --designer, --designer-soft) on the blueprint paper.
const INK = '#155f6d', SOFT = '#80b8c0', PAPER = '#f5f5f0';
const TICK = 0.5, FLOOR = 0.014;
const noRaycast = (): void => {};
const smooth = (edge0: number, edge1: number, x: number) => { const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };

interface Dimension { lines: THREE.LineSegments; label: THREE.Sprite; stops: Array<{ at: number; count: number }> }
interface Sweep {
  started: number; duration: number; axis: 'x' | 'z'; min: number; max: number; polygon: Vec2[];
  parts: THREE.Group; outline: THREE.LineLoop; wash: THREE.Mesh; blade: THREE.Mesh; lead: THREE.Mesh; along: Dimension; across: Dimension;
}

/**
 * "The designer is measuring this room": a light blade sweeps the floor footprint with a bright leading edge,
 * dimension ticks fill in behind it, then everything fades. Unlit and shadowless; materials are shared for the
 * layer's life so a sweep never compiles a program mid-shot.
 */
export class RoomSweep {
  readonly group = new THREE.Group();
  private readonly plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  private readonly strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly line = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false });
  private readonly ticks = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false });
  private readonly wash = new THREE.MeshBasicMaterial({ color: SOFT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private readonly blade = new THREE.MeshBasicMaterial({ color: SOFT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private readonly lead = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private sweep: Sweep | null = null;

  constructor() {
    this.group.name = 'Room measuring sweep';
    this.group.userData.studioAO = false;
  }

  get active(): boolean { return this.sweep !== null; }

  start(polygon: Vec2[], elevation: number, height: number, duration: number, now = performance.now()): void {
    this.stop();
    if (polygon.length < 3 || !polygon.every(point => point.every(Number.isFinite))) return;
    const xs = polygon.map(point => point[0]), zs = polygon.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    if (maxX - minX < 0.2 || maxZ - minZ < 0.2) return;
    const axis = maxX - minX >= maxZ - minZ ? 'x' : 'z';
    const y = elevation + FLOOR;
    const parts = new THREE.Group();

    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(polygon.map(([x, z]) => new THREE.Vector3(x, y, z))), this.line);
    const shape = new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, z)));
    const wash = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2).translate(0, y - 0.002, 0), this.wash);
    const blade = new THREE.Mesh(this.plane, this.blade);
    blade.scale.y = THREE.MathUtils.clamp(height * 0.38, 0.6, 1.05); blade.position.y = y;
    if (axis === 'x') blade.rotation.y = Math.PI / 2;
    const lead = new THREE.Mesh(this.strip, this.lead);
    lead.position.y = y + 0.002; if (axis === 'x') lead.rotation.y = Math.PI / 2;
    // Dimensions sit just inside the footprint's near edges, where the floor is.
    const inset = 0.28;
    const alongX = this.dimension(new THREE.Vector3(minX, y, minZ + inset), new THREE.Vector3(maxX, y, minZ + inset), new THREE.Vector3(0, 0, 1));
    const alongZ = this.dimension(new THREE.Vector3(minX + inset, y, minZ), new THREE.Vector3(minX + inset, y, maxZ), new THREE.Vector3(1, 0, 0));
    const [along, across] = axis === 'x' ? [alongX, alongZ] : [alongZ, alongX];
    for (const object of [outline, wash, blade, lead, along.lines, across.lines]) { object.raycast = noRaycast; object.renderOrder = 610; }
    parts.add(wash, outline, blade, lead, along.lines, along.label, across.lines, across.label);
    this.group.add(parts);
    this.sweep = { started: now, duration: Math.max(600, duration), axis, min: axis === 'x' ? minX : minZ, max: axis === 'x' ? maxX : maxZ, polygon, parts, outline, wash, blade, lead, along, across };
    this.update(now);
  }

  /** Advance the sweep; returns whether another frame is needed. */
  update(now: number): boolean {
    const sweep = this.sweep;
    if (!sweep) return false;
    const t = (now - sweep.started) / sweep.duration;
    if (t >= 1) { this.stop(); return false; }
    const fadeIn = smooth(0, 0.12, t), fadeOut = 1 - smooth(0.82, 1, t);
    const p = smooth(0.08, 0.8, t);
    const at = sweep.min + (sweep.max - sweep.min) * p;
    const span = this.span(sweep, at);
    const bladeOn = 1 - smooth(0.78, 0.86, t);
    sweep.blade.visible = sweep.lead.visible = Boolean(span) && bladeOn > 0;
    if (span) {
      const middle = (span[0] + span[1]) / 2, width = span[1] - span[0];
      for (const mesh of [sweep.blade, sweep.lead]) {
        if (sweep.axis === 'x') mesh.position.set(at, mesh.position.y, middle); else mesh.position.set(middle, mesh.position.y, at);
      }
      sweep.blade.scale.x = width; sweep.lead.scale.set(width, 1, 0.035);
    }
    this.line.opacity = 0.6 * fadeIn * fadeOut;
    this.wash.opacity = 0.1 * fadeIn * fadeOut;
    this.blade.opacity = 0.16 * fadeIn * bladeOn;
    this.lead.opacity = 0.85 * fadeIn * bladeOn;
    this.ticks.opacity = 0.55 * fadeIn * fadeOut;
    // Ticks along the sweep fill in behind the blade; the cross dimension reads from the start.
    const revealed = sweep.along.stops.filter(stop => stop.at <= at + 1e-6).at(-1)?.count ?? 0;
    sweep.along.lines.geometry.setDrawRange(0, revealed);
    (sweep.across.label.material as THREE.SpriteMaterial).opacity = fadeIn * fadeOut;
    (sweep.along.label.material as THREE.SpriteMaterial).opacity = smooth(0.72, 0.84, t) * fadeOut;
    return true;
  }

  stop(): void {
    const sweep = this.sweep;
    if (!sweep) return;
    this.sweep = null;
    sweep.parts.removeFromParent();
    sweep.outline.geometry.dispose(); sweep.wash.geometry.dispose();
    for (const dimension of [sweep.along, sweep.across]) {
      dimension.lines.geometry.dispose();
      const material = dimension.label.material as THREE.SpriteMaterial; material.map?.dispose(); material.dispose();
    }
  }

  /** One object per shared material, for an off-frame program compile (not for the world). */
  compileSample(): THREE.Object3D {
    const sample = new THREE.Group();
    sample.add(new THREE.Mesh(this.plane, this.blade), new THREE.Mesh(this.strip, this.lead), new THREE.Mesh(this.strip, this.wash),
      new THREE.LineSegments(this.plane, this.ticks), new THREE.LineLoop(this.plane, this.line));
    return sample;
  }

  dispose(): void {
    this.stop();
    this.group.removeFromParent();
    for (const disposable of [this.plane, this.strip, this.line, this.ticks, this.wash, this.blade, this.lead]) disposable.dispose();
  }

  /** The footprint's extent across the sweep at `at` (outer hull of a concave room's cut). */
  private span(sweep: Sweep, at: number): [number, number] | null {
    const [a, b] = sweep.axis === 'x' ? [0, 1] as const : [1, 0] as const;
    let low = Infinity, high = -Infinity;
    sweep.polygon.forEach((point, index) => {
      const next = sweep.polygon[(index + 1) % sweep.polygon.length]!;
      const p = point[a], q = next[a];
      if ((p - at) * (q - at) > 0 || Math.abs(q - p) < 1e-9) return;
      const cut = point[b] + (at - p) / (q - p) * (next[b] - point[b]);
      low = Math.min(low, cut); high = Math.max(high, cut);
    });
    return high - low > 0.02 ? [low, high] : null;
  }

  /** A dimension line from start to end with end ticks and half-metre ticks, drawn in coordinate order so a draw range reveals it. */
  private dimension(start: THREE.Vector3, end: THREE.Vector3, across: THREE.Vector3): Dimension {
    const direction = end.clone().sub(start), length = direction.length(); direction.normalize();
    const axis = Math.abs(direction.x) > Math.abs(direction.z) ? 'x' : 'z';
    const points: THREE.Vector3[] = [], stops: Dimension['stops'] = [];
    const tick = (at: number, size: number) => {
      const base = start.clone().addScaledVector(direction, at);
      points.push(base.clone().addScaledVector(across, -size), base.clone().addScaledVector(across, size));
    };
    tick(0, 0.1);
    stops.push({ at: start[axis], count: points.length });
    let previous = 0;
    const marks: number[] = [];
    for (let at = TICK; at < length - 0.05; at += TICK) marks.push(at);
    marks.push(length);
    for (const at of marks) {
      points.push(start.clone().addScaledVector(direction, previous), start.clone().addScaledVector(direction, at));
      tick(at, at === length ? 0.1 : Math.abs(at % 1) < 1e-6 ? 0.07 : 0.04);
      stops.push({ at: start[axis] + at * (direction[axis] >= 0 ? 1 : -1), count: points.length });
      previous = at;
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), this.ticks);
    const label = label3d(`${length.toFixed(2)} m`, INK, PAPER);
    const material = label.material as THREE.SpriteMaterial; material.opacity = 0;
    label.scale.set(1.5, 1.5 / 8, 1); label.renderOrder = 812; label.raycast = noRaycast;
    label.position.copy(start).lerp(end, 0.5).addScaledVector(across, 0.2).setY(start.y + 0.06);
    return { lines, label, stops };
  }
}
