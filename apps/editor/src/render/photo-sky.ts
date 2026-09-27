import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import skyUrl from '../assets/env/sky-partly-cloudy-1k.hdr?url';

/** Radiance cap: the photographed sun is clipped so only our own sun lights and shadows the flat. */
const SUN_CLIP = 6;
/** How much of the sky's blue reaches the rooms: open sky is mostly blue light, which turns paint and wood cold. */
const LIGHT_SATURATION = 0.2;

/**
 * A photographed partly cloudy sky (Poly Haven, CC0) for daytime reflections, soft sky fill and the view
 * through the windows. Loads once in the background; until it arrives the procedural rig stays in use.
 */
export class PhotoSky {
  environment: THREE.Texture | null = null;
  background: THREE.Texture | null = null;
  private disposed = false;

  load(renderer: THREE.WebGLRenderer): Promise<boolean> {
    return new HDRLoader().setDataType(THREE.FloatType).loadAsync(skyUrl).then(texture => {
      if (this.disposed) { texture.dispose(); return false; }
      const data = texture.image.data as Float32Array;
      for (let i = 0; i < data.length; i += 4) {
        const peak = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
        if (peak > SUN_CLIP) { const k = SUN_CLIP / peak; data[i]! *= k; data[i + 1]! *= k; data[i + 2]! *= k; }
      }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.needsUpdate = true;
      // The windows show the real sky; light and reflections keep its clouds and brightness, nearly neutral.
      const light = texture.clone(); light.image = { ...texture.image, data: new Float32Array(data) };
      const neutral = light.image.data as Float32Array;
      for (let i = 0; i < neutral.length; i += 4) {
        const luma = 0.2126 * neutral[i]! + 0.7152 * neutral[i + 1]! + 0.0722 * neutral[i + 2]!;
        for (let c = 0; c < 3; c++) neutral[i + c] = luma + (neutral[i + c]! - luma) * LIGHT_SATURATION;
      }
      light.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.environment = pmrem.fromEquirectangular(light).texture;
      pmrem.dispose(); light.dispose();
      this.background = texture;
      return true;
    }).catch(() => false);
  }

  dispose(): void {
    this.disposed = true;
    this.environment?.dispose(); this.background?.dispose();
    this.environment = this.background = null;
  }
}
