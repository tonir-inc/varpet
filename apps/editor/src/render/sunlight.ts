import * as THREE from 'three';

/** Temporary viewport preview; north is the scene's -Z axis, not a surveyed bearing. */
export interface SunSettings { enabled: boolean; azimuth: number; elevation: number; intensity: number }
export const DEFAULT_SUN: Readonly<SunSettings> = { enabled: true, azimuth: 225, elevation: 35, intensity: 100 };
export function normalizeSun(patch: Partial<SunSettings>, previous: SunSettings): SunSettings {
  const finite = (value: number | undefined, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const azimuth = finite(patch.azimuth, previous.azimuth);
  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : previous.enabled,
    azimuth: ((azimuth % 360) + 360) % 360,
    elevation: THREE.MathUtils.clamp(finite(patch.elevation, previous.elevation), 5, 85),
    intensity: THREE.MathUtils.clamp(finite(patch.intensity, previous.intensity), 0, 200),
  };
}
/** Unit vector from the apartment toward the sun. */
export function sunDirection(settings: SunSettings): THREE.Vector3 {
  const azimuth = THREE.MathUtils.degToRad(settings.azimuth), elevation = THREE.MathUtils.degToRad(settings.elevation);
  return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
}
export interface SunLighting {
  readonly sunDirection: readonly [number, number, number];
  readonly sunColor: string;
  readonly sunIntensity: number;
}
/** Shared by the visible sky and the direct light; weather presets never replace
 * the person's manual solar settings. Evening temporarily suppresses both suns. */
export function effectiveSunlight(settings: SunSettings, evening = false): SunLighting {
  return {
    sunDirection: sunDirection(settings).toArray(),
    sunColor: settings.elevation < 20 ? '#ffd09b' : '#fff1db',
    sunIntensity: settings.enabled && !evening ? 3.2 * settings.intensity / 100 : 0,
  };
}
/** Fit in light space so long or off-origin apartments retain their shadows at every angle. */
export function fitSunShadow(light: THREE.DirectionalLight, bounds: THREE.Box3, settings: SunSettings): void {
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const distance = bounds.getSize(new THREE.Vector3()).length() + 5;
  light.target.position.copy(center);
  light.position.copy(center).addScaledVector(sunDirection(settings), distance);
  light.updateMatrixWorld(true); light.target.updateMatrixWorld(true);
  const camera = light.shadow.camera;
  camera.position.copy(light.position); camera.lookAt(center); camera.updateMatrixWorld(true);
  const lightBounds = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    lightBounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  }
  const padding = 0.5;
  Object.assign(camera, { left: lightBounds.min.x - padding, right: lightBounds.max.x + padding,
    bottom: lightBounds.min.y - padding, top: lightBounds.max.y + padding,
    near: Math.max(.1, -lightBounds.max.z - padding), far: -lightBounds.min.z + padding });
  camera.updateProjectionMatrix(); light.shadow.needsUpdate = true;
}
