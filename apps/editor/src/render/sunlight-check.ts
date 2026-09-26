import * as THREE from 'three';
import { DEFAULT_SUN, normalizeSun, sunDirection, fitSunShadow } from './sunlight';
let count = 0;
function check(ok: unknown, message: string): void { if (!ok) throw new Error(message); count++; }
const east = sunDirection({ ...DEFAULT_SUN, azimuth: 90, elevation: 30 });
check(Math.abs(east.x - Math.sqrt(3) / 2) < 1e-8 && Math.abs(east.y - .5) < 1e-8 && Math.abs(east.z) < 1e-8, 'East sun comes from +X at the requested altitude');
check(sunDirection({ ...DEFAULT_SUN, azimuth: 0 }).z < 0, 'North sun comes from -Z');
check(sunDirection({ ...DEFAULT_SUN, azimuth: 180 }).z > 0, 'South sun comes from +Z');
check(sunDirection({ ...DEFAULT_SUN, azimuth: 270 }).x < 0, 'West sun comes from -X');
const safe = normalizeSun({ azimuth: -90, elevation: 100, intensity: -10 }, DEFAULT_SUN);
check(safe.azimuth === 270 && safe.elevation === 85 && safe.intensity === 0, 'Angles wrap and user ranges clamp');
check(normalizeSun({ elevation: NaN, intensity: Infinity }, DEFAULT_SUN).elevation === DEFAULT_SUN.elevation, 'Invalid numeric inputs retain last valid setting');
const light = new THREE.DirectionalLight();
for (const offset of [0, 500]) for (const angle of [0, 90, 180, 270]) for (const elevation of [5, 35, 85]) {
  const box = new THREE.Box3(new THREE.Vector3(offset - 9, 0, -2), new THREE.Vector3(offset + 12, 4, 15));
  fitSunShadow(light, box, { ...DEFAULT_SUN, azimuth: angle, elevation });
  light.shadow.updateMatrices(light);
  const expected = sunDirection({ ...DEFAULT_SUN, azimuth: angle, elevation });
  check(light.position.clone().sub(light.target.position).normalize().distanceTo(expected) < 1e-8, 'Sun orientation survives off-origin bounds fitting');
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x,y,z).project(light.shadow.camera);
    check(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1, 'Every shell corner fits in the shadow camera at every angle');
  }
}
console.log(`Sunlight checks passed (${count} assertions).`);
