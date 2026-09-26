import * as THREE from 'three';
import { SelectionSurfaceGeometries } from './selection-surfaces';
import { wallPrismGeometry } from './wall-geometry';

let checks = 0;
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  checks++;
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
function area(geometry: THREE.BufferGeometry): number {
  const positions = geometry.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    total += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return total;
}
function plane(geometry: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', coordinate: number) {
  const position = geometry.getAttribute('position');
  return position.count > 0 && Array.from({ length: position.count }, (_, i) =>
    near(axis === 'x' ? position.getX(i) : axis === 'y' ? position.getY(i) : position.getZ(i), coordinate)).every(Boolean);
}
const cache = new SelectionSurfaceGeometries();
const camera = new THREE.PerspectiveCamera(); camera.position.set(2, 2, 5);
const shape = new THREE.Shape();
shape.moveTo(0, 0); shape.lineTo(4, 0); shape.lineTo(4, 1); shape.lineTo(1, 1); shape.lineTo(1, 4); shape.lineTo(0, 4); shape.closePath();
const floor = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.14;
const originalFloor = JSON.stringify(floor.geometry.toJSON());
const floorMask = cache.get(floor, 'floor', camera);
check(plane(floorMask, 'z', .14) && near(area(floorMask), 7), 'Concave floor selection contains exactly the upper surface, without slab sides or underside');
check(floorMask.groups.every(group => group.materialIndex === 0), 'Floor extraction preserves cap material groups');
check(cache.get(floor, 'floor', camera) === floorMask, 'Repeated requests reuse floor mask geometry');
check(originalFloor === JSON.stringify(floor.geometry.toJSON()), 'Floor extraction leaves source geometry unchanged');
camera.position.set(2, -1, 2);
const hiddenFloor = cache.get(floor, 'floor', camera);
check(hiddenFloor.getAttribute('position').count === 0, 'Perspective view below a floor cannot outline its invisible upper cap');
check(cache.get(floor, 'floor', camera) === hiddenFloor, 'Suppressed surfaces reuse cached empty geometry');
const floorOrtho = new THREE.OrthographicCamera(); floorOrtho.position.set(2, 8, 2); floorOrtho.lookAt(2, 12, 2);
check(cache.get(floor, 'floor', floorOrtho) === hiddenFloor, 'Orthographic upward view suppresses the floor cap regardless of camera position');
floorOrtho.lookAt(2, 0, 2);
check(cache.get(floor, 'floor', floorOrtho) === floorMask, 'Orthographic Top keeps the visible floor cap');

const wall = new THREE.Mesh(wallPrismGeometry([[0, -.1], [4, -.1], [4, .1], [0, .1]], 0, 2.7));
wall.position.set(6, 1, 8); wall.rotation.y = Math.PI / 2;
wall.updateWorldMatrix(true, false);
camera.position.copy(new THREE.Vector3(2, 1, 4).applyMatrix4(wall.matrixWorld));
const front = cache.get(wall, 'wall', camera);
check(plane(front, 'z', .1) && near(area(front), 10.8) && front.groups.every(group => group.materialIndex === 4), 'Translated and rotated wall selects its visible front without caps and ends');
camera.position.copy(new THREE.Vector3(2, 1, -4).applyMatrix4(wall.matrixWorld));
const back = cache.get(wall, 'wall', camera);
check(plane(back, 'z', -.1) && back.groups.every(group => group.materialIndex === 5), 'Orbiting around the wall selects the opposite surface');
check(front !== back && cache.get(wall, 'wall', camera) === back, 'Both wall sides have separate reusable masks');
const ortho = new THREE.OrthographicCamera();
ortho.position.copy(new THREE.Vector3(2, 1, -4).applyMatrix4(wall.matrixWorld));
ortho.lookAt(new THREE.Vector3(2, 1, -8).applyMatrix4(wall.matrixWorld));
check(cache.get(wall, 'wall', ortho) === front, 'Orthographic surface choice follows view direction rather than camera position');
ortho.position.copy(new THREE.Vector3(2, 8, 0).applyMatrix4(wall.matrixWorld));
ortho.lookAt(new THREE.Vector3(2, 0, 0).applyMatrix4(wall.matrixWorld));
const wallTop = cache.get(wall, 'wall', ortho);
check(plane(wallTop, 'y', 2.7) && near(area(wallTop), .8) && wallTop.groups.every(group => group.materialIndex === 2), 'Top view highlights the visible wall cap rather than an edge-on vertical face');
camera.position.copy(ortho.position); camera.lookAt(new THREE.Vector3(2, 0, 0).applyMatrix4(wall.matrixWorld));
check(cache.get(wall, 'wall', camera) === wallTop, 'Near-vertical perspective view above the wall reuses the cap mask');
camera.position.copy(new THREE.Vector3(2, 1, 0).applyMatrix4(wall.matrixWorld));
check(cache.get(wall, 'wall', camera) !== wallTop, 'Perspective camera below the wall cap cannot select its invisible upper face');

const ceiling = new THREE.Mesh(new THREE.BoxGeometry(4, .2, 3));
const ceilingSource = JSON.stringify(ceiling.geometry.toJSON());
camera.position.set(0, -2, 0);
const ceilingMask = cache.get(ceiling, 'ceiling', camera);
check(plane(ceilingMask, 'y', -.1) && near(area(ceilingMask), 12), 'Indexed ceiling boxes select only the underside');
check(ceilingMask.groups.every(group => group.materialIndex === 3), 'Ceiling box underside retains its source material index');
check(JSON.stringify(ceiling.geometry.toJSON()) === ceilingSource, 'Indexed ceiling source remains unchanged');
camera.position.set(0, 2, 0);
const hiddenCeiling = cache.get(ceiling, 'ceiling', camera);
check(hiddenCeiling.getAttribute('position').count === 0, 'Perspective view above a ceiling does not reveal an invisible roof outline');
const ceilingOrtho = new THREE.OrthographicCamera(); ceilingOrtho.position.set(0, -2, 0); ceilingOrtho.lookAt(0, -5, 0);
check(cache.get(ceiling, 'ceiling', ceilingOrtho) === hiddenCeiling, 'Orthographic downward view suppresses the ceiling underside regardless of camera position');
ceilingOrtho.lookAt(0, 5, 0);
check(cache.get(ceiling, 'ceiling', ceilingOrtho) === ceilingMask, 'Orthographic upward view restores the visible ceiling underside');
const flat = new THREE.BufferGeometry();
flat.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 4, 0, 0, 0, 0, 3], 3));
const flatCeiling = new THREE.Mesh(flat);
camera.position.set(0, -2, 0);
check(near(area(cache.get(flatCeiling, 'ceiling', camera)), 6), 'Ungrouped flat ceilings retain their downward winding');

let floorDisposed = 0, wallDisposed = 0, ceilingDisposed = 0;
floorMask.addEventListener('dispose', () => floorDisposed++);
for (const geometry of [front, back, wallTop]) geometry.addEventListener('dispose', () => wallDisposed++);
ceilingMask.addEventListener('dispose', () => ceilingDisposed++);
floor.geometry.dispose();
check(floorDisposed === 1, 'Source disposal immediately releases its cached surface');
cache.dispose();
check(wallDisposed === 3 && ceilingDisposed === 1 && floorDisposed === 1, 'Cache disposal releases remaining masks exactly once');
cache.dispose(); wall.geometry.dispose(); ceiling.geometry.dispose(); flat.dispose();
check(wallDisposed === 3 && ceilingDisposed === 1, 'Disposal removes source listeners and remains idempotent');
console.log(`Selection surface checks passed: ${checks} assertions.`);
