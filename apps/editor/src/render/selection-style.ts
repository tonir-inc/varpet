import * as THREE from 'three';
import { TransformControls, TransformControlsGizmo } from 'three/addons/controls/TransformControls.js';

const selectionColor = '#8772bd';

/** Keep the interaction/picking machinery, but give the controls the studio palette. */
export function styleTransformControls(controls: TransformControls): void {
  controls.setColors('#bd8178', '#9982c8', '#7098ac', '#7053b5');

  controls.getHelper().traverse(object => {
    if (!(object instanceof TransformControlsGizmo)) return;
    // Three ships disconnected arrowheads behind the origin. Use one connected
    // handle per axis, and remove its matching picker to avoid invisible targets.
    for (const mode of ['translate', 'scale'] as const) {
      for (const group of [object.gizmo[mode], object.picker[mode]]) {
        for (const handle of [...group.children]) {
          if (!(handle instanceof THREE.Mesh) || !['X', 'Y', 'Z'].includes(handle.name)) continue;
          handle.geometry.computeBoundingBox();
          const bounds = handle.geometry.boundingBox;
          const axis = handle.name.toLowerCase() as 'x' | 'y' | 'z';
          if (bounds && (bounds.min[axis] + bounds.max[axis]) / 2 < -0.01) {
            group.remove(handle);
            // Materials are shared with the remaining handles.
            handle.geometry.dispose();
          }
        }
      }
    }
  });
}

/** A compact, approximately constant pixel size in either camera projection. */
export function resizeTransformControls(controls: TransformControls, viewportHeight: number): void {
  controls.setSize(THREE.MathUtils.clamp(420 / Math.max(viewportHeight, 1), 0.28, 0.75));
}

/** Open corners indicate the bounds without putting the selected object in a cage. */
export class SelectionFrame extends THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  readonly box = new THREE.Box3();
  private readonly previousBox = new THREE.Box3();
  private readonly positions = new THREE.Float32BufferAttribute(new Float32Array(8 * 3 * 2 * 3), 3);

  constructor(bounds: THREE.Box3) {
    super(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: selectionColor, transparent: true, opacity: 0.85,
      depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.geometry.setAttribute('position', this.positions);
    this.box.copy(bounds);
    this.renderOrder = 900;
    this.frustumCulled = false;
  }

  override updateMatrixWorld(force?: boolean): void {
    this.visible = !this.box.isEmpty();
    if (this.visible && !this.box.equals(this.previousBox)) {
      this.previousBox.copy(this.box);
      const padding = 0.015;
      const min = this.box.min, max = this.box.max;
      const x0 = min.x - padding, x1 = max.x + padding;
      const y0 = min.y - padding, y1 = max.y + padding;
      const z0 = min.z - padding, z1 = max.z + padding;
      const dx = Math.min((x1 - x0) * 0.2, 0.16);
      const dy = Math.min((y1 - y0) * 0.2, 0.16);
      const dz = Math.min((z1 - z0) * 0.2, 0.16);
      let index = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx < 0 ? x0 : x1, y = sy < 0 ? y0 : y1, z = sz < 0 ? z0 : z1;
        this.positions.setXYZ(index++, x, y, z);
        this.positions.setXYZ(index++, x - sx * dx, y, z);
        this.positions.setXYZ(index++, x, y, z);
        this.positions.setXYZ(index++, x, y - sy * dy, z);
        this.positions.setXYZ(index++, x, y, z);
        this.positions.setXYZ(index++, x, y, z - sz * dz);
      }
      this.positions.needsUpdate = true;
      this.geometry.computeBoundingSphere();
    }
    super.updateMatrixWorld(force);
  }
}
