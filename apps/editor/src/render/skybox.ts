import * as THREE from 'three';
import { DEFAULT_SUN, effectiveSunlight, type SunLighting } from './sunlight';

export const SKYBOX_PRESETS = [
  { id: 'studio', label: 'Studio' },
  { id: 'daylight', label: 'Clear sky' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'overcast', label: 'Overcast' },
] as const;

export type SkyboxPreset = typeof SKYBOX_PRESETS[number]['id'];
type OutdoorPreset = Exclude<SkyboxPreset, 'studio'>;
/** Captures also include the blue hour seen through windows after dusk; it is not a selectable preset. */
export type SkyCapture = OutdoorPreset | 'twilight';

export function isSkyboxPreset(value: unknown): value is SkyboxPreset {
  return SKYBOX_PRESETS.some(preset => preset.id === value);
}

interface SkyboxTextures { background: THREE.CubeTexture; environment: THREE.Texture }
interface CachedSkybox { key: string; textures: SkyboxTextures; background: THREE.WebGLCubeRenderTarget; environment: THREE.WebGLRenderTarget }

const PALETTES = {
  // nadir is the horizon haze below eye level; ground/skyline give windows a
  // readable outside (distant trees and roofs, then lawn and paving) instead of a void.
  daylight: { zenith: '#4f86c6', horizon: '#cfdfea', nadir: '#b9c6cc', ground: '#7f8570', skyline: '#5d6f63', cloud: '#f6f7f5', coverage: 0.56, opacity: 0.62, radiance: 1.7 },
  sunset: { zenith: '#5b7197', horizon: '#f0b186', nadir: '#b39c95', ground: '#5d5146', skyline: '#5a4e56', cloud: '#f2cdb9', coverage: 0.57, opacity: 0.5, radiance: 1.3 },
  overcast: { zenith: '#a5afb9', horizon: '#dce1e3', nadir: '#bcc4c7', ground: '#737a6c', skyline: '#7d8784', cloud: '#e5e9ea', coverage: 0.3, opacity: 0.72, radiance: 1.35 },
  twilight: { zenith: '#0b1a3a', horizon: '#3a4c78', nadir: '#1f2740', ground: '#12151b', skyline: '#080b12', cloud: '#26314f', coverage: 0.6, opacity: 0.35, radiance: 1 },
} satisfies Record<SkyCapture, object>;

function makeSkyMaterial(preset: SkyCapture, lighting: SunLighting): THREE.ShaderMaterial {
  const palette = PALETTES[preset];
  return new THREE.ShaderMaterial({
    name: `Skybox ${preset} capture`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color(palette.zenith) },
      horizon: { value: new THREE.Color(palette.horizon) },
      nadir: { value: new THREE.Color(palette.nadir) },
      ground: { value: new THREE.Color(palette.ground) },
      skyline: { value: new THREE.Color(palette.skyline) },
      radiance: { value: palette.radiance },
      cloudColor: { value: new THREE.Color(palette.cloud) },
      coverage: { value: palette.coverage },
      cloudOpacity: { value: palette.opacity },
      sunIntensity: { value: lighting.sunIntensity },
      sunColor: { value: new THREE.Color(lighting.sunColor) },
      sunDirection: { value: new THREE.Vector3(...lighting.sunDirection) },
    },
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 nadir;
      uniform vec3 ground;
      uniform vec3 skyline;
      uniform float radiance;
      uniform vec3 cloudColor;
      uniform float coverage;
      uniform float cloudOpacity;
      uniform float sunIntensity;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;

      float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(cell), hash(cell + vec3(1, 0, 0)), f.x),
              mix(hash(cell + vec3(0, 1, 0)), hash(cell + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(cell + vec3(0, 0, 1)), hash(cell + vec3(1, 0, 1)), f.x),
              mix(hash(cell + vec3(0, 1, 1)), hash(cell + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 direction = normalize(skyDirection);
        float height = direction.y;
        vec3 color = mix(horizon, zenith, pow(max(height, 0.0), 0.55));
        // Ground: haze at the horizon fading to lawn/paving below, with broad
        // low-frequency patches so it reads as distance, not a flat fill.
        vec3 groundPoint = direction / max(0.04, -height);
        float patches = noise(vec3(groundPoint.x * 0.35, 0.0, groundPoint.z * 0.35)) * 0.6 + noise(vec3(groundPoint.x * 1.3, 3.1, groundPoint.z * 1.3)) * 0.4;
        vec3 land = ground * mix(0.82, 1.12, patches);
        color = mix(color, mix(nadir, land, smoothstep(0.0, 0.22, -height)), smoothstep(0.004, -0.004, height));
        // A distant skyline of trees and low roofs just above the horizon.
        vec3 ring = normalize(vec3(direction.x, 0.0, direction.z) + 1e-5);
        float profile = noise(ring * 7.0 + vec3(3.7, 1.3, 9.1)) * 0.65 + noise(ring * 23.0 + vec3(1.1, 7.7, 2.3)) * 0.35;
        float top = 0.012 + 0.05 * profile * profile;
        float silhouette = smoothstep(top + 0.004, top - 0.004, height) * smoothstep(-0.01, 0.0, height);
        color = mix(color, mix(skyline, horizon, 0.35), silhouette);
        // Direction-space noise stays continuous across cubemap boundaries.
        vec3 p = direction * vec3(5.0, 9.0, 5.0) + vec3(11.3, 4.7, 8.9);
        float clouds = noise(p) * 0.57 + noise(p * 2.07) * 0.28 + noise(p * 4.13) * 0.15;
        float cloudMask = smoothstep(coverage - 0.09, coverage + 0.2, clouds);
        cloudMask *= smoothstep(0.03, 0.2, height) * cloudOpacity;
        color = mix(color, cloudColor, cloudMask);
        // Broad, capped sunlight aligns with the scene key; no HDR disk that
        // blooms or creates distracting point reflections on polished floors.
        float sun = pow(max(dot(direction, sunDirection), 0.0), 24.0);
        // A fixed presentation scale bounds the broad glow; direction, color
        // and relative energy come from the same sun as the scene's shadows.
        color *= radiance;
        color += sunColor * sun * sunIntensity * 0.07 * (1.0 - cloudMask * 0.75);
        // Store scene-linear radiance. The main renderer applies tone mapping
        // and display color conversion once when sampling this background.
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

/** Local, lazy sky resources; no meshes are added to the editable apartment. */
export class SkyboxResources {
  private readonly cache = new Map<SkyCapture, CachedSkybox>();
  private disposed = false;

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  get(preset: SkyCapture, lighting = effectiveSunlight(DEFAULT_SUN)): SkyboxTextures {
    if (this.disposed) throw new Error('Skybox resources have been disposed');
    if (!Object.hasOwn(PALETTES, preset)) throw new Error('Unknown outdoor skybox');
    const cached = this.cache.get(preset);
    const key = JSON.stringify([lighting.sunDirection, lighting.sunColor, lighting.sunIntensity]);
    if (cached?.key === key) return cached.textures;

    const renderer = this.renderer;
    const previous = {
      target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(), autoClear: renderer.autoClear, xrEnabled: renderer.xr.enabled,
    };
    const background = new THREE.WebGLCubeRenderTarget(256, {
      type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: false, depthBuffer: false,
    });
    background.texture.name = `Skybox ${preset} background`;
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = makeSkyMaterial(preset, lighting);
    const capture = new THREE.Scene();
    capture.add(new THREE.Mesh(geometry, material));
    const generator = new THREE.PMREMGenerator(renderer);
    let environment: THREE.WebGLRenderTarget | undefined;
    try {
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      new THREE.CubeCamera(0.1, 10, background).update(renderer, capture);
      environment = generator.fromCubemap(background.texture);
      environment.texture.name = `Skybox ${preset} environment`;
      const textures = { background: background.texture, environment: environment.texture };
      // Keep at most one background/environment pair per preset, regardless of
      // how many slider values are previewed. Failed captures retain the old pair.
      this.cache.set(preset, { key, textures, background, environment });
      cached?.background.dispose(); cached?.environment.dispose();
      return textures;
    } catch (error) {
      background.dispose();
      environment?.dispose();
      throw error;
    } finally {
      geometry.dispose();
      material.dispose();
      generator.dispose();
      capture.clear();
      renderer.setRenderTarget(previous.target, previous.face, previous.mip);
      renderer.setViewport(previous.viewport);
      renderer.setScissor(previous.scissor);
      renderer.setScissorTest(previous.scissorTest);
      renderer.autoClear = previous.autoClear;
      renderer.xr.enabled = previous.xrEnabled;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { background, environment } of this.cache.values()) {
      background.dispose();
      environment.dispose();
    }
    this.cache.clear();
  }
}
