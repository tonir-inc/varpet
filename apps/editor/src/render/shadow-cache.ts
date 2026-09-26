import * as THREE from 'three';

/** One invalidation path for sun, window and ceiling shadow maps. */
export class SceneShadowCache {
  private dirty = true;
  private motionPending = false;
  constructor(private readonly scene: THREE.Scene) {}

  invalidate(): void { this.dirty = true; }

  /** Call after updating casters, including the last frame of a transition. */
  update(castersMoving: boolean): void {
    if (castersMoving || this.motionPending) this.dirty = true;
    this.motionPending = castersMoving;
    if (!this.dirty) return;
    this.scene.traverse(object => {
      if (!(object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight || object instanceof THREE.PointLight) || !object.castShadow) return;
      object.shadow.autoUpdate = false;
      object.shadow.needsUpdate = true;
    });
    this.dirty = false;
  }
}
