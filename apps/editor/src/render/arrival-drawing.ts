import * as THREE from 'three';

// Folio designer ink (ui/theme.css --designer), as the room sweep uses it.
const INK = '#155f6d';
const EDGE_OPACITY = 0.9, HATCH_OPACITY = 0.32, HATCH_STEP = 0.07, OVERSHOOT = 0.08;
const noRaycast = (): void => {};
const smooth = (edge0: number, edge1: number, x: number) => { const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };

/** Phase lengths of one drawing, in ms from its start. */
export const DRAWING_MS = { edges: 260, hatch: 820, resolve: 900, gone: 1300 } as const;

interface Drawing { id: string; start: number; root: THREE.Group; hatch: THREE.LineSegments; levels: number; edgeMaterial: THREE.LineBasicMaterial; hatchMaterial: THREE.LineBasicMaterial; resolved: boolean }

/** Unit box (x, z in -0.5..0.5, y in 0..1) with drafting overshoot at every corner. */
function unitEdges(): THREE.BufferGeometry {
  const points: number[] = [];
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const;
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i]!, [x1, z1] = corners[(i + 1) % 4]!;
    const dx = (x1 - x0) * OVERSHOOT, dz = (z1 - z0) * OVERSHOOT;
    for (const y of [0, 1]) points.push(x0 - dx, y, z0 - dz, x1 + dx, y, z1 + dz);
    points.push(x0, -OVERSHOOT, z0, x0, 1 + OVERSHOOT, z0);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

/**
 * New pieces first appear as construction drawings: ink edges of their measured bounds with drafting overshoot,
 * then a faint hatch that rises with progress, then the drawing hands over to the real model and fades.
 * Unlit and shadowless; one shared edge geometry, per-drawing materials only differ in opacity (same program).
 */
export class ArrivalDrawings {
  readonly group = new THREE.Group();
  private readonly edges = unitEdges();
  private drawings: Drawing[] = [];

  constructor() {
    this.group.name = 'Arrival construction drawings';
    this.group.userData.studioAO = false;
  }

  get active(): boolean { return this.drawings.length > 0; }

  /** A drawing for a piece whose base-centred local frame is `matrix`, sized `dimensions`, starting at `start`. */
  add(id: string, matrix: THREE.Matrix4, dimensions: [number, number, number], start: number): void {
    this.remove(id);
    const [width, height, depth] = dimensions.map(value => Math.max(value, 0.02)) as [number, number, number];
    const root = new THREE.Group();
    root.matrixAutoUpdate = false; root.matrix.copy(matrix); root.matrixWorldNeedsUpdate = true;
    const edgeMaterial = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const hatchMaterial = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const edges = new THREE.LineSegments(this.edges, edgeMaterial);
    edges.scale.set(width, height, depth);
    // Horizontal hatch around the four sides, one level per step, drawn bottom first so a draw range makes it rise.
    const levels = Math.max(2, Math.min(40, Math.round(height / HATCH_STEP)));
    const points = new Float32Array(levels * 8 * 3);
    const hx = width / 2, hz = depth / 2;
    const ring = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as const;
    for (let level = 0; level < levels; level++) {
      const y = height * (level + 0.5) / levels;
      for (let side = 0; side < 4; side++) {
        const [x0, z0] = ring[side]!, [x1, z1] = ring[(side + 1) % 4]!;
        points.set([x0, y, z0, x1, y, z1], (level * 8 + side * 2) * 3);
      }
    }
    const hatch = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(points, 3)), hatchMaterial);
    hatch.geometry.setDrawRange(0, 0);
    for (const line of [edges, hatch]) { line.raycast = noRaycast; line.renderOrder = 620; line.frustumCulled = false; }
    root.add(edges, hatch);
    this.group.add(root);
    this.drawings.push({ id, start, root, hatch, levels, edgeMaterial, hatchMaterial, resolved: false });
  }

  /** Advance every drawing; `resolve(id)` is called once when a drawing hands over to its model. True while any remain. */
  update(now: number, resolve: (id: string) => void): boolean {
    if (!this.drawings.length) return false;
    for (const drawing of this.drawings) {
      const t = now - drawing.start;
      if (t < 0) continue;
      const fade = 1 - smooth(DRAWING_MS.resolve, DRAWING_MS.gone, t);
      drawing.edgeMaterial.opacity = EDGE_OPACITY * smooth(0, DRAWING_MS.edges, t) * fade;
      drawing.hatchMaterial.opacity = HATCH_OPACITY * fade;
      const rise = smooth(DRAWING_MS.edges * 0.5, DRAWING_MS.hatch, t);
      drawing.hatch.geometry.setDrawRange(0, Math.round(rise * drawing.levels) * 8);
      if (!drawing.resolved && t >= DRAWING_MS.resolve) { drawing.resolved = true; resolve(drawing.id); }
    }
    for (const drawing of this.drawings) if (now - drawing.start >= DRAWING_MS.gone) this.dispose(drawing);
    this.drawings = this.drawings.filter(drawing => drawing.root.parent);
    return this.drawings.length > 0;
  }

  /** Drop drawings, handing any unresolved piece over at once. */
  clear(resolve?: (id: string) => void): void {
    for (const drawing of this.drawings) { if (!drawing.resolved) resolve?.(drawing.id); this.dispose(drawing); }
    this.drawings = [];
  }

  remove(id: string): void {
    for (const drawing of this.drawings) if (drawing.id === id) this.dispose(drawing);
    this.drawings = this.drawings.filter(drawing => drawing.root.parent);
  }

  /** A hidden sample so the line program is compiled before the first drawing. */
  compileSample(): THREE.Object3D {
    const sample = new THREE.LineSegments(this.edges, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    sample.visible = false;
    return sample;
  }

  dispose(drawing?: Drawing): void {
    if (drawing) {
      drawing.root.removeFromParent(); drawing.hatch.geometry.dispose();
      drawing.edgeMaterial.dispose(); drawing.hatchMaterial.dispose();
      return;
    }
    this.clear(); this.edges.dispose();
  }
}
