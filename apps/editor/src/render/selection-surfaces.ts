import * as THREE from 'three';

export type SelectionSurfaceKind = 'floor' | 'wall' | 'ceiling';
type Surface = 'floor' | 'wall-front' | 'wall-back' | 'wall-top' | 'ceiling' | 'hidden';
interface Entry {
  surfaces: Map<Surface, THREE.BufferGeometry>;
  centerZ: number;
  floorZ: number;
  ceilingY: number;
  wallTopY: number;
  release(): void;
}

/** Disposable mask geometry only. The authored mesh and its render geometry stay untouched. */
export class SelectionSurfaceGeometries {
  private readonly entries = new Map<THREE.BufferGeometry, Entry>();
  private readonly inverse = new THREE.Matrix4();
  private readonly cameraVector = new THREE.Vector3();
  private readonly cameraDirection = new THREE.Vector3();

  get(mesh: THREE.Mesh, kind: SelectionSurfaceKind, camera: THREE.Camera): THREE.BufferGeometry {
    const source = mesh.geometry;
    let entry = this.entries.get(source);
    if (!entry) {
      const position = source.getAttribute('position');
      let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
      if (position) for (let i = 0; i < position.count; i++) {
        minZ = Math.min(minZ, position.getZ(i)); maxZ = Math.max(maxZ, position.getZ(i));
        minY = Math.min(minY, position.getY(i)); maxY = Math.max(maxY, position.getY(i));
      }
      const surfaces = new Map<Surface, THREE.BufferGeometry>();
      const release = () => {
        source.removeEventListener('dispose', release);
        for (const geometry of surfaces.values()) geometry.dispose();
        surfaces.clear(); this.entries.delete(source);
      };
      entry = { surfaces, centerZ: Number.isFinite(minZ + maxZ) ? (minZ + maxZ) / 2 : 0,
        floorZ: maxZ, ceilingY: minY, wallTopY: maxY, release };
      this.entries.set(source, entry); source.addEventListener('dispose', release);
    }
    let surface: Surface = kind === 'wall' ? 'wall-front' : kind;
    mesh.updateWorldMatrix(true, false); camera.updateWorldMatrix(true, false);
    this.inverse.copy(mesh.matrixWorld).invert();
    this.cameraVector.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse);
    camera.getWorldDirection(this.cameraDirection).transformDirection(this.inverse);
    const orthographic = camera instanceof THREE.OrthographicCamera;
    const epsilon = 1e-6;
    if (kind === 'wall') {
      const front = orthographic ? this.cameraDirection.z <= 0 : this.cameraVector.z >= entry.centerZ;
      surface = front ? 'wall-front' : 'wall-back';
      // Top cameras see wall thickness. Its cap supplies a visible surface instead
      // of an edge-on vertical face, including while the cutaway height changes.
      if (this.cameraDirection.y < -0.99 && (orthographic || this.cameraVector.y > entry.wallTopY + epsilon)) surface = 'wall-top';
    } else if (kind === 'floor') {
      if (orthographic ? this.cameraDirection.z >= -epsilon : this.cameraVector.z <= entry.floorZ + epsilon) surface = 'hidden';
    } else if (orthographic ? this.cameraDirection.y <= epsilon : this.cameraVector.y >= entry.ceilingY - epsilon) {
      // OutlinePass uses a double-sided mask material. Explicitly suppress a
      // culled underside so selecting a room cannot reveal an invisible roof.
      surface = 'hidden';
    }
    let geometry = entry.surfaces.get(surface);
    if (!geometry) { geometry = surfaceGeometry(source, surface); entry.surfaces.set(surface, geometry); }
    return geometry;
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.release();
  }
}

function surfaceGeometry(source: THREE.BufferGeometry, surface: Surface): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const attribute = source.getAttribute('position'), positions: number[] = [];
  if (attribute && surface !== 'hidden') {
    const count = source.index?.count ?? attribute.count;
    const groups = source.groups.length ? source.groups : [{ start: 0, count, materialIndex: 0 }];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (const group of groups) {
      const material = group.materialIndex ?? 0;
      if (surface === 'wall-front' && material !== 4 || surface === 'wall-back' && material !== 5
        || surface === 'wall-top' && material !== 2) continue;
      const start = Math.max(group.start, source.drawRange.start);
      const end = Math.min(count, group.start + group.count, source.drawRange.start + source.drawRange.count);
      const outputStart = positions.length / 3;
      for (let i = start; i + 2 < end; i += 3) {
        a.fromBufferAttribute(attribute, source.index ? source.index.getX(i) : i);
        b.fromBufferAttribute(attribute, source.index ? source.index.getX(i + 1) : i + 1);
        c.fromBufferAttribute(attribute, source.index ? source.index.getX(i + 2) : i + 2);
        if (surface === 'floor' || surface === 'ceiling') {
          ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize();
          if (surface === 'floor' ? ab.z < 0.999 : ab.y > -0.999) continue;
        }
        // Retain the exact source winding, so back-face culling still matches the visible surface.
        for (const point of [a, b, c]) positions.push(point.x, point.y, point.z);
      }
      const outputCount = positions.length / 3 - outputStart;
      if (outputCount) geometry.addGroup(outputStart, outputCount, material);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
