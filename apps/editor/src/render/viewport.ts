import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BuildingComponent, CatalogAsset, ComponentTransformPatch, ObjectPatch, SceneDocument, SceneObject, ToolMode, ViewMode, Viewport, ViewportCallbacks, ViewportLayer, WallMode } from '../contracts';
import { AssetLoader, disposeObject, makeFurniture } from './assets';
import { makeStructure, type StructureProjection } from './structure';
import { LightingPreview, makeServices, type ServiceProjection } from './services';
import { label3d } from './annotations';
import { createWallMove } from './wall-move';
import { analyzeProject, componentPosition } from '../core/renovation';
import { findOpeningMove, constrainOpeningOffset, type OpeningMoveContext } from '../core/opening-move';
import { SelectionFrame, resizeTransformControls, styleTransformControls } from './selection-style';
import { StudioStage } from './studio-stage';

interface RenderObject { group: THREE.Group; signature: string; token: object }
interface DragSnapshot { component?: BuildingComponent; id: string; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
interface OpeningDrag {
  context: OpeningMoveContext;
  axis: THREE.Vector3;
  plane: THREE.Plane;
  startAlong: number;
  offset: number;
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
}

// Euler XYZ folds Y past 90 degrees into X/Z turns; read heading from the basis instead.
const upAxis = new THREE.Vector3(0, 1, 0);
function yawOf(quaternion: THREE.Quaternion): number {
  const { x, y, z, w } = quaternion;
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
}

export function createViewport(container: HTMLElement, callbacks: ViewportCallbacks): Viewport {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    callbacks.onError('This browser could not create a WebGL viewport. Enable hardware acceleration and reload.');
    const message = document.createElement('p');
    message.textContent = '3D view unavailable. Enable browser hardware acceleration and reload.';
    message.style.cssText = 'margin:auto;padding:2rem;color:#6a5849;max-width:28rem;text-align:center';
    container.append(message);
    return { setScene() {}, setSelection() {}, setTool() {}, setView() {}, setSnap() {}, setWalls() {}, setQuality() {}, setLayer() {}, setDoorAngle() {}, getDoorAngle() { return 0; }, toggleSwitch() {}, setSwitchLevel() {}, getSwitchLevel() { return 0; }, setComparison() {}, focus() {}, cancelInteraction() {}, dispose() { message.remove(); } };
  }
  renderer.setClearColor('#171d25');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D apartment. Click rooms, walls, openings, furniture, or building services to select. Choose Move to drag a selected door or window along its wall. In Select, click a selected door or switch again to test it. Drag empty space to orbit, right drag to pan, and scroll to zoom.');
  container.appendChild(renderer.domElement);

  const world = new THREE.Scene();
  world.background = new THREE.Color('#171d25');
  const studioFog = new THREE.Fog('#171d25', 40, 125);
  world.fog = studioFog;
  const perspective = new THREE.PerspectiveCamera(34, 1, 0.05, 250);
  perspective.position.set(11, 12, 15);
  const orthographic = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.05, 250);
  orthographic.up.set(0, 0, -1);
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
  const orbit = new OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera>(camera, renderer.domElement);
  orbit.enableDamping = false;
  orbit.minDistance = 1;
  orbit.maxDistance = 65;
  orbit.minPolarAngle = 0.05;
  orbit.maxPolarAngle = Math.PI / 2 - 0.05;
  orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  orbit.screenSpacePanning = true;
  orbit.target.set(0, 0, 0);
  orbit.update();

  const transform = new TransformControls(camera, renderer.domElement);
  styleTransformControls(transform);
  transform.setSpace('world');
  transform.setTranslationSnap(0.25);
  transform.setRotationSnap(Math.PI / 12);
  transform.setScaleSnap(0.1);
  transform.minY = 0; transform.maxY = 0;
  const transformHelper = transform.getHelper();
  world.add(transformHelper);

  const lighting = new THREE.Group();
  const ambient = new THREE.HemisphereLight('#cbdcf4', '#88745c', 0.5);
  lighting.add(ambient);
  const sunlight = new THREE.DirectionalLight('#ffdfad', 3.5);
  sunlight.position.set(-7, 10, 7);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.near = 0.5;
  sunlight.shadow.camera.far = 65;
  sunlight.shadow.bias = -0.00025;
  sunlight.shadow.normalBias = 0.025;
  sunlight.shadow.radius = 5;
  lighting.add(sunlight, sunlight.target);
  const fill = new THREE.DirectionalLight('#c5d9ff', 0.65);
  const rim = new THREE.DirectionalLight('#d7e7ff', 1.15);
  lighting.add(fill, fill.target, rim, rim.target);
  world.add(lighting);
  const stage = new StudioStage(); world.add(stage.group);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, 0.04);
  world.environment = environment.texture;
  world.environmentIntensity = 0.28;
  roomEnvironment.dispose(); pmrem.dispose();

  const furniture = new THREE.Group(); world.add(furniture);
  const rendered = new Map<string, RenderObject>();
  const pendingModels = new Map<string, { model: THREE.Group; token: object; color?: string }>();
  const loader = new AssetLoader();
  let structure: StructureProjection | null = null;
  let structureKey = '';
  let services: ServiceProjection | null = null;
  let serviceKey = '';
  let annotations = new THREE.Group(); world.add(annotations);
  let comparison: THREE.Group | null = null;
  let comparisonEnabled = false;
  let comparisonKey = '';
  let catalogState: CatalogAsset[] = [];
  const layers: Record<ViewportLayer, boolean> = { shell: true, furniture: true, services: true, assumptions: false, ceilings: false, dimensions: false, components: true, clearances: false, electrical: true, 'water-hot': true, 'water-cold': true, waste: true, ventilation: true, heating: true, gas: true, data: true };
  const lightingPreview = new LightingPreview();
  const doorAngles = new Map<string, number>();
  let lastAnimation = 0;
  let snapEnabled = true;
  const endpointHandles = new THREE.Group(); world.add(endpointHandles);
  const openingHandle = new THREE.Group(); world.add(openingHandle);
  const moveMaterial = new THREE.MeshBasicMaterial({ color: '#ad92ef', depthTest: false, depthWrite: false });
  const moveShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.7, 10), moveMaterial);
  moveShaft.rotation.z = Math.PI / 2; openingHandle.add(moveShaft);
  for (const side of [-1, 1]) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 12), moveMaterial);
    arrow.position.x = side * 0.43; arrow.rotation.z = -side * Math.PI / 2; openingHandle.add(arrow);
  }
  openingHandle.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), moveMaterial));
  openingHandle.traverse(child => { child.renderOrder = 960; }); openingHandle.visible = false;
  let openingDrag: OpeningDrag | null = null;
  let endpointDrag: { id: string; endpoint: 'start' | 'end'; point: THREE.Vector3; plane: THREE.Plane; pointerId: number } | null = null;
  let collisionIssues = new Set<string>();
  let documentState: SceneDocument | null = null;
  let sceneGeneration = 0;
  let selectedId: string | null = null;
  let selection: SelectionFrame | null = null;
  let tool: ToolMode = 'select';
  let view: ViewMode = 'perspective';
  let walls: WallMode = 'cutaway';
  let drag: DragSnapshot | null = null;
  let frame = 0;
  let disposed = false;
  let renderFailed = false;
  let initialized = false;
  let pointerStart: { x: number; y: number; pointerId: number; button: number } | null = null;
  let suppressPick = false;
  let pendingScene: { scene: SceneDocument; catalog: CatalogAsset[] } | null = null;
  let width = 1; let height = 1;
  let orbitWasActive = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  let wallPreview: StructureProjection | null = null;
  let wallPreviewServices: ServiceProjection | null = null;
  const wallMove = createWallMove({
    world, canvas: renderer.domElement,
    getCamera: () => camera, getScene: () => documentState, getCatalog: () => catalogState,
    getWall: () => documentState?.walls.find(wall => wall.id === selectedId),
    enabled: () => tool === 'move' && layers.shell && walls !== 'hidden' && Boolean(callbacks.onWallMove)
      && !documentState?.project?.metadata[selectedId ?? '']?.locked,
    snap: () => snapEnabled, wallMode: () => walls, topView: () => view === 'top',
    onStart() {
      pointerStart = null; suppressPick = true; orbit.enabled = false; endpointHandles.visible = false;
      renderer.domElement.style.cursor = 'grabbing'; callbacks.onInteraction(true);
    },
    onPreview(shell, mounted) {
      wallPreview = shell; wallPreviewServices = mounted;
      for (const [id, opening] of shell?.openings ?? []) {
        const angle = doorAngles.get(id) ?? 0; opening.target = angle; opening.setAngle(angle);
      }
      mounted?.applyLighting(lightingPreview.levels); applyLayers();
    },
    onFinish(id, patch) {
      const queued = pendingScene; pendingScene = null; const generation = sceneGeneration;
      orbit.enabled = true; suppressPick = true; pointerStart = null; renderer.domElement.style.cursor = '';
      endpointHandles.visible = true; callbacks.onInteraction(false);
      if (patch) callbacks.onWallMove?.(id, patch.start, patch.end);
      if (queued && sceneGeneration === generation) setScene(queued.scene, queued.catalog);
      updateSelection();
    },
    requestRender,
  });

  function entity(id: string): THREE.Object3D | undefined {
    return rendered.get(id)?.group ?? wallPreview?.entities.get(id) ?? wallPreviewServices?.entities.get(id) ?? structure?.entities.get(id) ?? services?.entities.get(id);
  }
  function entityBounds(object: THREE.Object3D, target = new THREE.Box3()): THREE.Box3 {
    target.makeEmpty(); object.updateWorldMatrix(true, true);
    object.traverseVisible(child => {
      if (child instanceof THREE.Mesh) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) target.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
      }
    });
    // Hidden shell layers still support focusing a selected item from the inspector.
    if (target.isEmpty()) target.setFromObject(object);
    return target;
  }
  function applyLayers(): void {
    for (const shell of [structure, wallPreview]) if (shell) {
      const visible = layers.shell && (!wallPreview || shell === wallPreview);
      shell.group.visible = visible; shell.ceilings.visible = layers.ceilings && visible;
      shell.dimensions.visible = layers.dimensions && (!wallPreview || shell === wallPreview);
    }
    furniture.visible = layers.furniture;
    for (const projection of [services, wallPreviewServices]) if (projection) {
      projection.group.visible = layers.services && (!wallPreviewServices || projection === wallPreviewServices);
      for (const component of projection.components.values()) {
        component.visible = layers.components;
        const clearance = component.userData.clearance as THREE.Object3D | undefined;
        if (clearance) clearance.visible = layers.clearances;
      }
      for (const route of projection.routes.values()) route.group.visible = layers[route.system];
    }
    annotations.visible = layers.assumptions && !wallPreview; if (comparison) comparison.visible = comparisonEnabled;
  }
  function updateEndpointHandles(): void {
    for (const child of [...endpointHandles.children]) disposeObject(child);
    const wall = documentState?.walls.find(item => item.id === selectedId);
    if (!wall || tool !== 'move' || !callbacks.onWallEndpoint || !layers.shell) return;
    const elevation = documentState?.project?.metadata[wall.id]?.elevation ?? 0;
    for (const endpoint of ['start', 'end'] as const) {
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), new THREE.MeshBasicMaterial({ color: endpoint === 'start' ? '#c18148' : '#376b81', depthTest: false }));
      handle.position.set(wall[endpoint][0], elevation + 0.15, wall[endpoint][1]); handle.renderOrder = 950;
      handle.userData.wallEndpoint = endpoint; endpointHandles.add(handle);
    }
  }
  function updateOpeningHandle(): void {
    const context = selectedId && documentState ? findOpeningMove(documentState, selectedId) : undefined;
    openingHandle.visible = Boolean(context && tool === 'move' && callbacks.onOpeningMove && layers.shell && walls !== 'hidden');
    if (!context || !openingHandle.visible) return;
    const { wall, opening } = context;
    const offset = openingDrag?.offset ?? opening.offset;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    const elevation = documentState?.project?.metadata[wall.id]?.elevation ?? 0;
    openingHandle.position.set(wall.start[0] + dx / length * (offset + opening.width / 2), elevation + opening.sill + opening.height / 2, wall.start[1] + dz / length * (offset + opening.width / 2));
    openingHandle.rotation.y = -Math.atan2(dz, dx);
    openingHandle.updateMatrixWorld(true);
  }
  function setDoorAngle(id: string, angle: number): void {
    const opening = structure?.openings.get(id); if (!opening || opening.fixed || !Number.isFinite(angle)) return;
    opening.target = THREE.MathUtils.clamp(angle, 0, Math.PI / 2); doorAngles.set(id, opening.target);
    lastAnimation = performance.now(); requestRender();
  }
  function toggleSwitch(id: string): void {
    lightingPreview.toggleSwitch(id); services?.applyLighting(lightingPreview.levels); requestRender();
  }
  function setSwitchLevel(id: string, level: number): void {
    lightingPreview.setSwitchLevel(id, level); services?.applyLighting(lightingPreview.levels); requestRender();
  }
  function requestRender(): void {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      structure?.updateWalls(camera, walls, view === 'top'); wallMove.render();
      const now = performance.now(); const dt = Math.min((now - lastAnimation) / 1000, 0.06); lastAnimation = now;
      let animating = false;
      for (const [id, opening] of structure?.openings ?? []) {
        if (Math.abs(opening.target - opening.angle) > 0.001) {
          const step = Math.sign(opening.target - opening.angle) * Math.min(Math.abs(opening.target - opening.angle), Math.max(0.01, dt) * 4.2);
          opening.setAngle(opening.angle + step); animating = true;
        }
        opening.setCollision(selectedId === id && collisionIssues.has(id));
      }
      if (selection && selectedId) { const chosen = entity(selectedId); if (chosen) entityBounds(chosen, selection.box); }
      if (animating) requestRender();
      try { renderer.render(world, camera); }
      catch (error) {
        if (!renderFailed) { renderFailed = true; callbacks.onError(`The 3D view could not render: ${error instanceof Error ? error.message : 'unknown graphics error'}`); }
      }
    });
  }

  function updateSelection(): void {
    if (selection) { disposeObject(selection); selection = null; }
    transform.detach();
    const chosen = selectedId ? entity(selectedId) : undefined;
    if (chosen) {
      selection = new SelectionFrame(entityBounds(chosen));
      world.add(selection);
      if (tool !== 'select' && selectedId && (rendered.has(selectedId) || (services?.components.has(selectedId) && callbacks.onComponentTransform))) {
        const component = services?.components.has(selectedId); transform.minY = component ? -50 : chosen.position.y; transform.maxY = component ? 50 : chosen.position.y;
        transform.showY = tool === 'rotate' || tool === 'scale' || (Boolean(component) && tool === 'move'); transform.attach(chosen);
      }
    }
    for (const [id, opening] of structure?.openings ?? []) {
      const envelope = opening.group.userData.envelope as THREE.Group; envelope.visible = id === selectedId;
    }
    for (const [id, component] of services?.components ?? []) {
      const clearance = component.userData.clearance as THREE.Object3D | undefined; if (clearance) clearance.visible = layers.clearances;
    }
    updateEndpointHandles(); updateOpeningHandle(); wallMove.refresh(); requestRender();
  }

  function applyTransform(group: THREE.Group, object: SceneObject): void {
    group.position.fromArray(object.position);
    group.rotation.set(0, object.rotation, 0);
    group.scale.fromArray(object.scale);
    group.updateMatrixWorld(true);
  }

  function installLoadedModels(): void {
    if (drag) return;
    for (const [id, pending] of pendingModels) {
      const current = rendered.get(id);
      if (disposed || !current || current.token !== pending.token) { disposeObject(pending.model); continue; }
      for (const child of [...current.group.children]) disposeObject(child);
      current.group.add(pending.model);
      if (pending.color) pending.model.traverse(child => {
        if (child instanceof THREE.Mesh) for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
          if (mat instanceof THREE.MeshStandardMaterial) mat.color.set(pending.color!);
        }
      });
    }
    pendingModels.clear();
    updateSelection(); requestRender();
  }

  function finishDrag(cancel: boolean): void {
    if (!drag) return;
    const previous = drag;
    const group = previous.component ? services?.components.get(previous.id) : rendered.get(previous.id)?.group;
    const queued = pendingScene;
    pendingScene = null;
    const generationBeforeCommit = sceneGeneration;
    drag = null;
    transform.dragging = false;
    orbit.enabled = true;
    suppressPick = true;
    if (group && cancel) {
      group.position.copy(previous.position); group.quaternion.copy(previous.quaternion); group.scale.copy(previous.scale);
      group.updateMatrixWorld(true);
    }
    callbacks.onInteraction(false);
    if (group && !cancel) {
      const changed = group.position.distanceToSquared(previous.position) > 1e-10 ||
        group.quaternion.angleTo(previous.quaternion) > 1e-5 || group.scale.distanceToSquared(previous.scale) > 1e-10;
      if (changed && previous.component) {
        const component = previous.component; let patch: ComponentTransformPatch;
        if (tool === 'scale') patch = { dimensions: [component.dimensions[0] * group.scale.x, component.dimensions[1] * group.scale.y, component.dimensions[2] * group.scale.z] };
        else if (tool === 'rotate') patch = { rotation: component.rotation + yawOf(group.quaternion) - yawOf(previous.quaternion) };
        else if (component.host) {
          const wall = documentState?.walls.find(item => item.id === component.host!.wallId);
          if (wall) {
            const dx = wall.end[0] - wall.start[0]; const dz = wall.end[1] - wall.start[1]; const length = Math.hypot(dx, dz);
            patch = { host: { ...component.host, offset: ((group.position.x - wall.start[0]) * dx + (group.position.z - wall.start[1]) * dz) / length, elevation: group.position.y } };
          } else patch = { position: [group.position.x, group.position.y, group.position.z] };
        } else patch = { position: [group.position.x, group.position.y, group.position.z] };
        group.position.copy(previous.position); group.quaternion.copy(previous.quaternion); group.scale.copy(previous.scale); group.updateMatrixWorld(true);
        callbacks.onComponentTransform?.(previous.id, patch);
      } else if (changed) {
        const patch: ObjectPatch = tool === 'move' ? { position: [group.position.x, previous.position.y, group.position.z] }
          : tool === 'rotate' ? { rotation: yawOf(group.quaternion) }
          : { scale: [group.scale.x, group.scale.y, group.scale.z] };
        callbacks.onTransform(previous.id, patch);
      }
    }
    // A synchronous host commit supersedes any older snapshot queued during the drag.
    if (queued && sceneGeneration === generationBeforeCommit) setScene(queued.scene, queued.catalog);
    const committed = documentState?.objects.find(object => object.id === previous.id);
    const currentGroup = rendered.get(previous.id)?.group;
    if (currentGroup && committed) applyTransform(currentGroup, committed);
    if (pendingModels.size) installLoadedModels();
    requestRender();
  }

  function startDrag(): void {
    if (!selectedId) return;
    const component = callbacks.onComponentTransform ? documentState?.project?.components.find(item => item.id === selectedId) : undefined;
    const group = rendered.get(selectedId)?.group ?? (component ? services?.components.get(selectedId) : undefined);
    if (!group) return;
    drag = { component, id: selectedId, position: group.position.clone(), quaternion: group.quaternion.clone(), scale: group.scale.clone() };
    suppressPick = true; orbit.enabled = false; callbacks.onInteraction(true);
  }

  function changedTransform(): void {
    const group = transform.object;
    if (group && drag) {
      if (!drag.component) group.position.y = drag.position.y;
      else if (drag.component.host && documentState) {
        const component = drag.component; const host = component.host!; const wall = documentState.walls.find(item => item.id === host.wallId);
        if (wall) {
          const dx = wall.end[0] - wall.start[0]; const dz = wall.end[1] - wall.start[1]; const length = Math.hypot(dx, dz);
          const offset = ((group.position.x - wall.start[0]) * dx + (group.position.z - wall.start[1]) * dz) / length;
          group.position.fromArray(componentPosition(documentState, { ...component, host: { ...host, offset, elevation: group.position.y } }));
        }
      }
      group.quaternion.setFromAxisAngle(upAxis, yawOf(group.quaternion));
      group.scale.set(Math.max(0.1, Math.min(4, group.scale.x)), Math.max(0.1, Math.min(4, group.scale.y)), Math.max(0.1, Math.min(4, group.scale.z)));
      group.updateMatrixWorld(true);
    }
    requestRender();
  }

  function rebuildAnnotations(): void {
    disposeObject(annotations); annotations = new THREE.Group(); world.add(annotations);
    const byEntity = new Map<string, number>();
    for (const assumption of documentState?.project?.assumptions ?? []) {
      if (assumption.status === 'measured' || assumption.status === 'verified') continue;
      const target = entity(assumption.entityId); if (!target) continue;
      const bounds = entityBounds(target); const position = bounds.getCenter(new THREE.Vector3());
      const index = byEntity.get(assumption.entityId) ?? 0; byEntity.set(assumption.entityId, index + 1);
      const label = label3d(`? ${assumption.property}: ${assumption.value || 'Unknown'}`, '#8e591e', '#fff4d7');
      label.position.set(position.x, bounds.max.y + 0.24 + index * 0.32, position.z); label.userData.entityId = assumption.entityId; annotations.add(label);
    }
  }
  function rebuildComparison(catalog: CatalogAsset[]): void {
    const baseline = documentState?.project?.baseline;
    const key = JSON.stringify([baseline, documentState?.project?.materials, catalog]);
    if (key === comparisonKey || (!comparisonEnabled && baseline)) return;
    comparisonKey = key;
    if (comparison) disposeObject(comparison); comparison = null;
    if (!baseline || !documentState) return;
    comparison = new THREE.Group();
    const snapshot: SceneDocument = { ...documentState, rooms: baseline.rooms, walls: baseline.walls, objects: baseline.objects, project: { ...documentState.project!, metadata: baseline.metadata, components: baseline.components, routes: baseline.routes, finishes: baseline.finishes } };
    const shell = makeStructure(snapshot); shell.updateWalls(camera, 'full', false); comparison.add(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
    const systems = makeServices(snapshot); comparison.add(systems.group);
    for (const object of baseline.objects) { const asset = catalog.find(item => item.id === object.assetId); if (!asset) continue; const group = makeFurniture(asset, object.color ?? asset.color); applyTransform(group, object); comparison.add(group); }
    comparison.traverse(object => {
      if (object instanceof THREE.Light) object.visible = false;
      if (object instanceof THREE.Sprite) object.visible = false;
      if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.transparent = true; material.opacity = 0.17; material.depthWrite = false;
        if (material instanceof THREE.MeshStandardMaterial) { material.color.set('#43a5c5'); material.emissive.set('#133c48'); material.wireframe = true; }
      }
    });
    comparison.visible = comparisonEnabled; world.add(comparison);
  }

  function setScene(next: SceneDocument, catalog: CatalogAsset[]): void {
    if (disposed) return;
    if (drag || endpointDrag || openingDrag || wallMove.active) { pendingScene = { scene: next, catalog }; return; }
    sceneGeneration++;
    lightingPreview.setComponents(next.project?.components ?? []);
    documentState = next; catalogState = catalog;
    const nextKey = JSON.stringify([next.rooms, next.walls, next.project?.metadata, next.project?.finishes, next.project?.materials]);
    if (structureKey !== nextKey) {
      if (structure) { disposeObject(structure.group); disposeObject(structure.ceilings); disposeObject(structure.dimensions); }
      structure = makeStructure(next); structureKey = nextKey; world.add(structure.group, structure.ceilings, structure.dimensions);
      for (const [id, opening] of structure.openings) { const angle = opening.fixed ? 0 : doorAngles.get(id) ?? 0; if (opening.fixed) doorAngles.delete(id); opening.target = angle; opening.setAngle(angle); }
      for (const id of doorAngles.keys()) if (!structure.openings.has(id)) doorAngles.delete(id);
      structure.bounds.getCenter(center); structure.bounds.getSize(size);
      stage.update(structure.bounds);
      // Follow imported/off-origin shells, keeping the same light direction at any scale.
      const lightScale = Math.max(size.length(), 6) / 13;
      const shadowRadius = Math.max(size.x, size.z, size.y) * 0.8 + 2;
      sunlight.target.position.copy(center);
      sunlight.position.copy(center).addScaledVector(new THREE.Vector3(-7, 10, 7), lightScale);
      fill.target.position.copy(center);
      fill.position.copy(center).addScaledVector(new THREE.Vector3(8, 5, 3), lightScale);
      rim.target.position.copy(center);
      rim.position.copy(center).addScaledVector(new THREE.Vector3(1, 9, -9), lightScale);
      Object.assign(sunlight.shadow.camera, { left: -shadowRadius, right: shadowRadius, top: shadowRadius, bottom: -shadowRadius, far: Math.max(65, lightScale * 45) });
      sunlight.shadow.camera.updateProjectionMatrix();
      studioFog.near = Math.max(40, size.length() * 3);
      studioFog.far = Math.max(125, size.length() * 10);
    }
    const nextServiceKey = JSON.stringify([next.project?.components, next.project?.routes, next.walls, next.project?.finishes, next.project?.materials]);
    if (serviceKey !== nextServiceKey) {
      if (services) disposeObject(services.group);
      services = makeServices(next); serviceKey = nextServiceKey; world.add(services.group); services.applyLighting(lightingPreview.levels);
    }
    const catalogById = new Map(catalog.map(asset => [asset.id, asset]));
    const existingIds = new Set(next.objects.map(object => object.id));
    for (const [id, record] of rendered) if (!existingIds.has(id)) {
      if (transform.object === record.group) transform.detach();
      disposeObject(record.group); rendered.delete(id);
    }
    for (const object of next.objects) {
      const asset = catalogById.get(object.assetId);
      if (!asset) continue;
      const signature = JSON.stringify([asset, object.color]);
      let record = rendered.get(object.id);
      if (!record || record.signature !== signature) {
        if (record) { if (transform.object === record.group) transform.detach(); disposeObject(record.group); }
        const group = makeFurniture(asset, object.color ?? asset.color);
        group.userData.objectId = object.id;
        group.name = object.name;
        record = { group, signature, token: {} };
        rendered.set(object.id, record); furniture.add(group);
        if (asset.source.type === 'gltf') {
          const token = record.token;
          void loader.load(asset).then(model => {
            const current = rendered.get(object.id);
            if (disposed || !current || current.token !== token) { disposeObject(model); return; }
            // Do not detach or resize a manipulation target while its pointer gesture is live.
            const stale = pendingModels.get(object.id);
            if (stale) disposeObject(stale.model);
            pendingModels.set(object.id, { model, token, color: object.color });
            installLoadedModels();
          }).catch(error => {
            if (!disposed) callbacks.onError(`Could not load ${asset.name}; showing a procedural placeholder. ${error instanceof Error ? error.message : ''}`);
          });
        }
      }
      record.group.name = object.name;
      applyTransform(record.group, object);
    }
    rebuildAnnotations(); rebuildComparison(catalog);
    collisionIssues = new Set(analyzeProject(next, catalog).issues.filter(issue => issue.id.startsWith('swing:') || issue.id.startsWith('swing-wall:')).map(issue => issue.entityId).filter((id): id is string => Boolean(id)));
    if (selectedId && !entity(selectedId)) selectedId = null;
    applyLayers(); updateSelection();
    if (!initialized) { initialized = true; focus(); }
    requestRender();
  }

  function setTool(next: ToolMode): void {
    if (drag) finishDrag(true); if (endpointDrag) finishEndpoint(true); if (openingDrag) finishOpening(true); wallMove.finish(true);
    tool = next; renderer.domElement.style.cursor = '';
    transform.setMode(next === 'rotate' ? 'rotate' : next === 'scale' ? 'scale' : 'translate');
    transform.setSpace(next === 'scale' ? 'local' : 'world');
    transform.showX = next !== 'rotate';
    transform.showY = next === 'rotate' || next === 'scale';
    transform.showZ = next !== 'rotate';
    transform.showXY = false; transform.showYZ = false; transform.showXZ = next === 'move';
    transform.showE = false; transform.showXYZE = false;
    updateSelection();
  }

  function focus(id?: string): void {
    const chosen = id ? entity(id) : undefined;
    if (chosen) entityBounds(chosen, box);
    else if (structure) { box.copy(structure.bounds); if (view !== 'top') box.union(stage.bounds); }
    else box.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 1, 3));
    box.getCenter(center); box.getSize(size);
    if (!chosen) center.y = (structure?.bounds.min.y ?? 0) + 0.55;
    const radius = Math.max(size.x, size.y, size.z, 1.2);
    orbit.target.copy(center);
    if (view === 'top') {
      camera.position.set(center.x, 25, center.z + 0.001);
      const span = Math.max(size.z, size.x / Math.max(width / height, 0.1), 2) * 1.25;
      orthographic.zoom = 16 / span;
      orthographic.updateProjectionMatrix();
    } else {
      // Fit all eight corners in the actual camera basis, including the diagonal footprint.
      const direction = new THREE.Vector3(0.95, 1.1, 1.35).normalize();
      const right = new THREE.Vector3().crossVectors(upAxis, direction).normalize();
      const screenUp = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tanVertical = Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2);
      const tanHorizontal = tanVertical * perspective.aspect;
      let distance = 2;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(center);
        distance = Math.max(distance, offset.dot(direction) + Math.abs(offset.dot(right)) / tanHorizontal,
          offset.dot(direction) + Math.abs(offset.dot(screenUp)) / tanVertical);
      }
      distance *= chosen ? 1.3 : 1.16;
      orbit.maxDistance = Math.max(65, distance * 2);
      perspective.far = Math.max(250, distance * 4); perspective.updateProjectionMatrix();
      camera.position.copy(center).addScaledVector(direction, distance);
    }
    camera.lookAt(center); orbit.update(); requestRender();
  }

  function resize(): void {
    width = Math.max(container.clientWidth, 1); height = Math.max(container.clientHeight, 1);
    resizeTransformControls(transform, height);
    renderer.setSize(width, height, false);
    perspective.aspect = width / height; perspective.updateProjectionMatrix();
    const aspect = width / height;
    orthographic.left = -8 * aspect; orthographic.right = 8 * aspect; orthographic.top = 8; orthographic.bottom = -8;
    orthographic.updateProjectionMatrix(); requestRender();
  }

  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  function pointerRay(event: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
  }
  function pickEntity(): { id: string; point: THREE.Vector3 } | undefined {
    const pickables: THREE.Object3D[] = [];
    for (const root of [furniture, structure?.group, services?.group, annotations]) if (root?.visible) root.traverseVisible(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) pickables.push(object);
    });
    for (const intersection of raycaster.intersectObjects(pickables, false)) {
      let parent: THREE.Object3D | null = intersection.object;
      while (parent && !parent.userData.objectId && !parent.userData.entityId) parent = parent.parent;
      const id = parent?.userData.objectId ?? parent?.userData.entityId;
      if (id) return { id: id as string, point: intersection.point };
    }
    return undefined;
  }
  function onPointerDown(event: PointerEvent): void {
    if (openingDrag || endpointDrag || wallMove.active) { event.stopImmediatePropagation(); return; }
    if (event.button === 0 && selectedId && openingHandle.visible && documentState) {
      pointerRay(event);
      const handleHit = raycaster.intersectObjects(openingHandle.children, false)[0];
      const bodyHit = handleHit ? undefined : pickEntity();
      const context = findOpeningMove(documentState, selectedId);
      if (context && (handleHit || bodyHit?.id === selectedId)) {
        const { wall, opening } = context;
        const axis = new THREE.Vector3(wall.end[0] - wall.start[0], 0, wall.end[1] - wall.start[1]).normalize();
        // A camera-facing plane containing the wall axis works in perspective and Top,
        // including diagonal walls. Preserve where the person grabbed the door.
        const normal = camera.getWorldDirection(new THREE.Vector3()); normal.addScaledVector(axis, -normal.dot(axis));
        if (normal.lengthSq() > 1e-6) {
          const point = handleHit?.point ?? bodyHit!.point;
          openingDrag = { context, axis, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), point), startAlong: point.dot(axis), offset: opening.offset, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          pointerStart = null; orbit.enabled = false; suppressPick = true;
          renderer.domElement.style.cursor = 'grabbing'; callbacks.onInteraction(true);
          renderer.domElement.setPointerCapture(event.pointerId); event.stopImmediatePropagation(); return;
        }
      }
    }
    if (event.button === 0 && selectedId && endpointHandles.children.length) {
      pointerRay(event); const hit = raycaster.intersectObjects(endpointHandles.children, false)[0];
      const wall = documentState?.walls.find(item => item.id === selectedId);
      if (hit && wall) {
        const endpoint = hit.object.userData.wallEndpoint as 'start' | 'end'; const elevation = documentState?.project?.metadata[wall.id]?.elevation ?? 0;
        endpointDrag = { id: wall.id, endpoint, point: new THREE.Vector3(wall[endpoint][0], elevation + 0.15, wall[endpoint][1]), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(elevation + 0.15)), pointerId: event.pointerId };
        orbit.enabled = false; suppressPick = true; callbacks.onInteraction(true); renderer.domElement.setPointerCapture(event.pointerId); event.stopImmediatePropagation(); return;
      }
    }
    if (event.button === 0 && tool === 'move' && selectedId && !drag) {
      pointerRay(event); const hit = pickEntity();
      if (wallMove.pointerDown(event, hit?.id, hit?.point)) return;
    }
    pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, button: event.button };
    if (!drag) suppressPick = false;
  }
  function onPointerMove(event: PointerEvent): void {
    if (wallMove.active) { wallMove.pointerMove(event); return; }
    if (openingDrag) {
      if (event.pointerId !== openingDrag.pointerId) return;
      const gesture = openingDrag;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 3) return;
      gesture.moved = true;
      pointerRay(event); const point = raycaster.ray.intersectPlane(gesture.plane, new THREE.Vector3()); if (!point) return;
      const offset = constrainOpeningOffset(gesture.context, gesture.context.opening.offset + point.dot(gesture.axis) - gesture.startAlong, snapEnabled);
      if (Math.abs(offset - gesture.offset) > 1e-8) {
        gesture.offset = offset; structure?.previewOpeningOffset(gesture.context.opening.id, offset);
        updateOpeningHandle(); requestRender();
      }
      return;
    }
    if (!endpointDrag && !drag && openingHandle.visible && selectedId) {
      pointerRay(event);
      const overHandle = raycaster.intersectObjects(openingHandle.children, false).length > 0;
      renderer.domElement.style.cursor = overHandle || pickEntity()?.id === selectedId ? 'grab' : '';
    }
    if (!endpointDrag || event.pointerId !== endpointDrag.pointerId) return;
    pointerRay(event); const point = raycaster.ray.intersectPlane(endpointDrag.plane, new THREE.Vector3()); if (!point) return;
    if (snapEnabled) { point.x = Math.round(point.x / 0.05) * 0.05; point.z = Math.round(point.z / 0.05) * 0.05; }
    endpointDrag.point.copy(point);
    const handle = endpointHandles.children.find(child => child.userData.wallEndpoint === endpointDrag?.endpoint); handle?.position.copy(point); requestRender();
  }
  function finishOpening(cancel: boolean): void {
    if (!openingDrag) return;
    const gesture = openingDrag; openingDrag = null;
    const { opening } = gesture.context;
    const queued = pendingScene; pendingScene = null; const generation = sceneGeneration;
    // The preview never mutates the scene. Restore it before the checked command,
    // so cancellation, rejection and a no-op all leave the authoritative state visible.
    structure?.previewOpeningOffset(opening.id, opening.offset);
    orbit.enabled = true; suppressPick = true; pointerStart = null; renderer.domElement.style.cursor = '';
    if (renderer.domElement.hasPointerCapture(gesture.pointerId)) renderer.domElement.releasePointerCapture(gesture.pointerId);
    callbacks.onInteraction(false);
    if (!cancel && gesture.moved && Math.abs(gesture.offset - opening.offset) > 1e-8) callbacks.onOpeningMove?.(opening.id, gesture.offset);
    if (queued && sceneGeneration === generation) setScene(queued.scene, queued.catalog);
    updateOpeningHandle(); requestRender();
  }
  function finishEndpoint(cancel: boolean): void {
    if (!endpointDrag) return; const drag = endpointDrag; endpointDrag = null; orbit.enabled = true;
    if (renderer.domElement.hasPointerCapture(drag.pointerId)) renderer.domElement.releasePointerCapture(drag.pointerId);
    const queued = pendingScene; pendingScene = null; const generation = sceneGeneration;
    callbacks.onInteraction(false); if (!cancel) callbacks.onWallEndpoint?.(drag.id, drag.endpoint, [drag.point.x, drag.point.z]);
    if (queued && sceneGeneration === generation) setScene(queued.scene, queued.catalog);
    updateEndpointHandles(); requestRender();
  }
  function onPointerUp(event: PointerEvent): void {
    if (wallMove.active) { if (event.button === 0) wallMove.finish(false, event); return; }
    if (openingDrag) { if (event.pointerId === openingDrag.pointerId && event.button === 0) finishOpening(false); return; }
    if (endpointDrag) { if (event.pointerId === endpointDrag.pointerId && event.button === 0) finishEndpoint(false); pointerStart = null; return; }
    const start = pointerStart; pointerStart = null;
    if (!start || event.pointerId !== start.pointerId || start.button !== 0 || suppressPick || drag) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    pointerRay(event);
    const id = pickEntity()?.id ?? null;
    if (id && id === selectedId && tool === 'select') {
      const opening = structure?.openings.get(id); if (opening && !opening.fixed) setDoorAngle(id, opening.target > 0.01 ? 0 : Math.PI / 2);
      if (documentState?.project?.components.find(component => component.id === id)?.control) toggleSwitch(id);
    }
    callbacks.onSelect(id);
  }
  function onPointerCancel(): void {
    pointerStart = null; finishDrag(true); finishEndpoint(true); finishOpening(true); wallMove.finish(true);
    if (orbitWasActive) { orbitWasActive = false; callbacks.onInteraction(false); }
  }
  function onLostPointerCapture(event: PointerEvent): void {
    wallMove.finish(true, event);
    if (openingDrag?.pointerId === event.pointerId) finishOpening(true);
  }
  function onContextLoss(event: Event): void { event.preventDefault(); callbacks.onError('The graphics context was interrupted. Reload the page to restore the 3D view; saved scenes remain available.'); }
  function onOrbitStart(): void { if (!drag) { orbitWasActive = true; callbacks.onInteraction(true); } }
  function onOrbitEnd(): void { if (orbitWasActive) { orbitWasActive = false; callbacks.onInteraction(false); } }
  function endDrag(): void { finishDrag(false); }

  transform.addEventListener('mouseDown', startDrag);
  transform.addEventListener('mouseUp', endDrag);
  transform.addEventListener('objectChange', changedTransform);
  transform.addEventListener('change', requestRender);
  orbit.addEventListener('change', requestRender);
  orbit.addEventListener('start', onOrbitStart);
  orbit.addEventListener('end', onOrbitEnd);
  renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);
  renderer.domElement.addEventListener('lostpointercapture', onLostPointerCapture);
  renderer.domElement.addEventListener('webglcontextlost', onContextLoss);
  window.addEventListener('blur', onPointerCancel);
  resize(); setTool('select');

  return {
    setScene,
    setSelection(id) { if (wallMove.active && id !== selectedId) wallMove.finish(true); if (drag && id !== selectedId) finishDrag(true); if (endpointDrag) finishEndpoint(true); if (openingDrag && id !== selectedId) finishOpening(true); selectedId = id; renderer.domElement.style.cursor = ''; updateSelection(); },
    setTool,
    setView(next) {
      if (next === view) return;
      finishDrag(true); finishEndpoint(true); finishOpening(true); wallMove.finish(true); view = next;
      camera = next === 'top' ? orthographic : perspective;
      orbit.object = camera; transform.camera = camera;
      orbit.enableRotate = next !== 'top';
      orbit.minPolarAngle = next === 'top' ? 0 : 0.05;
      orbit.mouseButtons.LEFT = next === 'top' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      focus(); updateSelection();
    },
    setSnap(enabled) { snapEnabled = enabled; transform.setTranslationSnap(enabled ? 0.25 : null); transform.setRotationSnap(enabled ? Math.PI / 12 : null); transform.setScaleSnap(enabled ? 0.1 : null); requestRender(); },
    setWalls(mode) { finishOpening(true); wallMove.finish(true); walls = mode; updateOpeningHandle(); wallMove.refresh(); renderer.domElement.style.cursor = ''; requestRender(); },
    setQuality(mode) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, mode === 'high' ? 2 : 1.5));
      const resolution = mode === 'high' ? 4096 : 2048;
      sunlight.shadow.radius = mode === 'high' ? 10 : 5;
      if (sunlight.shadow.mapSize.x !== resolution) {
        sunlight.shadow.mapSize.set(resolution, resolution);
        sunlight.shadow.map?.dispose(); sunlight.shadow.map = null; sunlight.shadow.needsUpdate = true;
      }
      resize();
    },
    setLayer(layer, visible) { wallMove.finish(true); if (layer === 'shell') finishOpening(true); layers[layer] = visible; applyLayers(); updateSelection(); },
    setDoorAngle,
    getDoorAngle(id) { return structure?.openings.get(id)?.target ?? 0; },
    toggleSwitch,
    setSwitchLevel,
    getSwitchLevel(id) { return lightingPreview.getSwitchLevel(id); },
    setComparison(enabled) { comparisonEnabled = enabled; if (enabled) rebuildComparison(catalogState); applyLayers(); requestRender(); },
    focus,
    cancelInteraction() { onPointerCancel(); },
    dispose() {
      if (disposed) return;
      finishDrag(true); finishEndpoint(true); finishOpening(true); wallMove.finish(true); disposed = true;
      cancelAnimationFrame(frame); resizeObserver.disconnect();
      window.removeEventListener('blur', onPointerCancel);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('lostpointercapture', onLostPointerCapture);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLoss);
      transform.removeEventListener('mouseDown', startDrag); transform.removeEventListener('mouseUp', endDrag);
      transform.removeEventListener('objectChange', changedTransform); transform.removeEventListener('change', requestRender);
      orbit.removeEventListener('change', requestRender); orbit.removeEventListener('start', onOrbitStart); orbit.removeEventListener('end', onOrbitEnd);
      wallMove.dispose(); transform.dispose(); orbit.dispose();
      if (selection) disposeObject(selection);
      rendered.forEach(record => disposeObject(record.group)); rendered.clear();
      pendingModels.forEach(pending => disposeObject(pending.model)); pendingModels.clear();
      if (structure) { disposeObject(structure.group); disposeObject(structure.ceilings); disposeObject(structure.dimensions); }
      if (services) disposeObject(services.group); if (comparison) disposeObject(comparison); disposeObject(annotations); disposeObject(endpointHandles); disposeObject(openingHandle);
      stage.dispose(); loader.dispose(); sunlight.shadow.dispose();
      environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
