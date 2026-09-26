import * as THREE from 'three';
import type { EntityMetadata, Opening, Room, SceneDocument, Wall, WallMode } from '../contracts';
import { dimension3d, label3d } from './annotations';
import { disposeObject } from './assets';

export interface OpeningProjection {
  group: THREE.Group;
  leaves: THREE.Mesh[];
  angle: number;
  target: number;
  fixed: boolean;
  setAngle(angle: number): void;
  setCollision(collision: boolean): void;
}
export interface StructureProjection {
  group: THREE.Group;
  bounds: THREE.Box3;
  entities: Map<string, THREE.Object3D>;
  openings: Map<string, OpeningProjection>;
  ceilings: THREE.Group;
  dimensions: THREE.Group;
  previewOpeningOffset(id: string, offset: number): void;
  updateWalls(camera: THREE.Camera, mode: WallMode, top: boolean): void;
}

function floorShape(room: Room): THREE.Shape {
  const shape = new THREE.Shape();
  room.polygon.forEach(([x, z], i) => { if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); });
  shape.closePath(); return shape;
}
function meshBox(parent: THREE.Object3D, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

/** Clip floor joints against each polygon so concave/nonrectangular rooms remain valid. */
function floorJoints(room: Room, spacing: number, elevation: number): THREE.LineSegments {
  const zs = room.polygon.map(p => p[1]); const points: number[] = [];
  for (let z = Math.ceil(Math.min(...zs) / spacing) * spacing; z < Math.max(...zs) - 0.001; z += spacing) {
    const crossings: number[] = [];
    for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i]!; const b = room.polygon[(i + 1) % room.polygon.length]!;
      if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z)) crossings.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) points.push(crossings[i]!, elevation + 0.002, z, crossings[i + 1]!, elevation + 0.002, z);
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
    new THREE.LineBasicMaterial({ color: '#827863', transparent: true, opacity: 0.095, depthWrite: false }));
}
function wallGeometry(wall: Wall, height: number, elevation: number, color: string, backColor?: string): THREE.Group {
  const group = new THREE.Group();
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const plaster = new THREE.MeshStandardMaterial({ color, roughness: 0.94 });
  const back = backColor ? new THREE.MeshStandardMaterial({ color: backColor, roughness: 0.94 }) : plaster;
  const trim = new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.65 });
  const box = (start: number, end: number, bottom: number, top: number, depth: number, skirting = false, z = 0) => {
    if (end - start <= 0.001 || top - bottom <= 0.001) return;
    const mesh = meshBox(group, [end - start, top - bottom, depth], [(start + end) / 2, elevation + (bottom + top) / 2, z], skirting ? trim : plaster);
    if (!skirting && back !== plaster) mesh.material = [plaster, plaster, plaster, plaster, plaster, back];
  };
  let cursor = 0;
  const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
  for (const opening of openings) {
    const left = Math.max(0, opening.offset); const right = Math.min(length, left + opening.width);
    box(cursor, left, 0, height, wall.thickness);
    box(left, right, 0, Math.min(opening.sill, height), wall.thickness);
    box(left, right, opening.sill + opening.height, height, wall.thickness);
    cursor = Math.max(cursor, right);
  }
  box(cursor, length, 0, height, wall.thickness);
  cursor = 0;
  for (const opening of openings.filter(o => o.sill === 0)) {
    for (const z of [-1, 1]) box(cursor, opening.offset, 0, Math.min(0.075, height), 0.015, true, z * (wall.thickness / 2 + 0.005));
    cursor = opening.offset + opening.width;
  }
  for (const z of [-1, 1]) box(cursor, length, 0, Math.min(0.075, height), 0.015, true, z * (wall.thickness / 2 + 0.005));
  return group;
}
function makeOpening(wall: Wall, opening: Opening, metadata: EntityMetadata, elevation: number): OpeningProjection {
  const group = new THREE.Group(); group.userData.entityId = opening.id;
  group.position.set(opening.offset, opening.sill + elevation, 0);
  const frame = Math.min(metadata.frameWidth ?? 0.045, opening.width / 5, opening.height / 5);
  const width = Math.max(0.01, opening.width - frame * 2); const bottom = opening.kind === 'window' ? frame : Math.min(metadata.threshold ?? 0, opening.height / 4); const height = Math.max(0.01, opening.height - frame - bottom);
  const thickness = metadata.leafThickness ?? 0.035; const mechanism = metadata.mechanism ?? (opening.kind === 'door' ? 'hinged' : 'fixed');
  const fixed = mechanism === 'fixed'; const right = metadata.hinge === 'right'; const swing = metadata.swing ?? 1;
  const trim = new THREE.MeshStandardMaterial({ color: '#ece7db', roughness: 0.65 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: opening.kind === 'window' ? '#96bdc6' : metadata.role === 'entrance' ? '#8c7460' : '#ddd6c7', roughness: opening.kind === 'window' ? 0.15 : 0.7, transparent: opening.kind === 'window', opacity: opening.kind === 'window' ? 0.45 : 1, depthWrite: opening.kind !== 'window' });
  const metal = new THREE.MeshStandardMaterial({ color: '#727b7e', roughness: 0.32, metalness: 0.65 });
  meshBox(group, [frame, opening.height, wall.thickness + 0.02], [frame / 2, opening.height / 2, 0], trim);
  meshBox(group, [frame, opening.height, wall.thickness + 0.02], [opening.width - frame / 2, opening.height / 2, 0], trim);
  meshBox(group, [opening.width, frame, wall.thickness + 0.02], [opening.width / 2, opening.height - frame / 2, 0], trim);
  if (opening.kind === 'window' || metadata.threshold) meshBox(group, [opening.width, Math.max(frame, metadata.threshold ?? frame), wall.thickness + 0.08], [opening.width / 2, frame / 2, 0], trim);
  const moving: THREE.Group[] = []; const leaves: THREE.Mesh[] = [];
  const count = mechanism === 'double' ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const pivot = new THREE.Group(); const leafWidth = width / count;
    const isRight = count === 2 ? i === 1 : right;
    pivot.position.set(isRight ? opening.width - frame : frame, bottom, 0);
    const leaf = meshBox(pivot, [leafWidth, height, thickness], [(isRight ? -1 : 1) * leafWidth / 2, height / 2, 0], leafMaterial);
    leaves.push(leaf);
    if (opening.kind === 'door') meshBox(pivot, [0.13, 0.025, 0.08], [(isRight ? -1 : 1) * (leafWidth - 0.1), Math.min(1, height * 0.5), thickness / 2 + 0.03], metal);
    else {
      meshBox(pivot, [0.025, height, thickness + 0.01], [(isRight ? -1 : 1) * leafWidth * 0.5, height / 2, 0], trim);
      meshBox(pivot, [leafWidth, 0.025, thickness + 0.01], [(isRight ? -1 : 1) * leafWidth / 2, height * 0.5, 0], trim);
    }
    group.add(pivot); moving.push(pivot);
  }
  const envelope = new THREE.Group(); envelope.visible = false;
  const envelopeMaterial = new THREE.LineBasicMaterial({ color: '#5b8e94', transparent: true, opacity: 0.85, depthTest: false });
  if (!fixed && !['sliding', 'pocket', 'tilt'].includes(mechanism)) {
    for (let i = 0; i < count; i++) {
      const isRight = count === 2 ? i === 1 : right; const x = isRight ? opening.width - frame : frame; const radius = width / count;
      const points = [new THREE.Vector3(x, 0.02, 0)];
      for (let a = 0; a <= 32; a++) { const angle = Math.PI / 2 * a / 32; points.push(new THREE.Vector3(x + (isRight ? -1 : 1) * Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius * swing)); }
      points.push(new THREE.Vector3(x, 0.02, 0));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), envelopeMaterial); line.renderOrder = 650; envelope.add(line);
    }
  }
  group.add(envelope); group.userData.envelope = envelope;
  const warning = label3d('Swing envelope has an obstacle', '#9e302a', '#fff0ed'); warning.position.set(opening.width / 2, opening.height + 0.22, 0); warning.visible = false; group.add(warning);
  const projection: OpeningProjection = {
    group, leaves, angle: 0, target: 0, fixed,
    setAngle(value) {
      const angle = fixed ? 0 : THREE.MathUtils.clamp(value, 0, Math.PI / 2); projection.angle = angle;
      moving.forEach((pivot, i) => {
        const isRight = count === 2 ? i === 1 : right; const sign = isRight ? -1 : 1;
        pivot.rotation.set(0, 0, 0); pivot.position.x = isRight ? opening.width - frame : frame;
        if (mechanism === 'sliding' || mechanism === 'pocket') { pivot.position.x += sign * width * angle / (Math.PI / 2); pivot.position.z = wall.thickness / 2 + thickness; }
        else if (mechanism === 'tilt') pivot.rotation.x = angle * 0.33 * swing;
        else pivot.rotation.y = -angle * sign * swing;
      });
      group.updateMatrixWorld(true);
    },
    setCollision(collision) { warning.visible = collision; envelopeMaterial.color.set(collision ? '#c54337' : '#5b8e94'); },
  };
  return projection;
}

export function makeStructure(document: SceneDocument): StructureProjection {
  const group = new THREE.Group(); const ceilings = new THREE.Group(); const dimensions = new THREE.Group();
  const entities = new Map<string, THREE.Object3D>(); const openings = new Map<string, OpeningProjection>();
  const refreshOpeningWalls = new Map<string, () => void>();
  const bounds = new THREE.Box3(); const metadata = document.project?.metadata ?? {};
  const finishColor = (id: string, surface: string, fallback: string): string => {
    const assignment = document.project?.finishes.find(item => item.entityId === id && item.surface === surface);
    return document.project?.materials.find(material => material.id === assignment?.materialId)?.color ?? fallback;
  };
  for (const room of document.rooms) {
    if (room.polygon.length < 3) continue;
    const meta = metadata[room.id] ?? {}; const elevation = meta.elevation ?? 0;
    const roomGroup = new THREE.Group(); roomGroup.userData.entityId = room.id; group.add(roomGroup); entities.set(room.id, roomGroup);
    room.polygon.forEach(([x, z]) => bounds.expandByPoint(new THREE.Vector3(x, elevation, z)));
    const geometry = new THREE.ExtrudeGeometry(floorShape(room), { depth: 0.14, bevelEnabled: false });
    const floor = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: finishColor(room.id, 'floor', room.color), roughness: 0.84 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = elevation - 0.14; floor.receiveShadow = true; floor.castShadow = true; roomGroup.add(floor);
    roomGroup.add(floorJoints(room, /bath|kitchen/i.test(room.name) ? 0.6 : 0.23, elevation));
    if (!['balcony', 'terrace'].includes(meta.zone ?? 'interior')) {
      const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(floorShape(room)), new THREE.MeshStandardMaterial({ color: finishColor(room.id, 'ceiling', '#f1eee6'), roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }));
      ceiling.rotation.x = -Math.PI / 2; ceiling.position.y = elevation + (meta.ceilingHeight ?? 2.8); ceiling.userData.entityId = room.id; ceilings.add(ceiling);
    }
    const c = new THREE.Box3().setFromObject(floor).getCenter(new THREE.Vector3());
    const zone = meta.zone && meta.zone !== 'interior' ? ` · ${meta.zone}` : '';
    const label = label3d(`${room.name}${zone}${elevation ? ` · ${elevation > 0 ? '+' : ''}${elevation.toFixed(2)} m` : ''}`);
    label.position.set(c.x, elevation + 0.08, c.z); label.userData.entityId = room.id; dimensions.add(label);
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 0, 3));
  const center = bounds.getCenter(new THREE.Vector3());
  const walls = document.walls.map(wall => {
    const meta = metadata[wall.id] ?? {}; const elevation = meta.elevation ?? 0;
    bounds.expandByPoint(new THREE.Vector3(wall.start[0], wall.height + elevation, wall.start[1]));
    bounds.expandByPoint(new THREE.Vector3(wall.end[0], wall.height + elevation, wall.end[1]));
    const wallGroup = new THREE.Group(); wallGroup.userData.entityId = wall.id; entities.set(wall.id, wallGroup);
    wallGroup.position.set(wall.start[0], 0, wall.start[1]); wallGroup.rotation.y = -Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]); group.add(wallGroup);
    const color = finishColor(wall.id, 'wall-front', wall.color); const backColor = finishColor(wall.id, 'wall-back', wall.color);
    const makeWallProjection = (source: Wall, height: number) => {
      const projection = wallGeometry(source, height, elevation, color, backColor);
      if (meta.phase === 'remove') projection.traverse(object => { if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material.transparent = true; material.opacity = 0.25; } });
      return projection;
    };
    const full = makeWallProjection(wall, wall.height); const low = makeWallProjection(wall, Math.min(0.32, wall.height));
    const openingGroup = new THREE.Group(); wallGroup.add(full, low, openingGroup);
    const refreshWall = () => {
      const preview = { ...wall, openings: wall.openings.map(opening => ({ ...opening, offset: openings.get(opening.id)!.group.position.x })) };
      for (const [projection, height] of [[full, wall.height], [low, Math.min(0.32, wall.height)]] as const) {
        const replacement = makeWallProjection(preview, height);
        const obsolete = new THREE.Group(); obsolete.add(...projection.children);
        projection.add(...replacement.children); disposeObject(obsolete);
      }
      wallGroup.updateMatrixWorld(true);
    };
    for (const opening of wall.openings) {
      const projection = makeOpening(wall, opening, metadata[opening.id] ?? {}, elevation); openings.set(opening.id, projection);
      refreshOpeningWalls.set(opening.id, refreshWall);
      openingGroup.add(projection.group); entities.set(opening.id, projection.group);
    }
    dimensions.add(dimension3d(new THREE.Vector3(wall.start[0], elevation + 0.06, wall.start[1]), new THREE.Vector3(wall.end[0], elevation + 0.06, wall.end[1])));
    return { full, low, openingGroup, midpoint: new THREE.Vector3((wall.start[0] + wall.end[0]) / 2, 0, (wall.start[1] + wall.end[1]) / 2) };
  });
  const direction = new THREE.Vector3(); const radial = new THREE.Vector3(); ceilings.visible = false; dimensions.visible = false;
  return {
    group, bounds, entities, openings, ceilings, dimensions,
    previewOpeningOffset(id, offset) {
      const opening = openings.get(id); const refreshWall = refreshOpeningWalls.get(id);
      if (!opening || !refreshWall || !Number.isFinite(offset) || opening.group.position.x === offset) return;
      opening.group.position.x = offset; refreshWall();
    },
    updateWalls(camera, mode, top) {
      direction.copy(camera.position).sub(center).setY(0).normalize();
      for (const wall of walls) {
        radial.copy(wall.midpoint).sub(center).setY(0); const cut = top || radial.dot(direction) > -0.25;
        wall.full.visible = mode === 'full' || (mode === 'cutaway' && !cut); wall.low.visible = mode === 'cutaway' && cut;
        wall.openingGroup.visible = mode !== 'hidden';
      }
    },
  };
}
