import * as THREE from 'three';
import type { SceneDocument, Vec2, Vec3 } from '../contracts';
import { wallSurfaceSpans } from '../core/wall-surfaces';

export interface WindowPortal { id: string; roomId: string; position: Vec3; inward: Vec2; area: number; thickness: number }
/** Only an unambiguous outdoor-facing opening supplies diffuse sky light.
 * These are disposable lighting approximations, not evidence about site or north. */
export function windowPortals(scene: SceneDocument): WindowPortal[] {
  const metadata = scene.project?.metadata ?? {};
  const rooms = scene.rooms.filter(room => metadata[room.id]?.phase !== 'remove' && !['balcony', 'terrace', 'loggia'].includes(metadata[room.id]?.zone ?? 'interior'));
  const result: WindowPortal[] = [];
  for (const wall of scene.walls) {
    if (metadata[wall.id]?.phase === 'remove') continue;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const ux = dx / length, uz = dz / length;
    const spans = wallSurfaceSpans(wall, rooms, metadata);
    for (const opening of wall.openings) {
      if (opening.kind !== 'window' || metadata[opening.id]?.phase === 'remove') continue;
      const touching = spans.filter(span => span.start < opening.offset + opening.width - 1e-5 && span.end > opening.offset + 1e-5);
      if (!touching.length || touching.some(span => span.front === span.back) || touching.some(span => span.front !== touching[0]!.front)) continue;
      const along = opening.offset + opening.width / 2;
      const room = rooms.find(item => wallSurfaceSpans(wall, [item], metadata).some(span => along >= span.start && along <= span.end && (span.front || span.back)));
      if (!room) continue;
      const side = touching[0]!.front ? 1 : -1;
      result.push({ id: opening.id, roomId: room.id,
        position: [wall.start[0] + ux * along, (metadata[wall.id]?.elevation ?? 0) + opening.sill + opening.height * 0.7, wall.start[1] + uz * along],
        inward: [-uz * side, ux * side], area: opening.width * opening.height, thickness: wall.thickness });
    }
  }
  return result.sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
}
export class InteriorDaylight {
  readonly group = new THREE.Group();
  private lights: THREE.SpotLight[] = [];
  private resolution = 512;
  private motionPending = false;
  constructor() { this.group.name = 'Window daylight preview'; this.group.visible = false; }
  setScene(scene: SceneDocument): void {
    this.clear();
    const all = windowPortals(scene), selected: WindowPortal[] = [], rooms = new Set<string>();
    // Give each room its strongest window before a second source in one room.
    for (const portal of all) if (!rooms.has(portal.roomId) && selected.length < 4) { selected.push(portal); rooms.add(portal.roomId); }
    for (const portal of all) if (selected.length < 4 && !selected.includes(portal)) selected.push(portal);
    for (const portal of selected) {
      const light = new THREE.SpotLight('#edf4ff', Math.min(100, 30 * portal.area), 14, 1.32, 1, 2);
      const offset = portal.thickness / 2 + 0.18;
      light.position.set(portal.position[0] - portal.inward[0] * offset, portal.position[1], portal.position[2] - portal.inward[1] * offset);
      light.target.position.set(portal.position[0] + portal.inward[0] * 3, portal.position[1] - 0.6, portal.position[2] + portal.inward[1] * 3);
      light.name = `Diffuse daylight · ${portal.id}`;
      light.castShadow = true;
      light.shadow.mapSize.set(this.resolution, this.resolution);
      light.shadow.camera.near = 0.04;
      light.shadow.camera.far = 14;
      light.shadow.bias = -0.00015;
      light.shadow.normalBias = 0.012;
      // A broad PCF kernel on this wide-angle near-window map reaches behind
      // thin door leaves and across grazing wall/ceiling depths. It produces
      // repeated self-shadow bands, not a larger physical daylight emitter.
      // Keep filtering local; preserve the small depth bias and solid blockers.
      light.shadow.radius = 0.5;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      this.lights.push(light); this.group.add(light, light.target);
    }
  }
  setEnabled(enabled: boolean): void { this.group.visible = enabled; }
  invalidateShadows(): void { for (const light of this.lights) light.shadow.needsUpdate = true; }
  /** update() reports remaining jobs; refresh once more for the completion frame. */
  updateMotion(active: boolean): void {
    if (active || this.motionPending) this.invalidateShadows();
    this.motionPending = active;
  }
  setQuality(quality: 'balanced' | 'high'): void {
    const resolution = quality === 'high' ? 1024 : 512;
    if (resolution === this.resolution) return;
    this.resolution = resolution;
    for (const light of this.lights) {
      light.shadow.mapSize.set(resolution, resolution);
      light.shadow.map?.dispose(); light.shadow.map = null; light.shadow.needsUpdate = true;
    }
  }
  private clear(): void { for (const light of this.lights) light.shadow.dispose(); this.lights = []; this.group.clear(); }
  dispose(): void { this.clear(); this.group.removeFromParent(); }
}
