import * as THREE from 'three';
import type { PlacementConflict } from '../core/placement-conflicts';

/** Temporary geometry only: the candidate and the committed scene stay untouched. */
export class PlacementFeedback {
  readonly group = new THREE.Group();
  private readonly fill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: '#ff343f', transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    depthTest: false, depthWrite: false, toneMapped: false,
  }));
  private readonly outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color: '#ff5660', transparent: true, opacity: 0.95,
    depthTest: false, depthWrite: false, toneMapped: false,
  }));
  private readonly status = document.createElement('div');

  constructor(container: HTMLElement) {
    this.group.name = 'Placement conflicts';
    this.group.visible = false;
    // Keep the conflict visible through the dragged object, below selection and handles.
    this.fill.renderOrder = 880; this.outline.renderOrder = 881;
    this.fill.frustumCulled = false; this.outline.frustumCulled = false;
    this.group.add(this.fill, this.outline);
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.style.cssText = 'position:absolute;left:16px;bottom:40px;max-width:calc(100% - 32px);padding:8px 12px;border:1px solid #ff566088;border-radius:8px;background:#311b24ee;color:#ffc8cc;font-size:12px;line-height:1.4;pointer-events:none;z-index:4';
    this.status.hidden = true;
    container.append(this.status);
  }

  update(conflicts: PlacementConflict[]): void {
    if (!conflicts.length) { this.clear(); return; }
    const faces: number[] = [], lines: number[] = [];
    for (const { polygon, bottom, top, kind } of conflicts) {
      if (polygon.length < 3) continue;
      const low = bottom + 0.015;
      const high = kind === 'support' ? low : Math.max(low, top + 0.015);
      const point = (index: number, y: number): number[] => [polygon[index]![0], y, polygon[index]![1]];
      const triangles = THREE.ShapeUtils.triangulateShape(polygon.map(([x, z]) => new THREE.Vector2(x, z)), []);
      // One horizontal cap marks the precise conflicting area in both camera modes.
      for (const triangle of triangles) for (const index of triangle) faces.push(...point(index, high));
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        lines.push(...point(i, high), ...point(j, high));
        if (high > low) {
          faces.push(...point(i, low), ...point(j, low), ...point(j, high), ...point(i, low), ...point(j, high), ...point(i, high));
          lines.push(...point(i, low), ...point(j, low), ...point(i, low), ...point(i, high));
        }
      }
    }
    this.writePositions(this.fill.geometry, faces);
    this.writePositions(this.outline.geometry, lines);
    this.group.visible = faces.length > 0;
    const labels = { support: 'outside the floor plan', wall: 'wall intersection', overlap: 'furniture overlap' };
    const message = `Placement conflict: ${[...new Set(conflicts.map(conflict => labels[conflict.kind]))].join(' · ')}`;
    if (this.status.textContent !== message) this.status.textContent = message;
    this.status.hidden = !this.group.visible;
  }

  private writePositions(geometry: THREE.BufferGeometry, positions: number[]): void {
    let attribute = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attribute || attribute.array.length < positions.length) {
      // Release the old GPU buffer before growing; otherwise reuse it across drag frames.
      geometry.dispose();
      attribute = new THREE.Float32BufferAttribute(new Float32Array(Math.max(positions.length * 2, 96)), 3);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', attribute);
    }
    (attribute.array as Float32Array).set(positions);
    attribute.needsUpdate = true;
    geometry.setDrawRange(0, positions.length / 3);
  }

  clear(): void {
    this.group.visible = false;
    this.status.hidden = true;
    this.status.textContent = '';
  }

  dispose(): void {
    this.group.removeFromParent();
    this.fill.geometry.dispose(); this.fill.material.dispose();
    this.outline.geometry.dispose(); this.outline.material.dispose();
    this.status.remove();
  }
}
