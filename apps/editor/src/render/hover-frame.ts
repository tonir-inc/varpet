import * as THREE from 'three';
import type { Vec2 } from '../contracts';

// The selection outline's look (an ink line in a highlighter-yellow halo), lighter: hover says "a click picks this"
// without looking selected. The halo carries it on dark pieces and wall caps, the ink on pale walls and floors.
const INK = '#26241f', HALO = '#f6dc6a', INK_OPACITY = 0.6, HALO_OPACITY = 0.7, MAX_SEGMENTS = 96;
/** Ink stroke width as a share of the camera distance: about 1.5 CSS pixels at the editor's field of view; the halo is wider. */
const STROKE = 0.002, HALO_SCALE = 2.6;

/**
 * Hover highlight on what a click would pick: open corner brackets around a piece, wall or opening, or the floor
 * outline of a room. Strokes are thin instanced bars (WebGL lines are one device pixel, too faint on a retina
 * screen); matrices are rewritten in place for a new target, nothing is allocated.
 */
export class HoverFrame {
  readonly object = new THREE.Group();
  private readonly ink: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(1, 0, 0);
  private count = 0;
  private width = 0.03;

  constructor() {
    const bar = new THREE.BoxGeometry(1, 1, 1);
    const layer = (color: string, opacity: number, order: number) => {
      const mesh = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false }), MAX_SEGMENTS);
      mesh.count = 0; mesh.renderOrder = order; mesh.frustumCulled = false; mesh.raycast = () => {};
      return mesh;
    };
    this.halo = layer(HALO, HALO_OPACITY, 889); this.ink = layer(INK, INK_OPACITY, 890);
    this.object.add(this.halo, this.ink);
    this.object.name = 'Hover highlight'; this.object.visible = false; this.object.userData.studioAO = false;
  }

  /** Corner brackets a quarter of each side long (at most 0.45 m), just outside the bounds. */
  showBox(box: THREE.Box3, cameraDistance: number): void {
    if (box.isEmpty()) { this.hide(); return; }
    this.begin(cameraDistance);
    const pad = 0.02, min = box.min, max = box.max;
    const x0 = min.x - pad, x1 = max.x + pad, y0 = min.y - pad, y1 = max.y + pad, z0 = min.z - pad, z1 = max.z + pad;
    const dx = Math.min((x1 - x0) * 0.25, 0.45), dy = Math.min((y1 - y0) * 0.25, 0.45), dz = Math.min((z1 - z0) * 0.25, 0.45);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx < 0 ? x0 : x1, y = sy < 0 ? y0 : y1, z = sz < 0 ? z0 : z1;
      this.segment(x, y, z, x - sx * dx, y, z); this.segment(x, y, z, x, y - sy * dy, z); this.segment(x, y, z, x, y, z - sz * dz);
    }
    this.end();
  }

  /** A room: its floor outline, just above the floor. */
  showPolygon(polygon: Vec2[], y: number, cameraDistance: number): void {
    const count = Math.min(polygon.length, MAX_SEGMENTS);
    if (count < 3) { this.hide(); return; }
    this.begin(cameraDistance);
    for (let i = 0; i < count; i++) {
      const [ax, az] = polygon[i]!, [bx, bz] = polygon[(i + 1) % count]!;
      this.segment(ax, y, az, bx, y, bz);
    }
    this.end();
  }

  hide(): void { this.object.visible = false; }

  private begin(cameraDistance: number): void { this.count = 0; this.width = THREE.MathUtils.clamp(cameraDistance * STROKE, 0.006, 0.06); }

  private segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    if (this.count >= MAX_SEGMENTS) return;
    this.direction.set(bx - ax, by - ay, bz - az);
    const length = this.direction.length();
    if (length < 1e-6) return;
    this.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.rotation.setFromUnitVectors(this.axis, this.direction.divideScalar(length));
    // Overlap the corner by half a stroke so brackets meet cleanly.
    const halo = this.width * HALO_SCALE;
    this.ink.setMatrixAt(this.count, this.matrix.compose(this.position, this.rotation, this.scale.set(length + this.width, this.width, this.width)));
    this.halo.setMatrixAt(this.count++, this.matrix.compose(this.position, this.rotation, this.scale.set(length + halo, halo, halo)));
  }

  private end(): void {
    for (const mesh of [this.ink, this.halo]) { mesh.count = this.count; mesh.instanceMatrix.needsUpdate = true; }
    this.object.visible = this.count > 0;
  }

  /** A hidden sample so the program is compiled before the first hover. */
  compileSample(): THREE.Object3D {
    const sample = new THREE.Mesh(this.ink.geometry, this.ink.material);
    sample.visible = false;
    return sample;
  }

  dispose(): void { this.ink.geometry.dispose(); for (const mesh of [this.ink, this.halo]) { mesh.material.dispose(); mesh.dispose(); } }
}
