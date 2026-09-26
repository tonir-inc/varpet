import * as THREE from 'three';

/**
 * A fixed set of point lights that stands in for every practical light in the world.
 *
 * Three.js bakes the number of lights into every material's shader, so a lamp arriving
 * with a designer proposal, or a light switching on, would recompile all materials
 * (a 0.3 to 1.5 s freeze). Source lights (lamps, fixtures, evening room fills) stay in
 * the scene graph for their owners to move and dim, but never render themselves: each
 * frame the pool copies the sources nearest the camera into its own always-present lights.
 */
export class PracticalLightPool {
  readonly group = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private readonly sources: THREE.PointLight[] = [];
  private readonly scores: number[] = [];
  private readonly order: number[] = [];
  private readonly position = new THREE.Vector3();
  private readonly positions: THREE.Vector3[] = [];

  constructor(readonly size = 8) {
    this.group.name = 'Practical light pool';
    for (let index = 0; index < size; index++) {
      const light = new THREE.PointLight('#ffffff', 0, 0, 2);
      light.castShadow = false; light.userData.pooled = true;
      this.lights.push(light); this.group.add(light);
    }
  }

  /** Call once per frame, after owners updated their sources and world matrices. */
  sync(world: THREE.Object3D, camera: THREE.Camera): void {
    const sources = this.sources; sources.length = 0;
    world.traverse(object => {
      if (!(object instanceof THREE.PointLight) || object.userData.pooled) return;
      // Sources never render; only the pool changes the light count, and it never does.
      object.visible = false;
      if (object.intensity > 0 && ancestorsVisible(object)) sources.push(object);
    });
    camera.getWorldPosition(this.position);
    const scores = this.scores, order = this.order; scores.length = 0; order.length = 0;
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index]!;
      source.updateWorldMatrix(true, false);
      const point = this.positions[index] ?? (this.positions[index] = new THREE.Vector3());
      point.setFromMatrixPosition(source.matrixWorld);
      // Brightest and nearest first: what the camera can actually see lit.
      scores.push(source.intensity / (1 + point.distanceToSquared(this.position)));
      order.push(index);
    }
    order.sort((a, b) => scores[b]! - scores[a]!);
    for (let slot = 0; slot < this.lights.length; slot++) {
      const light = this.lights[slot]!, index = order[slot];
      if (index === undefined) { light.intensity = 0; continue; }
      const source = sources[index]!;
      light.position.copy(this.positions[index]!);
      light.color.copy(source.color); light.intensity = source.intensity;
      light.distance = source.distance; light.decay = source.decay;
    }
    this.group.updateMatrixWorld(true);
  }

  dispose(): void { for (const light of this.lights) light.dispose(); this.group.clear(); }
}

function ancestorsVisible(object: THREE.Object3D): boolean {
  for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return false;
  return true;
}

export interface RoomFill { center: THREE.Vector3; area: number }

/** Warm ceiling glow per room after dusk; sources for the pool, invisible by themselves. */
export class EveningRoomLights {
  readonly group = new THREE.Group();
  constructor() { this.group.name = 'Evening room lights'; this.group.userData.studioAO = false; }

  setRooms(rooms: RoomFill[]): void {
    for (const child of [...this.group.children]) { this.group.remove(child); (child as THREE.PointLight).dispose(); }
    for (const room of rooms) {
      if (room.area < 2.5) continue;
      const light = new THREE.PointLight('#ffd3a3', 0, 0, 2);
      light.position.copy(room.center);
      light.userData.fillBase = 3.2 * Math.sqrt(room.area);
      this.group.add(light);
    }
    this.group.updateMatrixWorld(true);
  }

  /** 0 by day, 1 at night. */
  setLevel(level: number): void {
    for (const child of this.group.children) {
      const light = child as THREE.PointLight;
      light.intensity = level * (light.userData.fillBase as number);
    }
  }
}
