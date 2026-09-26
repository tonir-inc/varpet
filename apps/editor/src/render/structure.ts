import * as THREE from 'three';
import type { Room, SceneDocument, Wall, WallMode } from '../contracts';

export interface StructureProjection {
  group: THREE.Group;
  bounds: THREE.Box3;
  updateWalls(camera: THREE.Camera, mode: WallMode, top: boolean): void;
}

function floorShape(room: Room): THREE.Shape {
  const shape = new THREE.Shape();
  room.polygon.forEach(([x, z], i) => { if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); });
  shape.closePath();
  return shape;
}

/** Clip parallel floor joints against each polygon so nonrectangular rooms remain valid. */
function floorJoints(room: Room, spacing: number): THREE.LineSegments {
  const zs = room.polygon.map(p => p[1]);
  const min = Math.min(...zs); const max = Math.max(...zs);
  const points: number[] = [];
  for (let z = Math.ceil(min / spacing) * spacing; z < max - 0.001; z += spacing) {
    const crossings: number[] = [];
    for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i]!; const b = room.polygon[(i + 1) % room.polygon.length]!;
      if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z)) crossings.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = crossings[i]!; const right = crossings[i + 1]!;
      points.push(left, 0.001, z, right, 0.001, z);
    }
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
    new THREE.LineBasicMaterial({ color: '#827863', transparent: true, opacity: 0.095, depthWrite: false }));
  return lines;
}

function wallGeometry(wall: Wall, height: number, detail: boolean): THREE.Group {
  const group = new THREE.Group();
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  group.position.set(wall.start[0], 0, wall.start[1]);
  group.rotation.y = -Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
  const plaster = new THREE.MeshStandardMaterial({ color: wall.color, roughness: 0.94 });
  const trim = new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.65 });
  const box = (start: number, end: number, bottom: number, top: number, depth: number, material = plaster, z = 0) => {
    if (end - start <= 0.001 || top - bottom <= 0.001) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(end - start, top - bottom, depth), material);
    mesh.position.set((start + end) / 2, (bottom + top) / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  };
  const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const opening of openings) {
    const left = Math.max(0, opening.offset); const right = Math.min(length, left + opening.width);
    box(cursor, left, 0, height, wall.thickness);
    box(left, right, 0, Math.min(opening.sill, height), wall.thickness);
    box(left, right, opening.sill + opening.height, height, wall.thickness);
    if (detail) {
      const frame = 0.045; const lower = opening.sill; const upper = Math.min(height, lower + opening.height);
      if (upper > lower) {
        box(left, left + frame, lower, upper, wall.thickness + 0.015, trim);
        box(right - frame, right, lower, upper, wall.thickness + 0.015, trim);
        box(left, right, upper - frame, upper, wall.thickness + 0.015, trim);
        if (opening.kind === 'window') {
          box(left, right, lower, lower + frame, wall.thickness + 0.13, trim);
          box((left + right) / 2 - frame / 3, (left + right) / 2 + frame / 3, lower, upper, wall.thickness * 0.6, trim);
          const glass = new THREE.MeshStandardMaterial({ color: '#b2ccd1', roughness: 0.13, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
          box(left + frame, right - frame, lower + frame, upper - frame, 0.012, glass);
        } else {
          const hinge = new THREE.Group();
          hinge.position.set(left + frame, lower, wall.thickness / 2); hinge.rotation.y = -Math.PI / 3;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(right - left - frame * 2, upper - lower - frame, 0.035), trim);
          leaf.position.set((right - left - frame * 2) / 2, (upper - lower - frame) / 2, 0);
          leaf.castShadow = true; leaf.receiveShadow = true; hinge.add(leaf); group.add(hinge);
        }
      }
    }
    cursor = Math.max(cursor, right);
  }
  box(cursor, length, 0, height, wall.thickness);
  // A fine skirting board separates plaster from the floor.
  cursor = 0;
  for (const opening of openings.filter(o => o.sill === 0)) {
    for (const z of [-1, 1]) box(cursor, opening.offset, 0, Math.min(0.075, height), 0.015, trim, z * (wall.thickness / 2 + 0.005));
    cursor = opening.offset + opening.width;
  }
  for (const z of [-1, 1]) box(cursor, length, 0, Math.min(0.075, height), 0.015, trim, z * (wall.thickness / 2 + 0.005));
  return group;
}

export function makeStructure(document: SceneDocument): StructureProjection {
  const group = new THREE.Group();
  const bounds = new THREE.Box3();
  for (const room of document.rooms) {
    if (room.polygon.length < 3) continue;
    room.polygon.forEach(([x, z]) => bounds.expandByPoint(new THREE.Vector3(x, 0, z)));
    const geometry = new THREE.ExtrudeGeometry(floorShape(room), { depth: 0.14, bevelEnabled: false });
    const floor = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.84 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.14;
    floor.receiveShadow = true; floor.castShadow = true; group.add(floor);
    group.add(floorJoints(room, /bath|kitchen/i.test(room.name) ? 0.6 : 0.23));
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 0, 3));
  const center = bounds.getCenter(new THREE.Vector3());
  const walls = document.walls.map(wall => {
    bounds.expandByPoint(new THREE.Vector3(wall.start[0], wall.height, wall.start[1]));
    bounds.expandByPoint(new THREE.Vector3(wall.end[0], wall.height, wall.end[1]));
    const full = wallGeometry(wall, wall.height, true);
    const low = wallGeometry(wall, Math.min(0.32, wall.height), false);
    group.add(full, low);
    return { full, low, midpoint: new THREE.Vector3((wall.start[0] + wall.end[0]) / 2, 0, (wall.start[1] + wall.end[1]) / 2) };
  });
  const direction = new THREE.Vector3(); const radial = new THREE.Vector3();
  return {
    group, bounds,
    updateWalls(camera, mode, top) {
      direction.copy(camera.position).sub(center).setY(0).normalize();
      for (const wall of walls) {
        radial.copy(wall.midpoint).sub(center).setY(0);
        const cut = top || radial.dot(direction) > -0.25;
        wall.full.visible = mode === 'full' || (mode === 'cutaway' && !cut);
        wall.low.visible = mode === 'cutaway' && cut;
      }
    },
  };
}
