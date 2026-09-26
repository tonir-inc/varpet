import * as THREE from 'three';
import type { BuildingComponent, SceneDocument, ServiceSystem } from '../contracts';
import { componentPosition } from '../core/renovation';

export interface ServiceProjection {
  group: THREE.Group;
  entities: Map<string, THREE.Object3D>;
  components: Map<string, THREE.Group>;
  routes: Map<string, { group: THREE.Group; system: ServiceSystem }>;
  applyLighting(levels: ReadonlyMap<string, number>, automaticLevel?: number | null): void;
}
/** Interactive circuit state belongs to the preview, never to the saved project. */
export class LightingPreview {
  readonly levels = new Map<string, number>();
  private lastLevels = new Map<string, number>();
  private components = new Map<string, BuildingComponent>();
  private automaticLevel: number | null = null;

  /** Only the fallback follows the clock; explicit switch/dimmer choices win. */
  setAutomaticLevel(level: number | null): void {
    this.automaticLevel = level !== null && Number.isFinite(level) ? THREE.MathUtils.clamp(level, 0, 1) : null;
  }

  setComponents(components: BuildingComponent[]): void {
    const next = new Map(components.map(component => [component.id, component]));
    for (const id of this.levels.keys()) if (!next.has(id)) { this.levels.delete(id); this.lastLevels.delete(id); }
    for (const id of this.lastLevels.keys()) if (!next.has(id)) this.lastLevels.delete(id);
    for (const component of components) {
      const previous = this.components.get(component.id);
      if (previous?.kind !== component.kind || previous?.light?.enabled !== component.light?.enabled) {
        this.levels.delete(component.id); this.lastLevels.delete(component.id);
      }
    }
    this.components = next;
  }
  private targets(id: string): BuildingComponent[] {
    const control = this.components.get(id);
    if (control?.phase === 'remove') return [];
    return (control?.control?.targets ?? []).map(target => this.components.get(target)).filter((component): component is BuildingComponent => component?.kind === 'light' && component.phase !== 'remove');
  }
  getSwitchLevel(id: string): number {
    return Math.max(0, ...this.targets(id).map(component => previewLightLevel(component, this.levels, this.automaticLevel)));
  }
  setSwitchLevel(id: string, level: number): void {
    if (!Number.isFinite(level)) return;
    const next = THREE.MathUtils.clamp(level, 0, 1);
    for (const component of this.targets(id)) {
      const previous = previewLightLevel(component, this.levels, this.automaticLevel);
      if (next > 0) this.lastLevels.set(component.id, next);
      else if (previous > 0) this.lastLevels.set(component.id, previous);
      this.levels.set(component.id, next);
    }
  }
  toggleSwitch(id: string): void {
    const targets = this.targets(id); const on = targets.some(component => previewLightLevel(component, this.levels, this.automaticLevel) > 0);
    for (const component of targets) {
      const previous = previewLightLevel(component, this.levels, this.automaticLevel);
      if (on) { if (previous > 0) this.lastLevels.set(component.id, previous); this.levels.set(component.id, 0); }
      else this.levels.set(component.id, this.lastLevels.get(component.id) ?? 1);
    }
  }
}

function previewLightLevel(component: BuildingComponent, levels: ReadonlyMap<string, number>, automaticLevel: number | null = null): number {
  if (component.kind !== 'light' || component.phase === 'remove') return 0;
  const level = levels.get(component.id) ?? (component.light?.enabled === false ? 0 : automaticLevel ?? 1);
  return Number.isFinite(level) ? THREE.MathUtils.clamp(level, 0, 1) : 0;
}

const colors: Record<ServiceSystem, string> = { electrical: '#db9b34', 'water-hot': '#d75c50', 'water-cold': '#3b8acc', waste: '#797287', ventilation: '#77a69f', heating: '#d98249', gas: '#cec451', data: '#9b7abc' };

function box(parent: THREE.Object3D, x: number, y: number, z: number, px: number, py: number, pz: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(x, 0.005), Math.max(y, 0.005), Math.max(z, 0.005)), material);
  mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, radius: number, height: number, position: THREE.Vector3, material: THREE.Material, radiusTop = radius): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radius, Math.max(height, 0.005), 18), material); mesh.position.copy(position); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function sphere(parent: THREE.Object3D, radius: number, position: THREE.Vector3, scale: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 12), material); mesh.position.copy(position); mesh.scale.copy(scale); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function segment(parent: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): void {
  const delta = end.clone().sub(start); const length = delta.length(); if (length < 0.0001) return;
  const mesh = cylinder(parent, radius, length, start.clone().lerp(end, 0.5), material); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.divideScalar(length));
}
function kelvinColor(kelvin: number): THREE.Color {
  const t = THREE.MathUtils.clamp((kelvin - 2200) / 4300, 0, 1); return new THREE.Color('#ffd18c').lerp(new THREE.Color('#e9f3ff'), t);
}
function makeComponent(component: BuildingComponent): THREE.Group {
  const group = new THREE.Group(); group.userData.entityId = component.id;
  const [w, h, d] = component.dimensions;
  const material = new THREE.MeshStandardMaterial({ color: component.color, roughness: 0.68 });
  const ceramic = new THREE.MeshStandardMaterial({ color: '#f0f0e8', roughness: 0.22 });
  const metal = new THREE.MeshStandardMaterial({ color: '#8b9394', metalness: 0.7, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#3e4850', roughness: 0.74 });
  const glass = new THREE.MeshStandardMaterial({ color: '#b5d2d3', roughness: 0.15, transparent: true, opacity: 0.28, depthWrite: false });
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  switch (component.kind) {
    case 'light': {
      const emission = new THREE.MeshStandardMaterial({ color: '#fff7df', roughness: 0.4, emissive: kelvinColor(component.light?.temperature ?? 3000), emissiveIntensity: component.phase === 'remove' || component.light?.enabled === false ? 0 : 1 });
      box(group, w, h * 0.55, d, 0, h * 0.72, 0, material);
      box(group, w * 0.85, h * 0.12, d * 0.85, 0, h * 0.42, 0, emission);
      const light = new THREE.PointLight(kelvinColor(component.light?.temperature ?? 3000), component.phase === 'remove' || component.light?.enabled === false ? 0 : (component.light?.brightness ?? 800) / 50, 9, 2);
      light.position.set(0, -0.08, 0); group.add(light); group.userData.light = light; group.userData.emission = emission;
      break;
    }
    case 'switch': case 'thermostat': case 'outlet': case 'network': case 'security': case 'gas-point': {
      box(group, w, h, d * 0.35, 0, h / 2, 0, ceramic);
      if (component.kind === 'switch') {
        const gangs = Math.max(1, Math.min(4, component.control?.gangs ?? 1)); const toggles: THREE.Group[] = [];
        for (let i = 0; i < gangs; i++) { const rocker = new THREE.Group(); rocker.position.set(-w / 2 + w / gangs * (i + 0.5), h / 2, d * 0.3); box(rocker, w / gangs * 0.78, h * 0.73, d * 0.5, 0, 0, 0, material); group.add(rocker); toggles.push(rocker); }
        group.userData.toggles = toggles;
      } else if (component.kind === 'outlet' || component.kind === 'network') {
        for (const x of [-1, 1]) sphere(group, Math.min(w, h) * 0.085, v(x * w * 0.17, h * 0.55, d * 0.3), v(1, 1, 0.3), dark);
      } else if (component.kind === 'gas-point') cylinder(group, w * 0.22, h * 0.75, v(0, h * 0.5, d * 0.4), metal);
      else box(group, w * 0.66, h * 0.58, 0.008, 0, h * 0.57, d * 0.3, dark);
      break;
    }
    case 'panel': case 'access-panel': case 'junction': {
      box(group, w, h, d, 0, h / 2, 0, material);
      box(group, w * 0.84, h * 0.85, 0.012, 0, h / 2, d / 2 + 0.008, ceramic);
      if (component.kind === 'panel') for (let i = 0; i < 4; i++) box(group, w * 0.1, h * 0.15, 0.024, (i - 1.5) * w * 0.16, h * 0.62, d / 2 + 0.023, dark);
      break;
    }
    case 'sink': {
      box(group, w, h * 0.85, d * 0.86, 0, h * 0.425, 0, material);
      box(group, w, h * 0.12, d, 0, h * 0.94, 0, ceramic);
      sphere(group, 1, v(0, h + 0.002, 0), v(w * 0.34, 0.015, d * 0.30), dark);
      segment(group, v(0, h, -d * 0.35), v(0, h + 0.18, -d * 0.35), 0.016, metal);
      segment(group, v(0, h + 0.18, -d * 0.35), v(0, h + 0.18, -d * 0.04), 0.016, metal);
      break;
    }
    case 'toilet': {
      box(group, w * 0.8, h * 0.75, d * 0.3, 0, h * 0.6, -d * 0.3, ceramic);
      cylinder(group, w * 0.25, h * 0.35, v(0, h * 0.175, d * 0.14), ceramic);
      sphere(group, 1, v(0, h * 0.43, d * 0.12), v(w * 0.5, h * 0.21, d * 0.43), ceramic);
      sphere(group, 1, v(0, h * 0.58, d * 0.15), v(w * 0.3, h * 0.02, d * 0.27), dark);
      break;
    }
    case 'bath': {
      box(group, w, h, d, 0, h / 2, 0, ceramic);
      box(group, w * 0.81, 0.014, d * 0.76, 0, h + 0.009, 0, new THREE.MeshStandardMaterial({ color: '#aebfc2', roughness: 0.32 }));
      break;
    }
    case 'shower': {
      box(group, w, 0.07, d, 0, 0.035, 0, ceramic);
      box(group, 0.018, h, d, -w / 2, h / 2, 0, glass); box(group, w, h, 0.018, 0, h / 2, -d / 2, glass);
      segment(group, v(w * 0.35, 0.4, -d * 0.45), v(w * 0.35, h * 0.9, -d * 0.45), 0.014, metal);
      cylinder(group, 0.12, 0.024, v(w * 0.35, h * 0.9, -d * 0.3), metal);
      break;
    }
    case 'drain': case 'vent': {
      box(group, w, h, d, 0, h / 2, 0, metal);
      for (let i = 0; i < 6; i++) {
        if (component.kind === 'drain') box(group, w * 0.82, 0.006, d * 0.06, 0, h + 0.004, (i - 2.5) * d / 7, dark);
        else box(group, w * 0.82, h * 0.06, 0.006, 0, h * (i + 1) / 7, d / 2 + 0.004, dark);
      }
      break;
    }
    case 'radiator': {
      for (let i = 0; i < Math.max(3, Math.round(w / 0.1)); i++) { const count = Math.max(3, Math.round(w / 0.1)); box(group, w / count * 0.76, h, d, -w / 2 + w / count * (i + 0.5), h / 2, 0, material); }
      break;
    }
    case 'ac': {
      box(group, w, h, d, 0, h / 2, 0, ceramic);
      for (let i = 0; i < 4; i++) box(group, w * 0.84, h * 0.035, 0.012, 0, h * (0.2 + i * 0.095), d / 2 + 0.002, dark);
      break;
    }
    case 'cabinet': case 'appliance': {
      box(group, w, h, d, 0, h / 2, 0, material);
      if (component.kind === 'cabinet') {
        box(group, 0.008, h * 0.98, 0.012, 0, h / 2, d / 2 + 0.004, dark);
        for (const side of [-1, 1]) box(group, 0.015, h * 0.15, 0.04, side * w * 0.06, h * 0.65, d / 2 + 0.03, metal);
      } else {
        box(group, w * 0.82, h * 0.62, 0.016, 0, h * 0.45, d / 2 + 0.008, dark);
        box(group, w * 0.65, 0.025, 0.07, 0, h * 0.79, d / 2 + 0.03, metal);
      }
      break;
    }
    case 'railing': {
      for (let i = 0; i <= Math.max(2, Math.round(w / 0.15)); i++) { const count = Math.max(2, Math.round(w / 0.15)); cylinder(group, 0.018, h, v(-w / 2 + w / count * i, h / 2, 0), material); }
      segment(group, v(-w / 2, h, 0), v(w / 2, h, 0), 0.035, material); break;
    }
    case 'riser': case 'valve': {
      cylinder(group, Math.min(w, d) / 2, h, v(0, h / 2, 0), material);
      if (component.kind === 'valve') segment(group, v(-w, h * 0.65, d / 2), v(w, h * 0.65, d / 2), 0.027, new THREE.MeshStandardMaterial({ color: '#ae483b' }));
      break;
    }
    case 'smoke-detector': cylinder(group, w / 2, h, v(0, h / 2, 0), ceramic); break;
    case 'shaft': {
      box(group, w, h, d, 0, h / 2, 0, material);
      box(group, w * 0.55, h * 0.22, 0.015, 0, h * 0.45, d / 2 + 0.01, metal); break;
    }
    default: box(group, w, h, d, 0, h / 2, 0, material);
  }
  if (component.clearance) {
    const clearance = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...component.clearance)), new THREE.LineDashedMaterial({ color: '#ca933c', dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: 0.8 }));
    clearance.position.set(0, component.clearance[1] / 2, (d + component.clearance[2]) / 2); clearance.computeLineDistances(); clearance.visible = false; group.add(clearance); group.userData.clearance = clearance;
  }
  return group;
}

export function makeServices(document: SceneDocument): ServiceProjection {
  const group = new THREE.Group(); const entities = new Map<string, THREE.Object3D>(); const components = new Map<string, THREE.Group>(); const routes = new Map<string, { group: THREE.Group; system: ServiceSystem }>();
  for (const component of document.project?.components ?? []) {
    const assignment = document.project?.finishes.find(item => item.entityId === component.id && item.surface === 'component');
    const color = document.project?.materials.find(material => material.id === assignment?.materialId)?.color ?? component.color;
    const projection = makeComponent({ ...component, color }); projection.name = component.name; projection.position.fromArray(componentPosition(document, component)); projection.rotation.y = component.rotation;
    if (component.host) {
      const host = component.host; const wall = document.walls.find(item => item.id === host.wallId);
      if (wall) {
        const dx = wall.end[0] - wall.start[0]; const dz = wall.end[1] - wall.start[1];
        projection.rotation.y = -Math.atan2(dz, dx) + (host.side === -1 ? Math.PI : 0) + component.rotation;
      }
    }
    if (component.phase === 'remove') projection.traverse(object => { if (object instanceof THREE.Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const mat of materials) { mat.transparent = true; mat.opacity = 0.3; } } });
    group.add(projection); entities.set(component.id, projection); components.set(component.id, projection);
  }
  for (const route of document.project?.routes ?? []) {
    const projection = new THREE.Group(); projection.name = route.name; projection.userData.entityId = route.id;
    const material = new THREE.MeshStandardMaterial({ color: colors[route.system], roughness: 0.6, transparent: route.phase === 'remove', opacity: route.phase === 'remove' ? 0.3 : 1 });
    const radius = Math.max(route.diameter / 2, 0.018);
    route.points.forEach((point, index) => { const position = new THREE.Vector3(...point); if (index) segment(projection, new THREE.Vector3(...route.points[index - 1]!), position, radius, material); sphere(projection, radius * 1.12, position, new THREE.Vector3(1, 1, 1), material); });
    group.add(projection); entities.set(route.id, projection); routes.set(route.id, { group: projection, system: route.system });
  }
  return {
    group, entities, components, routes,
    applyLighting(levels, automaticLevel = null) {
      for (const component of document.project?.components ?? []) {
        const projection = components.get(component.id); if (!projection) continue;
        if (component.kind === 'light') {
          const level = previewLightLevel(component, levels, automaticLevel);
          const light = projection.userData.light as THREE.PointLight | undefined; if (light) light.intensity = level * (component.light?.brightness ?? 800) / 50;
          const emission = projection.userData.emission as THREE.MeshStandardMaterial | undefined; if (emission) emission.emissiveIntensity = level;
        }
        if (component.control) {
          const on = component.phase !== 'remove' && component.control.targets.some(id => { const target = document.project?.components.find(item => item.id === id); return target ? previewLightLevel(target, levels, automaticLevel) > 0 : false; });
          for (const rocker of (projection.userData.toggles ?? []) as THREE.Group[]) rocker.rotation.x = on ? 0.13 : -0.13;
        }
      }
    },
  };
}
