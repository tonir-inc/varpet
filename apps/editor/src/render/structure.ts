import { openingMechanism } from '../core/opening-catalog';
import { roomCeilingHeight } from '../core/heights';
import * as THREE from 'three';
import type { EntityMetadata, Opening, Room, SceneDocument, Wall, WallMode } from '../contracts';
import { wallSurfaceSpans, type WallSurfaceSpan } from '../core/wall-surfaces';
import { resolveWallFinishTargets } from '../core/wall-finish-targets';
import { dimension3d, label3d } from './annotations';
import { disposeObject } from './assets';
import { finishAppearance, makeFinishMaterial, type FinishMaterialProjection, type FinishReveal } from './finish-material';
import { MOTION, setProjectionOpacity } from './motion';
import { wallFootprint, wallPrismGeometry } from './wall-geometry';
import { applyCeilingIndirectLight } from './ceiling-design';
import { makeCeilingGeometry } from './ceiling-geometry';
import { previewOpeningMechanism, type OpeningAssetLoader, type OpeningAssetInstance } from './opening-assets';

export type { FinishReveal } from './finish-material';

export interface OpeningProjection {
  group: THREE.Group;
  leaves: THREE.Mesh[];
  angle: number;
  target: number;
  fixed: boolean;
  setAngle(angle: number): void;
  setCollision(collision: boolean): void;
  /** Called after a resize preview redraws the opening procedurally, so a catalog model can be drawn again. */
  rebuilt?(opening: Opening): void;
}
export interface OpeningRenderOptions { openingAssets: OpeningAssetLoader; onAssetReady(): void }
export interface StructureProjection {
  group: THREE.Group;
  bounds: THREE.Box3;
  entities: Map<string, THREE.Object3D>;
  openings: Map<string, OpeningProjection>;
  ceilings: THREE.Group;
  dimensions: THREE.Group;
  previewOpening(id: string, dimensions: Partial<Pick<Opening, 'offset' | 'sill' | 'width' | 'height'>>): void;
  previewOpeningOffset(id: string, offset: number): void;
  updateFinishes(now: number): boolean;
  updateWalls(camera: THREE.Camera, mode: WallMode, top: boolean, now?: number, reduced?: boolean, selectedOpeningId?: string): boolean;
}

function floorShape(room: Room): THREE.Shape {
  const shape = new THREE.Shape();
  room.polygon.forEach(([x, z], i) => { if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); });
  shape.closePath(); return shape;
}
function cameraOverRoom(camera: THREE.Camera, room: Room): boolean {
  const { x, z } = camera.position;
  let inside = false;
  for (let i = 0, j = room.polygon.length - 1; i < room.polygon.length; j = i++) {
    const a = room.polygon[i]!, b = room.polygon[j]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function cutawaySides(wall: Wall, rooms: Room[], metadata: Record<string, EntityMetadata>): { front: boolean; back: boolean } {
  const spans = wallSurfaceSpans(wall, rooms, metadata);
  const doors = wall.openings.filter(opening => opening.kind === 'door' && opening.sill === 0)
    .sort((a, b) => a.offset - b.offset);
  // A room floor can cross the wall plane at a doorway threshold. Only solid
  // wall spans identify the room-facing side; finish coverage still uses all floors.
  const solidSpans = spans.filter(span => {
    let cursor = span.start;
    for (const door of doors) {
      if (door.offset + door.width <= cursor) continue;
      if (Math.min(span.end, door.offset) - cursor > 1e-5) return true;
      cursor = Math.max(cursor, door.offset + door.width);
      if (cursor >= span.end - 1e-5) return false;
    }
    return span.end - cursor > 1e-5;
  });
  const front = solidSpans.some(span => span.front), back = solidSpans.some(span => span.back);
  // A full-width door can leave no solid sample. Retain an unambiguous floor
  // side if available, otherwise keep the wall at full height.
  return front || back ? { front, back } : { front: spans.some(span => span.front), back: spans.some(span => span.back) };
}
function meshBox(parent: THREE.Object3D, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function wallGeometry(wall: Wall, height: number, elevation: number, spans: WallSurfaceSpan[], front: THREE.Material | undefined, back: THREE.Material | undefined, walls: readonly Wall[], metadata: Record<string, EntityMetadata>): THREE.Group {
  const group = new THREE.Group();
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const plaster = new THREE.MeshStandardMaterial({ color: '#999999', roughness: 0.94 });
  const trim = new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.65 });
  // The cut top of a full-height wall reads as a section, as on an architect's drawing; sills keep plaster.
  const section = new THREE.MeshStandardMaterial({ color: '#3b403d', roughness: 0.9 });
  const footprint = wallFootprint(wall, walls, metadata);
  const innerTrim = wallFootprint(wall, walls, metadata, -0.0025), outerTrim = wallFootprint(wall, walls, metadata, 0.0125);
  const trimFront = [innerTrim[3]!, innerTrim[2]!, outerTrim[2]!, outerTrim[3]!];
  const trimBack = [outerTrim[0]!, outerTrim[1]!, innerTrim[1]!, innerTrim[0]!];
  // Pieces sharing a face assignment merge into one mesh per wall projection, and faces
  // sharing a material into one group: about a third of the draw calls, same pixels.
  const solids = new Map<string, { front: boolean; back: boolean; cut: boolean; geometries: THREE.BufferGeometry[] }>();
  const skirts: THREE.BufferGeometry[] = [];
  const box = (start: number, end: number, bottom: number, top: number, skirting = false, side = 1) => {
    if (end - start <= 0.001 || top - bottom <= 0.001) return;
    for (const span of spans) {
      const left = Math.max(start, span.start); const right = Math.min(end, span.end);
      if (right - left <= 0.001 || (skirting && !(side > 0 ? span.front : span.back))) continue;
      const geometry = wallPrismGeometry(skirting ? (side > 0 ? trimFront : trimBack) : footprint,
        elevation + bottom, elevation + top, left <= 1e-6 ? -Infinity : left, right >= length - 1e-6 ? Infinity : right);
      if (skirting) { skirts.push(geometry); continue; }
      const cut = top >= height - 1e-6, key = `${span.front}:${span.back}:${cut}`;
      const bucket = solids.get(key) ?? { front: span.front, back: span.back, cut, geometries: [] };
      bucket.geometries.push(geometry); solids.set(key, bucket);
    }
  };
  let cursor = 0;
  const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
  for (const opening of openings) {
    const left = Math.max(0, opening.offset); const right = Math.min(length, left + opening.width);
    box(cursor, left, 0, height);
    box(left, right, 0, Math.min(opening.sill, height));
    box(left, right, opening.sill + opening.height, height);
    cursor = Math.max(cursor, right);
  }
  box(cursor, length, 0, height);
  cursor = 0;
  for (const opening of openings.filter(o => o.sill === 0)) {
    for (const side of [-1, 1]) box(cursor, opening.offset, 0, Math.min(0.075, height), true, side);
    cursor = opening.offset + opening.width;
  }
  for (const side of [-1, 1]) box(cursor, length, 0, Math.min(0.075, height), true, side);
  for (const { front: hasFront, back: hasBack, cut, geometries } of solids.values()) {
    const materials = [plaster, plaster, cut ? section : plaster, plaster, hasFront ? front! : plaster, hasBack ? back! : plaster];
    const mesh = new THREE.Mesh(mergeByMaterial(geometries, materials), materials);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    mesh.userData.finishEntityId = wall.id;
    mesh.userData.finishSurfaces = { ...(hasFront ? { 4: 'wall-front' } : {}), ...(hasBack ? { 5: 'wall-back' } : {}) };
  }
  if (skirts.length) {
    const mesh = new THREE.Mesh(mergeByMaterial(skirts, [trim, trim, trim, trim, trim, trim]), trim);
    mesh.geometry.clearGroups(); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}
/** Concatenate non-indexed prisms, one group per distinct material (its first face index). */
function mergeByMaterial(geometries: THREE.BufferGeometry[], materials: THREE.Material[]): THREE.BufferGeometry {
  const buckets = new Map<THREE.Material, { index: number; position: number[]; normal: number[]; uv: number[] }>();
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    if (!position || !normal || !uv) continue;
    for (const group of geometry.groups) {
      const index = group.materialIndex ?? 0, material = materials[index]!;
      let bucket = buckets.get(material);
      if (!bucket) { bucket = { index: materials.indexOf(material), position: [], normal: [], uv: [] }; buckets.set(material, bucket); }
      for (let vertex = group.start; vertex < group.start + group.count; vertex++) {
        bucket.position.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
        bucket.normal.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
        bucket.uv.push(uv.getX(vertex), uv.getY(vertex));
      }
    }
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry(); const position: number[] = [], normal: number[] = [], uv: number[] = [];
  for (const bucket of buckets.values()) {
    merged.addGroup(position.length / 3, bucket.position.length / 3, bucket.index);
    position.push(...bucket.position); normal.push(...bucket.normal); uv.push(...bucket.uv);
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return merged;
}
export function makeOpening(wall: Wall, opening: Opening, metadata: EntityMetadata, elevation: number, previous?: OpeningProjection, options?: OpeningRenderOptions): OpeningProjection {
  // Selection and angle animation retain these identities across a drag preview.
  const group = previous?.group ?? new THREE.Group(); group.userData.entityId = opening.id;
  const angle = previous?.angle ?? 0, target = previous?.target ?? 0;
  const envelopeVisible = Boolean(group.userData.envelope?.visible);
  if (previous) { const obsolete = new THREE.Group(); obsolete.add(...group.children); disposeObject(obsolete); }
  group.position.set(opening.offset, opening.sill + elevation, 0);
  const frame = Math.min(metadata.frameWidth ?? 0.045, opening.width / 5, opening.height / 5);
  const width = Math.max(0.01, opening.width - frame * 2); const bottom = opening.kind === 'window' ? frame : Math.min(metadata.threshold ?? 0, opening.height / 4); const height = Math.max(0.01, opening.height - frame - bottom);
  const thickness = metadata.leafThickness ?? 0.035;
  const mechanism = opening.assetId ? openingMechanism(opening, metadata) : previewOpeningMechanism(opening, metadata);
  const fixed = mechanism === 'fixed'; const right = metadata.hinge === 'right'; const swing = metadata.swing ?? 1;
  const trim = new THREE.MeshStandardMaterial({ color: '#ece7db', roughness: 0.65 });
  const leafMaterial = opening.kind === 'window'
    ? new THREE.MeshPhysicalMaterial({ color: '#eef4f4', roughness: 0.05, metalness: 0, envMapIntensity: 0.15, transparent: true, opacity: 0.45, depthWrite: false })
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
  const metal = opening.kind === 'door' ? new THREE.MeshStandardMaterial({ color: '#727b7e', roughness: 0.32, metalness: 0.65 }) : undefined;
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
    if (opening.kind === 'door') meshBox(pivot, [0.13, 0.025, 0.08], [(isRight ? -1 : 1) * (leafWidth - 0.1), Math.min(1, height * 0.5), thickness / 2 + 0.03], metal!);
    else {
      meshBox(pivot, [0.025, height, thickness + 0.01], [(isRight ? -1 : 1) * leafWidth * 0.5, height / 2, 0], trim);
      meshBox(pivot, [leafWidth, 0.025, thickness + 0.01], [(isRight ? -1 : 1) * leafWidth / 2, height * 0.5, 0], trim);
    }
    group.add(pivot); moving.push(pivot);
  }
  const envelope = new THREE.Group(); envelope.visible = envelopeVisible;
  const envelopeMaterial = !fixed && !['sliding', 'pocket', 'tilt'].includes(mechanism)
    ? new THREE.LineBasicMaterial({ color: '#5b8e94', transparent: true, opacity: 0.85, depthTest: false }) : undefined;
  if (envelopeMaterial) {
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
  let asset: OpeningAssetInstance | undefined;
  const projection: OpeningProjection = previous ?? { group, leaves, angle, target, fixed, setAngle() {}, setCollision() {} };
  Object.assign(projection, {
    group, leaves, angle, target, fixed,
    setAngle(value: number) {
      const angle = fixed ? 0 : THREE.MathUtils.clamp(value, 0, Math.PI / 2); projection.angle = angle;
      moving.forEach((pivot, i) => {
        const isRight = count === 2 ? i === 1 : right; const sign = isRight ? -1 : 1;
        pivot.rotation.set(0, 0, 0); pivot.position.x = isRight ? opening.width - frame : frame;
        if (mechanism === 'sliding' || mechanism === 'pocket') { pivot.position.x += sign * width * angle / (Math.PI / 2); pivot.position.z = wall.thickness / 2 + thickness; }
        else if (mechanism === 'tilt') pivot.rotation.x = angle * 0.33 * swing;
        else pivot.rotation.y = -angle * sign * swing;
      });
      asset?.setAngle(angle);
      group.updateMatrixWorld(true);
    },
    setCollision(collision: boolean) { group.userData.openingCollision = collision; warning.visible = collision; envelopeMaterial?.color.set(collision ? '#c54337' : '#5b8e94'); },
  });
  projection.setAngle(angle); projection.setCollision(Boolean(group.userData.openingCollision));
  // Assigned catalog assets are installed by the viewport; unknown ids retain the procedural fallback.
  if (options && !opening.assetId) {
    // The first fallback mesh is disposed when a preview is rebuilt or its scene
    // goes away. Its lifetime also cancels a late network result.
    const fallback = group.children.filter(child => child !== envelope && child !== warning);
    let live = true;
    (fallback[0] as THREE.Mesh).geometry.addEventListener('dispose', () => { live = false; });
    void options.openingAssets.load(wall, opening, metadata).then(loaded => {
      if (!loaded) return;
      if (!live) { disposeObject(loaded.group); return; }
      const obsolete = new THREE.Group(); obsolete.add(...fallback); disposeObject(obsolete);
      asset = loaded; group.add(loaded.group); projection.leaves = loaded.leaves;
      group.userData.openingProduct = loaded.group.name;
      projection.setAngle(projection.angle);
      options.onAssetReady();
    }).catch(() => { /* The measured procedural opening remains usable offline. */ });
  }
  return projection;
}

export function makeStructure(document: SceneDocument, reveal?: FinishReveal, options?: OpeningRenderOptions): StructureProjection {
  const group = new THREE.Group(); const ceilings = new THREE.Group(); const dimensions = new THREE.Group();
  const entities = new Map<string, THREE.Object3D>(); const openings = new Map<string, OpeningProjection>();
  const openingPreviews = new Map<string, Opening>();
  const previewOpenings = new Map<string, (dimensions: Partial<Pick<Opening, 'offset' | 'sill' | 'width' | 'height'>>) => void>();
  const animatedFinishes = new Set<FinishMaterialProjection>();
  const trackFinish = (finish: FinishMaterialProjection): THREE.MeshStandardMaterial => {
    animatedFinishes.add(finish);
    finish.material.addEventListener('dispose', () => animatedFinishes.delete(finish));
    return finish.material;
  };
  const bounds = new THREE.Box3(); const metadata = document.project?.metadata ?? {};
  const activeRooms = document.rooms.filter(room => metadata[room.id]?.phase !== 'remove');
  const interiorRooms = activeRooms.filter(room => !['balcony', 'terrace', 'loggia'].includes(metadata[room.id]?.zone ?? 'interior'));
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
    const roomGroup = new THREE.Group(); roomGroup.userData.entityId = room.id; roomGroup.userData.selectionSurface = 'floor'; group.add(roomGroup); entities.set(room.id, roomGroup);
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
    if (meta.phase !== 'remove' && !['balcony', 'terrace'].includes(meta.zone ?? 'interior')) {
      // Face the room in both the color pass and the AO normal/depth pass.
      // The exterior face is naturally culled, including in Top view.
      const material = new THREE.MeshStandardMaterial({ color: finishColor(room.id, 'ceiling', '#f1eee6'), roughness: 0.9 });
      applyCeilingIndirectLight(material, meta.ceilingDesign);
      const ceiling = new THREE.Mesh(makeCeilingGeometry(document, room), material);
      ceiling.position.y = elevation + roomCeilingHeight(document, room);
      ceiling.receiveShadow = true; ceiling.userData.entityId = room.id; ceiling.userData.shellPart = 'ceiling'; ceiling.userData.selectionSurface = 'ceiling';
      // SunOccluders owns the intact roof's shadow geometry in every view.
      ceilings.add(ceiling);
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
    const wallGroup = new THREE.Group(); wallGroup.userData.entityId = wall.id; wallGroup.userData.selectionSurface = 'wall'; entities.set(wall.id, wallGroup);
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
        spans.some(span => span.back) ? makeWallFinish('wall-back') : undefined, document.walls, metadata);
      if (meta.phase === 'remove') projection.traverse(object => { if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material.transparent = true; material.opacity = 0.25; } });
      return projection;
    };
    const full = makeWallProjection(wall, wall.height); const low = makeWallProjection(wall, Math.min(0.32, wall.height));
    const openingGroup = new THREE.Group(); wallGroup.add(full, low, openingGroup);
    const refreshWall = () => {
      const preview = { ...wall, openings: wall.openings.map(opening => openingPreviews.get(opening.id) ?? opening) };
      for (const [index, [projection, height]] of ([[full, wall.height], [low, Math.min(0.32, wall.height)]] as const).entries()) {
        const replacement = makeWallProjection(preview, height);
        const obsolete = new THREE.Group(); obsolete.add(...projection.children);
        projection.add(...replacement.children); disposeObject(obsolete);
        setProjectionOpacity(projection, state.alpha[index]!);
      }
      setProjectionOpacity(openingGroup, state.alpha[2]!);
      wallGroup.updateMatrixWorld(true);
    };
    for (const opening of wall.openings) {
      const projection = makeOpening(wall, opening, metadata[opening.id] ?? {}, elevation, undefined, options); openings.set(opening.id, projection);
      openingPreviews.set(opening.id, { ...opening });
      previewOpenings.set(opening.id, dimensions => {
        const current = openingPreviews.get(opening.id)!;
        const next = { ...current };
        for (const key of ['offset', 'sill', 'width', 'height'] as const) {
          const value = dimensions[key];
          if (value === undefined) continue;
          if (!Number.isFinite(value) || value < 0 || (key === 'width' || key === 'height') && value === 0) return;
          next[key] = value;
        }
        if (next.offset === current.offset && next.sill === current.sill && next.width === current.width && next.height === current.height) return;
        openingPreviews.set(opening.id, next);
        if (next.width !== current.width || next.height !== current.height) {
          makeOpening(wall, next, metadata[opening.id] ?? {}, elevation, projection, options);
          projection.rebuilt?.(next);
        }
        else projection.group.position.set(next.offset, next.sill + elevation, 0);
        refreshWall();
      });
      openingGroup.add(projection.group); entities.set(opening.id, projection.group);
    }
    dimensions.add(dimension3d(new THREE.Vector3(wall.start[0], elevation + 0.06, wall.start[1]), new THREE.Vector3(wall.end[0], elevation + 0.06, wall.end[1])));
    // Outdoor floors and doorway thresholds do not make the enclosing facade
    // an interior partition. Incomplete traces still cannot override protected boundaries.
    let { front, back } = cutawaySides(wall, interiorRooms, metadata);
    // A balcony's own outer edge can have no indoor neighbor at all.
    if (!front && !back) ({ front, back } = cutawaySides(wall, activeRooms, metadata));
    const protectedBoundary = meta.boundary === 'interior' || meta.boundary === 'shared';
    const exterior = !protectedBoundary && front !== back;
    const outward = new THREE.Vector3(-wallAxis.z, 0, wallAxis.x).multiplyScalar(front ? -1 : 1);
    const state = { full, low, openingGroup, outward, exterior, thickness: wall.thickness,
      // Preserve the existing Top projection for standalone walls without rooms.
      topCut: exterior || (!document.rooms.length && !protectedBoundary),
      midpoint: new THREE.Vector3((wall.start[0] + wall.end[0]) / 2, 0, (wall.start[1] + wall.end[1]) / 2),
      alpha: [1, 0, 1], from: [1, 0, 1], target: [1, 0, 1], started: 0, initialized: false, cut: false };
    return state;
  });
  const direction = new THREE.Vector3(); const toCamera = new THREE.Vector3(); dimensions.visible = false;
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
    previewOpening(id, dimensions) { previewOpenings.get(id)?.(dimensions); },
    previewOpeningOffset(id, offset) { previewOpenings.get(id)?.({ offset }); },
    updateWalls(camera, mode, top, now = performance.now(), reduced = false, selectedOpeningId) {
      let active = false;
      const overRoom = !top && interiorRooms.some(room => cameraOverRoom(camera, room));
      // Zooming or panning a dollhouse view brings the camera over the footprint while it is still
      // above the walls: keep cutting the exterior walls on the camera's side, judged by where it looks.
      const aerial = overRoom && camera.position.y > bounds.max.y;
      const inside = overRoom && !aerial;
      if (aerial) camera.getWorldDirection(direction).negate().setY(0).normalize();
      else direction.copy(camera.position).sub(center).setY(0).normalize();
      for (const wall of walls) {
        toCamera.copy(camera.position).sub(wall.midpoint).setY(0);
        // The camera must be beyond the exterior face, not merely on the
        // near side of the apartment's bounding box. Keep angular hysteresis
        // so nearly edge-on perimeter walls do not flicker while orbiting.
        const facingThreshold = wall.initialized ? (wall.cut ? 0.22 : 0.30) : 0.26;
        wall.cut = top ? wall.topCut : !inside && wall.exterior && (aerial || toCamera.dot(wall.outward) > wall.thickness / 2)
          && wall.outward.dot(direction) > facingThreshold;
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
