import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { SceneDocument } from '../contracts';
import { windowPortals, type WindowPortal } from './interior-daylight';

/**
 * Soft sky light from each outdoor window: one rectangle the size of the glass, facing into the room.
 *
 * Area lights cast no shadows, so there are no fan-shaped mullion shadows (the reason the shadowed
 * window spotlights were retired). The pool has a fixed size: the light count is baked into every
 * material's program, so windows arriving or leaving only change intensities, never recompile.
 */
export class WindowSkyLights {
  readonly group = new THREE.Group();
  private readonly lights: THREE.RectAreaLight[] = [];
  private readonly base: number[] = [];
  private level = 0;

  constructor(readonly size = 6) {
    RectAreaLightUniformsLib.init();
    this.group.name = 'Window sky light';
    this.group.userData.studioAO = false;
    for (let index = 0; index < size; index++) {
      const light = new THREE.RectAreaLight('#eef4ff', 0, 1, 1);
      this.lights.push(light); this.base.push(0); this.group.add(light);
    }
  }

  setScene(scene: SceneDocument): void {
    const all = windowPortals(scene), chosen: WindowPortal[] = [], rooms = new Set<string>();
    // Each room's largest window first, then second windows while slots remain.
    for (const portal of all) if (!rooms.has(portal.roomId) && chosen.length < this.size) { chosen.push(portal); rooms.add(portal.roomId); }
    for (const portal of all) if (chosen.length < this.size && !chosen.includes(portal)) chosen.push(portal);
    for (let slot = 0; slot < this.size; slot++) {
      const light = this.lights[slot]!, portal = chosen[slot];
      if (!portal) { this.base[slot] = 0; light.intensity = 0; continue; }
      // windowPortals places `position` at 70% of the opening height, so the opening is (top - y) / 0.3 tall.
      light.height = Math.max(0.3, (portal.top - portal.position[1]) / 0.3);
      light.width = Math.max(0.3, portal.area / light.height);
      // Just inside the reveal, centred on the glass, facing the room.
      const inset = portal.thickness / 2 + 0.02;
      const y = portal.top - light.height / 2;
      light.position.set(portal.position[0] + portal.inward[0] * inset, y, portal.position[2] + portal.inward[1] * inset);
      light.lookAt(light.position.x + portal.inward[0], y, light.position.z + portal.inward[1]);
      this.base[slot] = 10;
      light.intensity = this.base[slot]! * this.level;
    }
    this.group.updateMatrixWorld(true);
  }

  /** 0 at night to 1 at full daylight. */
  setLevel(level: number): void {
    this.level = Math.max(0, level);
    for (let slot = 0; slot < this.size; slot++) this.lights[slot]!.intensity = this.base[slot]! * this.level;
  }

  dispose(): void { for (const light of this.lights) light.dispose(); this.group.clear(); }
}
