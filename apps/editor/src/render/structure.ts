import { roomCeilingHeight } from '../core/heights';
import * as THREE from 'three';
import type { EntityMetadata, Opening, Room, SceneDocument, Wall, WallMode } from '../contracts';
import { wallSurfaceSpans, type WallSurfaceSpan } from '../core/wall-surfaces';
import { resolveWallFinishTargets } from '../core/wall-finish-targets';
import { dimension3d, label3d } from './annotations';
import { disposeObject } from './assets';
import { finishAppearance, makeFinishMaterial, type FinishMaterialProjection, type FinishReveal } from './finish-material';
import { MOTION, setProjectionOpacity } from './motion';

export type { FinishReveal } from './finish-material';

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
  updateFinishes(now: number): boolean;
  updateWalls(camera: THREE.Camera, mode: WallMode, top: boolean, now?: number, reduced?: boolean, selectedOpeningId?: string): boolean;
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

function wallGeometry(wall: Wall, height: number, elevation: number, spans: WallSurfaceSpan[], front: THREE.Material | undefined, back: THREE.Material | undefined): THREE.Group {
  const group = new THREE.Group();
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const plaster = new THREE.MeshStandardMaterial({ color: '#999999', roughness: 0.94 });
  const trim = new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.65 });
  const box = (start: number, end: number, bottom: number, top: number, depth: number, skirting = false, z = 0) => {
    if (end - start <= 0.001 || top - bottom <= 0.001) return;
    for (const span of spans) {
      const left = Math.max(start, span.start); const right = Math.min(end, span.end);
      if (right - left <= 0.001 || (skirting && !(z > 0 ? span.front : span.back))) continue;
      const mesh = meshBox(group, [right - left, top - bottom, depth], [(left + right) / 2, elevation + (bottom + top) / 2, z], skirting ? trim : plaster);
      if (!skirting) {
        mesh.material = [plaster, plaster, plaster, plaster, span.front ? front! : plaster, span.back ? back! : plaster];
        mesh.userData.finishEntityId = wall.id;
        mesh.userData.finishSurfaces = { ...(span.front ? { 4: 'wall-front' } : {}), ...(span.back ? { 5: 'wall-back' } : {}) };
      }
    }
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
  const leafMaterial = opening.kind === 'window'
    ? new THREE.MeshPhysicalMaterial({ color: '#f2f7f8', roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8, transparent: true, opacity: 0.45, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: metadata.role === 'entrance' ? '#8c7460' : '#ddd6c7', roughness: 0.7 });
  if (opening.kind === 'window') {
    // Thin architectural glass: clear face-on, more reflective at grazing angles.
    // Retain authored opacity so wall fades keep their existing material contract.
    leafMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float glassFacing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
        diffuseColor.a *= mix(0.16, 1.0, pow(1.0 - glassFacing, 5.0));
        #include <opaque_fragment>
      `);
    };
    leafMaterial.customProgramCacheKey = () => 'varpet-thin-window-glass-v1';
  }
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
    // Alpha blending does not make shadow maps transparent. Frames still cast.
    if (opening.kind === 'window') { leaf.castShadow = false; leaf.receiveShadow = false; }
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

export function makeStructure(document: SceneDocument, reveal?: FinishReveal): StructureProjection {
  const group = new THREE.Group(); const ceilings = new THREE.Group(); const dimensions = new THREE.Group();
  const entities = new Map<string, THREE.Object3D>(); const openings = new Map<string, OpeningProjection>();
  const refreshOpeningWalls = new Map<string, () => void>();
  const animatedFinishes = new Set<FinishMaterialProjection>();
  const trackFinish = (finish: FinishMaterialProjection): THREE.MeshStandardMaterial => {
    animatedFinishes.add(finish);
    finish.material.addEventListener('dispose', () => animatedFinishes.delete(finish));
    return finish.material;
  };
  const bounds = new THREE.Box3(); const metadata = document.project?.metadata ?? {};
  // A structural split does not split the visible painted face. Every member
  // measures the same spreading wave from the original world-space drop.
  const wallReveal = (() => {
    if (!reveal || reveal.surface === 'floor') return undefined;
    const seed = document.walls.find(wall => wall.id === reveal.entityId);
    if (!seed) return undefined;
    const targets = new Map(resolveWallFinishTargets(document, seed.id, reveal.surface).map(target => [target.entityId, target.surface]));
    const axis = new THREE.Vector3(seed.end[0] - seed.start[0], 0, seed.end[1] - seed.start[1]).normalize();
    let radius = 0;
    for (const wall of document.walls) {
      if (!targets.has(wall.id)) continue;
      const elevation = metadata[wall.id]?.elevation ?? 0;
      for (const [x, z] of [wall.start, wall.end]) for (const y of [elevation, elevation + wall.height]) {
        radius = Math.max(radius, Math.hypot((x - reveal.point[0]) * axis.x + (z - reveal.point[2]) * axis.z, y - reveal.point[1]));
      }
    }
    return { targets, radius };
  })();
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
    // ExtrudeGeometry shares one material for both caps. Only its upward cap
    // is a room finish; the underside and vertical edge are exposed structure.
    const normals = geometry.getAttribute('normal');
    geometry.clearGroups();
    let groupStart = 0; let materialIndex = normals.getZ(0) > 0.5 ? 0 : 1;
    for (let i = 3; i <= normals.count; i += 3) {
      const next = i < normals.count ? (normals.getZ(i) > 0.5 ? 0 : 1) : -1;
      if (next !== materialIndex) { geometry.addGroup(groupStart, i - groupStart, materialIndex); groupStart = i; materialIndex = next; }
    }
    const jointSpacing = /bath|kitchen/i.test(room.name) ? 0.6 : 0.23;
    const appearance = finishAppearance(document, room.id, 'floor', room.color, jointSpacing);
    const previousRoom = reveal?.previousScene.rooms.find(item => item.id === room.id);
    const transition = reveal?.entityId === room.id && reveal.surface === 'floor' ? {
      reveal,
      previous: finishAppearance(reveal.previousScene, room.id, 'floor', previousRoom?.color ?? room.color, /bath|kitchen/i.test(previousRoom?.name ?? room.name) ? 0.6 : 0.23),
      radius: Math.max(...room.polygon.map(([x, z]) => Math.hypot(x - reveal.point[0], z - reveal.point[2]))),
    } : undefined;
    const floorMaterial = trackFinish(makeFinishMaterial(appearance, { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) }, transition));
    const floor = new THREE.Mesh(geometry, [floorMaterial, new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.94 })]);
    floor.userData.finishEntityId = room.id; floor.userData.finishSurfaces = { 0: 'floor' };
    floor.rotation.x = -Math.PI / 2; floor.position.y = elevation - 0.14; floor.receiveShadow = true; floor.castShadow = true; roomGroup.add(floor);
    if (!['balcony', 'terrace'].includes(meta.zone ?? 'interior')) {
      const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(floorShape(room)), new THREE.MeshStandardMaterial({ color: finishColor(room.id, 'ceiling', '#f1eee6'), roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }));
      ceiling.rotation.x = -Math.PI / 2; ceiling.position.y = elevation + roomCeilingHeight(document, room); ceiling.userData.entityId = room.id; ceilings.add(ceiling);
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
    const wallAxis = new THREE.Vector3(wall.end[0] - wall.start[0], 0, wall.end[1] - wall.start[1]).normalize();
    const spans = wallSurfaceSpans(wall, document.rooms, metadata);
    const makeWallFinish = (surface: 'wall-front' | 'wall-back') => {
      const appearance = finishAppearance(document, wall.id, surface, wall.color);
      const previousWall = reveal?.previousScene.walls.find(item => item.id === wall.id);
      const transition = reveal && wallReveal && wallReveal.targets.get(wall.id) === surface ? {
        reveal,
        previous: finishAppearance(reveal.previousScene, wall.id, surface, previousWall?.color ?? wall.color),
        radius: wallReveal.radius,
      } : undefined;
      return trackFinish(makeFinishMaterial(appearance, { u: wallAxis, v: new THREE.Vector3(0, 1, 0) }, transition));
    };
    const makeWallProjection = (source: Wall, height: number) => {
      const projection = wallGeometry(source, height, elevation, spans,
        spans.some(span => span.front) ? makeWallFinish('wall-front') : undefined,
        spans.some(span => span.back) ? makeWallFinish('wall-back') : undefined);
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
    return { full, low, openingGroup, normal: new THREE.Vector3(-wallAxis.z, 0, wallAxis.x),
      midpoint: new THREE.Vector3((wall.start[0] + wall.end[0]) / 2, 0, (wall.start[1] + wall.end[1]) / 2),
      alpha: [1, 0, 1], from: [1, 0, 1], target: [1, 0, 1], started: 0, initialized: false, cut: false };
  });
  const direction = new THREE.Vector3(); const radial = new THREE.Vector3(); ceilings.visible = false; dimensions.visible = false;
  return {
    group, bounds, entities, openings, ceilings, dimensions,
    updateFinishes(now) {
      let active = false;
      for (const finish of animatedFinishes) {
        if (finish.update(now)) active = true;
        else animatedFinishes.delete(finish);
      }
      return active;
    },
    previewOpeningOffset(id, offset) {
      const opening = openings.get(id); const refreshWall = refreshOpeningWalls.get(id);
      if (!opening || !refreshWall || !Number.isFinite(offset) || opening.group.position.x === offset) return;
      opening.group.position.x = offset; refreshWall();
    },
    updateWalls(camera, mode, top, now = performance.now(), reduced = false, selectedOpeningId) {
      let active = false;
      direction.copy(camera.position).sub(center).setY(0).normalize();
      for (const wall of walls) {
        radial.copy(wall.midpoint).sub(center).setY(0);
        // Keep nearly edge-on walls: their midpoint alone does not tell us
        // whether they face across the view. Angular hysteresis is independent
        // of wall length, apartment scale and endpoint ordering.
        const threshold = wall.initialized ? (wall.cut ? -0.33 : -0.17) : -0.25;
        const facingThreshold = wall.initialized ? (wall.cut ? 0.22 : 0.30) : 0.26;
        wall.cut = top || (radial.dot(direction) > threshold && Math.abs(wall.normal.dot(direction)) > facingThreshold);
        // Openings follow their cut wall; reveal its frames again while an
        // opening is selected so inspection and direct manipulation stay clear.
        const editingOpening = selectedOpeningId !== undefined && wall.openingGroup.children.some(opening => opening.userData.entityId === selectedOpeningId);
        const target = [Number(mode === 'full' || (mode === 'cutaway' && !wall.cut)), Number(mode === 'cutaway' && wall.cut),
          Number(mode === 'full' || (mode === 'cutaway' && (top || !wall.cut || editingOpening)))];
        const t = Math.min(1, Math.max(0, (now - wall.started) / MOTION.wall));
        const eased = 1 - (1 - t) ** 3;
        wall.alpha = wall.from.map((value, i) => value + (wall.target[i]! - value) * eased);
        if (!wall.initialized || reduced) {
          wall.alpha = [...target]; wall.from = [...target]; wall.target = target; wall.started = now - MOTION.wall;
        } else if (target.some((value, i) => value !== wall.target[i])) {
          wall.from = [...wall.alpha]; wall.target = target; wall.started = now;
        }
        wall.initialized = true;
        for (const [i, projection] of [wall.full, wall.low, wall.openingGroup].entries()) {
          setProjectionOpacity(projection, wall.alpha[i]!);
          if (wall.alpha[i] !== wall.target[i]) active = true;
        }
      }
      return active;
    },
  };
}
