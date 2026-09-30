import * as THREE from 'three';
import type { PlacementConflict } from '../core/placement-conflicts';
import type { CatalogAsset, SceneObject, ToolMode, Vec3 } from '../contracts';
import { objectFootprint } from '../core/validation';
import { furnitureDimensions } from '../core/furniture-bounds';

export interface PlacementPreview {
  object: SceneObject;
  asset: CatalogAsset;
  mode: ToolMode | 'add';
  origin?: Vec3;
  snap: boolean;
  count?: number;
}

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
  private readonly measurement = document.createElement('div');
  private readonly hud = document.createElement('div');
  private readonly footprint = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color: '#f1d384', transparent: true, opacity: 0.85,
    depthTest: false, depthWrite: false, toneMapped: false,
  }));

  constructor(private readonly container: HTMLElement) {
    this.group.name = 'Placement conflicts';
    this.group.visible = false;
    // Keep the conflict visible through the dragged object, below selection and handles.
    this.fill.renderOrder = 880; this.outline.renderOrder = 881;
    this.fill.frustumCulled = false; this.outline.frustumCulled = false;
    this.footprint.name = 'Placement footprint';
    this.footprint.renderOrder = 879; this.footprint.frustumCulled = false;
    this.fill.raycast = this.outline.raycast = this.footprint.raycast = () => {};
    this.group.add(this.fill, this.outline, this.footprint);
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.hud.style.cssText = 'position:absolute;left:16px;bottom:48px;width:max-content;max-width:min(400px,calc(100% - 32px));pointer-events:none;z-index:30';
    this.hud.className = 'placement-hud';
    this.status.style.cssText = 'box-sizing:border-box;max-width:100%;margin-bottom:8px;padding:8px 12px;border:1px solid #ff566088;border-radius:8px;background:#311b24ee;color:#ffc8cc;font-size:12px;line-height:1.4';
    this.measurement.className = 'placement-measurement';
    // Announce conflict changes, not rapidly changing centimetres on each pointer event.
    this.measurement.setAttribute('aria-hidden', 'true');
    this.measurement.style.cssText = 'box-sizing:border-box;max-width:100%;padding:10px 14px;border:1px solid #e5d6b655;border-radius:10px;background:#292923ed;color:#f5f1e7;font:12px/1.6 system-ui,sans-serif;white-space:pre-line;font-variant-numeric:tabular-nums;box-shadow:0 6px 24px #0002';
    this.status.hidden = true;
    this.measurement.hidden = true;
    this.hud.append(this.status, this.measurement); container.append(this.hud);
  }

  update(conflicts: PlacementConflict[], preview?: PlacementPreview): void {
    if (!conflicts.length && !preview) { this.clear(); return; }
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
    this.fill.visible = this.outline.visible = faces.length > 0;
    this.updatePreview(preview, conflicts.length > 0);
    this.group.visible = faces.length > 0 || this.footprint.visible;
    const labels = { support: 'outside the floor plan', wall: 'wall intersection', overlap: 'furniture overlap',
      door: 'door intersection', 'door-swing': 'door opening / closing clearance' };
    const message = conflicts.length ? `Placement conflict: ${[...new Set(conflicts.map(conflict => labels[conflict.kind]))].join(' · ')}` : '';
    if (this.status.textContent !== message) this.status.textContent = message;
    this.status.hidden = !conflicts.length;
    // The real workspace dock is taller on phones. Keep every instruction above it.
    const dock = this.container.closest('.viewport-shell')?.querySelector<HTMLElement>('.folio-dock');
    const bottom = dock && !dock.hidden ? Math.max(48, this.container.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 12) : 48;
    this.hud.style.bottom = `${Math.ceil(bottom)}px`;
  }

  private updatePreview(preview: PlacementPreview | undefined, review: boolean): void {
    this.footprint.visible = !!preview;
    this.measurement.hidden = !preview;
    if (!preview) return;
    const { object, asset, mode, origin, snap, count = 1 } = preview;
    const polygon = objectFootprint(object, asset);
    const y = object.position[1] + 0.018;
    const positions: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      positions.push(a[0], y, a[1], b[0], y, b[1]);
    }
    this.writePositions(this.footprint.geometry, positions);
    this.footprint.material.color.set(review ? '#eab36a' : '#f1d384');
    const dimensions = furnitureDimensions(object, asset);
    const size = `W ${dimensions[0].toFixed(2)} · D ${dimensions[2].toFixed(2)} · H ${dimensions[1].toFixed(2)} m`;
    const heading = count > 1 ? `${count} pieces` : object.name;
    const modeLabel = { select: 'Move', move: 'Move', rotate: 'Rotate', scale: 'Resize', add: 'Place' }[mode];
    const distance = origin ? Math.hypot(object.position[0] - origin[0], object.position[2] - origin[2]) : 0;
    const detail = mode === 'rotate' ? `${THREE.MathUtils.radToDeg(object.rotation).toFixed(1)}° · ${size}`
      : (mode === 'move' || mode === 'select') && origin ? `${distance.toFixed(2)} m moved · ${size}` : size;
    const text = `${modeLabel} ${heading}\n${detail}\n${snap ? 'Snap on · Shift for smooth' : 'Smooth'} · Release to apply · Esc to cancel`;
    if (this.measurement.textContent !== text) this.measurement.textContent = text;
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
    this.footprint.visible = false;
    this.measurement.hidden = true;
    this.measurement.textContent = '';
  }

  dispose(): void {
    this.group.removeFromParent();
    this.fill.geometry.dispose(); this.fill.material.dispose();
    this.outline.geometry.dispose(); this.outline.material.dispose();
    this.footprint.geometry.dispose(); this.footprint.material.dispose();
    this.hud.remove();
  }
}
