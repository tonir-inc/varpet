import * as THREE from 'three';

/** Keep the actual finish/map shaders, but show their base color in unlit Top view. */
export class TopLightingProjection {
  private readonly unlit = { value: false };
  private readonly releases = new Map<THREE.Material, () => void>();

  prepare(scene: THREE.Scene, unlit: boolean): void {
    this.unlit.value = unlit;
    // Wrap in every view so entering or leaving Top only flips a uniform, never recompiles.
    // Includes newly loaded models, live wall previews and replacement finishes.
    scene.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial
          || material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshToonMaterial) this.prepareMaterial(material);
      }
    });
  }

  private prepareMaterial(material: THREE.Material): void {
    if (this.releases.has(material)) return;
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey;
    // The default cache key reads onBeforeCompile; capture it before wrapping.
    const key = cacheKey.call(material);
    const topCacheKey = () => `${key}:varpet-top-unlit-v1`;
    const topCompile: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.uniforms.uTopUnlit = this.unlit;
      shader.fragmentShader = `uniform bool uTopUnlit;\n${shader.fragmentShader}`
        .replace('#include <opaque_fragment>', 'if (uTopUnlit) outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>');
    };
    material.customProgramCacheKey = topCacheKey;
    material.onBeforeCompile = topCompile;
    material.needsUpdate = true;
    const release = () => {
      if (material.onBeforeCompile === topCompile) material.onBeforeCompile = compile;
      if (material.customProgramCacheKey === topCacheKey) material.customProgramCacheKey = cacheKey;
      material.removeEventListener('dispose', release);
      this.releases.delete(material);
      material.needsUpdate = true;
    };
    material.addEventListener('dispose', release);
    this.releases.set(material, release);
  }

  dispose(): void {
    this.unlit.value = false;
    for (const release of this.releases.values()) release();
    // Materials and textures belong to their projections, never this view setting.
  }
}
