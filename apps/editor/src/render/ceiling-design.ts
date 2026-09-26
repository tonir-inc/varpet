import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CeilingDesign, SceneDocument } from '../contracts';
import { layoutCeilingDesign, type CeilingElement, type CeilingLayout } from '../core/ceiling-design';

const LIGHT_BUDGET = 8;
// WebGL2 guarantees sixteen fragment samplers. The current finish shader uses
// four, environment/DFG use two, area lights use two, and sun/windows use five.
// Reserve the remaining three for ceiling shadows, independently of illumination.
const SHADOW_BUDGET = 3;
let areaLightsInitialized = false;
interface LightSource { element: CeilingElement; layout: CeilingLayout; group: THREE.Group; emission: THREE.MeshStandardMaterial }

function ceilingLightColor(temperature: number): THREE.Color {
  return new THREE.Color('#ffbd76').lerp(new THREE.Color('#e9f3ff'), THREE.MathUtils.clamp((temperature - 2200) / 4300, 0, 1));
}

/** Bounded room-local reflected light, including dropped plaster panels. */
export function applyCeilingIndirectLight(material: THREE.MeshStandardMaterial, design?: CeilingDesign | null): void {
  // Real-time downlights have no bounce. Use the finish's albedo so this
  // approximation needs no extra lights and cannot leak through room walls.
  material.emissiveIntensity = design?.enabled ? .22 * design.brightness / 100 : 0;
  if (design) material.emissive.copy(material.color).multiply(ceilingLightColor(design.temperature));
}

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}

function makeEmission(layout: CeilingLayout): THREE.MeshStandardMaterial {
  const level = layout.design.enabled ? layout.design.brightness / 100 : 0;
  const emission = new THREE.MeshStandardMaterial({ color: '#f5eee0', roughness: 0.4, emissive: ceilingLightColor(layout.design.temperature), emissiveIntensity: level * 3 });
  emission.userData.ceilingEmitter = true;
  return emission;
}

function makeElement(element: CeilingElement, layout: CeilingLayout): { group: THREE.Group; emission?: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  group.name = `${layout.style} · ${element.kind}`;
  group.userData.ceilingElement = element.kind;
  group.position.set(...element.position); group.rotation.y = element.rotation;
  const [width, height, depth] = element.dimensions;
  if (element.kind === 'panel') {
    const plaster = new THREE.MeshStandardMaterial({ color: '#eeeae2', roughness: 0.93 });
    applyCeilingIndirectLight(plaster, layout.design);
    const reveal = Math.min(.02, width / 10, depth / 10), revealHeight = .008;
    // An inset plaster face and physical edge diffusers keep the floating panel
    // legible from below, where its concealed upper cove is naturally occluded.
    addMesh(group, new RoundedBoxGeometry(width, height - .012, depth, 2, .004), plaster, .012 + (height - .012) / 2);
    addMesh(group, new RoundedBoxGeometry(width - reveal * 2 - .005, .012, depth - reveal * 2 - .005, 2, .003), plaster, .006);
    const emission = makeEmission(layout);
    for (const side of [-1, 1]) {
      const horizontal = addMesh(group, new THREE.BoxGeometry(width, revealHeight, reveal), emission, revealHeight / 2);
      horizontal.position.z = side * (depth - reveal) / 2; horizontal.castShadow = false;
      const vertical = addMesh(group, new THREE.BoxGeometry(reveal, revealHeight, depth - reveal * 2), emission, revealHeight / 2);
      vertical.position.x = side * (width - reveal) / 2; vertical.castShadow = false;
    }
    return { group, emission };
  }
  if (element.kind === 'track') {
    const metal = new THREE.MeshStandardMaterial({ color: '#252629', roughness: 0.43, metalness: 0.38 });
    addMesh(group, new RoundedBoxGeometry(width, height, depth, 2, Math.min(0.003, height / 4, depth / 4)), metal, height / 2);
    return { group };
  }

  const emission = makeEmission(layout);
  if (element.kind === 'spot') {
    const radius = Math.min(width, depth) / 2;
    const trim = new THREE.MeshStandardMaterial({ color: '#292725', roughness: 0.4, metalness: 0.5 });
    addMesh(group, new THREE.CylinderGeometry(radius, radius, height, 32, 1, true), trim, height / 2);
    const rim = addMesh(group, new THREE.RingGeometry(radius * 0.85, radius, 32), trim, 0);
    rim.rotation.x = Math.PI / 2;
    const reflector = new THREE.MeshStandardMaterial({ color: '#8f8980', roughness: 0.3, metalness: 0.68, side: THREE.DoubleSide });
    const ring = addMesh(group, new THREE.RingGeometry(radius * 0.64, radius * 0.85, 32), reflector, 0.001);
    ring.rotation.x = Math.PI / 2; ring.castShadow = false;
    const diffuser = addMesh(group, new THREE.CircleGeometry(radius * 0.64, 32), emission, 0.0005);
    diffuser.rotation.x = Math.PI / 2; diffuser.castShadow = false;
  } else {
    const aluminum = new THREE.MeshStandardMaterial({ color: layout.style === 'architectural' ? '#262729' : '#dbd4c7', roughness: 0.5, metalness: 0.35 });
    addMesh(group, new THREE.BoxGeometry(width, height, depth), aluminum, height / 2);
    // Cove diffusers face the ceiling; integrated linear lights face the room.
    const indirect = layout.style === 'soft-glow';
    const diffuser = addMesh(group, new THREE.PlaneGeometry(width * 0.97, depth * 0.72), emission, indirect ? height + 0.000001 : -0.000001);
    diffuser.rotation.x = indirect ? -Math.PI / 2 : Math.PI / 2; diffuser.castShadow = false;
  }
  return { group, emission };
}

function addLight(source: LightSource, castShadow: boolean): void {
  const { element, layout, group, emission } = source;
  const level = layout.design.brightness / 100;
  const color = ceilingLightColor(layout.design.temperature);
  if (element.kind === 'spot') {
    const light = new THREE.SpotLight(color, 65 * level, 9, 1.05, 0.7, 2);
    light.position.y = -0.006; light.target.position.y = -3;
    light.castShadow = castShadow; light.shadow.mapSize.set(256, 256);
    light.shadow.camera.near = 0.025; light.shadow.camera.far = 9;
    light.shadow.bias = -0.0001; light.shadow.normalBias = 0.008; light.shadow.radius = 2;
    // The normal projection disposal visits materials, including shadow resources
    // owned by that fixture; it does not require a second lifetime API.
    emission.addEventListener('dispose', () => light.shadow.dispose());
    light.name = `Ceiling downlight · ${layout.roomId}`; group.add(light, light.target);
  } else {
    if (!areaLightsInitialized) { RectAreaLightUniformsLib.init(); areaLightsInitialized = true; }
    const bounce = element.kind === 'panel';
    const indirect = layout.style === 'soft-glow' && !bounce;
    // Real-time area lights do not bounce. This broad, modest source previews
    // the cove's room fill; it is included in the same global source budget.
    const light = new THREE.RectAreaLight(color, (bounce ? 2.2 : indirect ? 70 : 110) * level, element.dimensions[0] * 0.97, element.dimensions[2] * (bounce ? .97 : .72));
    light.position.y = indirect ? element.dimensions[1] + 0.002 : -0.002;
    light.rotation.x = indirect ? Math.PI / 2 : -Math.PI / 2;
    if (bounce) light.userData.indirectApproximation = true;
    light.name = `${bounce ? 'Ceiling approximate bounce' : indirect ? 'Ceiling cove wash' : 'Ceiling linear light'} · ${layout.roomId}`;
    group.add(light);
  }
}

/** Disposable 3D projection. Brightness is a visual preview, not a lux estimate. */
export function makeCeilingDesigns(scene: SceneDocument, activeRoomId?: string): THREE.Group {
  const projection = new THREE.Group(); projection.name = 'Ceiling designs';
  const sourcesByRoom: LightSource[][] = [];
  for (const room of scene.rooms) {
    const layout = layoutCeilingDesign(scene, room);
    if (!layout) continue;
    const roomGroup = new THREE.Group();
    roomGroup.name = `ceiling-design:${room.id}`;
    roomGroup.userData.entityId = room.id; roomGroup.userData.ceilingDesign = true;
    roomGroup.userData.ceilingY = layout.ceilingY;
    const sources: LightSource[] = [];
    for (const element of layout.elements) {
      const visual = makeElement(element, layout); roomGroup.add(visual.group);
      if (visual.emission && layout.design.enabled && layout.design.brightness > 0) sources.push({ element, layout, group: visual.group, emission: visual.emission });
    }
    projection.add(roomGroup); sourcesByRoom.push(sources);
  }

  // Focused interiors get their complete lighting first. Otherwise distribute
  // sources across rooms before assigning a second source to any one room.
  const selected = sourcesByRoom.find(sources => sources[0]?.layout.roomId === activeRoomId) ?? [];
  const remaining = sourcesByRoom.filter(sources => sources !== selected);
  const ordered = [...selected];
  for (let index = 0; index < Math.max(0, ...remaining.map(sources => sources.length)); index++) {
    for (const sources of remaining) if (sources[index]) ordered.push(sources[index]!);
  }
  const illuminated = ordered.slice(0, LIGHT_BUDGET);
  const spots = illuminated.filter(source => source.element.kind === 'spot');
  const shadowed = new Set<LightSource>();
  for (const pool of [spots.filter(source => source.layout.roomId === activeRoomId), spots.filter(source => source.layout.roomId !== activeRoomId)]) {
    const count = Math.min(pool.length, SHADOW_BUDGET - shadowed.size);
    // Evenly sample the authored fixture order, spanning both ends of the room
    // instead of spending every shadow map on the first row of downlights.
    for (let index = 0; index < count; index++) {
      const position = count === 1 ? Math.floor((pool.length - 1) / 2) : Math.round(index * (pool.length - 1) / (count - 1));
      shadowed.add(pool[position]!);
    }
  }
  for (const source of illuminated) addLight(source, shadowed.has(source));
  return projection;
}

const ceilingCameraPosition = new THREE.Vector3();

/** Cut away fixtures from above with their ceiling, without turning off lights. */
export function updateCeilingDesignVisibility(projection: THREE.Group, camera: THREE.Camera): boolean {
  camera.getWorldPosition(ceilingCameraPosition);
  let changed = false;
  for (const room of projection.children) {
    const visible = ceilingCameraPosition.y < room.userData.ceilingY;
    room.traverse(object => {
      if (object instanceof THREE.Mesh && object.visible !== visible) {
        object.visible = visible; changed = true;
      }
    });
  }
  return changed;
}
