import { placeFurniture, canRestOnFurniture, isDescendant, followSupports, type FurnitureSurfaceResolver } from '../core/furniture-support';
import { createFurnitureSurfaceResolver, furniturePointerSurface } from './furniture-surfaces';
import { registerDesignerRenderer } from '../adapters/designer-vision';
import { ceilingDesignRoomAt, layoutCeilingDesign } from '../core/ceiling-design';
import { makeCeilingDesigns, updateCeilingDesignVisibility, updateCeilingDesignLighting, updateCeilingIndirectLighting } from './ceiling-design';
import * as THREE from 'three';
import { snapWallEndpoint } from '../core/wall-snapping';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BuildingComponent, CatalogAsset, ComponentTransformPatch, ObjectPatch, Opening, SceneDocument, SceneObject, ToolMode, Vec3, ViewMode, Viewport, ViewportCallbacks, ViewportLayer, WallMode } from '../contracts';
import { AssetLoader, disposeObject, makeFurniture, poseWallDecoration } from './assets';
import { makeStructure, type StructureProjection } from './structure';
import { installComponentModel, LightingPreview, makeServices, type ServiceProjection } from './services';
import { installOpeningModel, openingModel } from './opening-models';
import { OpeningAssetLoader } from './opening-assets';
import { label3d } from './annotations';
import { createWallMove } from './wall-move';
import type { SceneNormalizer } from '../core/store';
import { analyzeProject, componentPosition } from '../core/renovation';
import { findOpeningMove, constrainOpeningOffset, type OpeningMoveContext } from '../core/opening-move';
import { constrainOpeningTransform, findOpeningTransform, type OpeningDimensions, type OpeningTransformContext, type OpeningTransformMode } from '../core/opening-transform';
import { OpeningHandles } from './opening-handles';
import { SelectionFrame, resizeTransformControls, styleTransformControls } from './selection-style';
import { SkyboxResources, isSkyboxPreset, type SkyboxPreset } from './skybox';
import { StudioRenderer } from './studio-renderer';
import { placementConflicts } from '../core/placement-conflicts';
import { expandFurnitureSelection, furnitureMembers } from '../core/grouping';
import { selectionFurnitureUpdates } from '../core/multi-selection';
import { PlacementFeedback } from './placement-feedback';
import { PlacementMotion } from './placement-motion';
import { MotionTimeline, MOTION, setProjectionOpacity } from './motion';
import { transitionTransform } from './transform-motion';
import { createFinishInteraction, type FinishTarget } from './finish-interaction';
import type { FinishReveal } from './finish-material';
import { subscribeFinishTextures } from './finish-textures';
import { selectionCameraOffset, type ScreenRect } from './selection-camera';
import { roomCameraFrame } from './room-camera';
import { roomCeilingHeight } from '../core/heights';
import { findWalkSpawn, moveWalkPosition } from '../core/walkthrough';
import { WalkthroughControls } from './walkthrough-controls';
import { KeyboardNavigationControls } from './keyboard-navigation';
import { HandPanControls } from './hand-pan';
import { configureInsideCamera, isInsideLens, type InsideLens } from './walkthrough-camera';
import { DEFAULT_SUN, normalizeSun, fitSunShadow, effectiveSunlight, type SunSettings } from './sunlight';
import { timeOfDayLighting } from './time-of-day';
import { SunOccluders } from './sun-occluders';
import { SceneShadowCache } from './shadow-cache';
import { EveningRoomLights, PracticalLightPool, type RoomFill } from './practical-lights';
import { installPerfProbe, type PerfProbe } from './perf-probe';
import { TopLightingProjection } from './top-lighting';
import { createFurnitureDrop } from './furniture-drop';
import { BLUEPRINT_PAPER, BlueprintGround, type BlueprintBackdrop } from './blueprint-ground';

interface RenderObject { group: THREE.Group; pose: THREE.Group; visual: THREE.Group; signature: string; token: object; dimensions: [number, number, number]; opacity: number }
interface DragSnapshot {
  members?: SceneObject[]; component?: BuildingComponent; id: string;
  position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3;
  body?: { pointerId: number; plane: THREE.Plane; origin: THREE.Vector3; x: number; y: number; moved: boolean };
}
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
  transformContext?: OpeningTransformContext;
  mode?: OpeningTransformMode;
  startUp?: number;
  dimensions?: OpeningDimensions;
  testOnClick?: boolean;
}

// Euler XYZ folds Y past 90 degrees into X/Z turns; read heading from the basis instead.
const upAxis = new THREE.Vector3(0, 1, 0);
const INSIDE_TWILIGHT = 0.5;
const eveningSky = new THREE.Color('#8a7a6a'), eveningGround = new THREE.Color('#6b4a30');
/** One warm ceiling glow per interior room, just under its ceiling. */
function eveningRooms(scene: SceneDocument): RoomFill[] {
  const metadata = scene.project?.metadata ?? {};
  return scene.rooms.flatMap(room => {
    const meta = metadata[room.id] ?? {};
    if (room.polygon.length < 3 || meta.phase === 'remove' || ['balcony', 'terrace'].includes(meta.zone ?? 'interior')) return [];
    let area = 0, cx = 0, cz = 0;
    room.polygon.forEach(([x0, z0], index) => {
      const [x1, z1] = room.polygon[(index + 1) % room.polygon.length]!;
      const cross = x0! * z1! - x1! * z0!; area += cross; cx += (x0! + x1!) * cross; cz += (z0! + z1!) * cross;
    });
    if (Math.abs(area) < 1e-6) return [];
    const ceiling = (meta.elevation ?? 0) + roomCeilingHeight(scene, room) - (meta.ceilingDesign?.drop ?? 0);
    return [{ center: new THREE.Vector3(cx / (3 * area), ceiling - 0.45, cz / (3 * area)), area: Math.abs(area) / 2 }];
  });
}
function yawOf(quaternion: THREE.Quaternion): number {
  const { x, y, z, w } = quaternion;
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
}

export interface FinishViewportCallbacks extends ViewportCallbacks {
  onSunChange?(settings: SunSettings): void;
  onLightingChange?(): void;
  onFinish?(presetId: string, target: FinishTarget): boolean;
  onFurnitureDrop?(assetId: string, position: SceneObject['position']): void;
}

export interface FinishViewport extends Viewport {
  /** Move the live world and its input surface to a new host without recreating GPU resources. */
  attach(container: HTMLElement, callbacks: FinishViewportCallbacks, normalizeScene?: SceneNormalizer): void;
  /** One-use restore of camera and lighting previews after the original scene returns from construction. */
  preservePresentation(): () => void;
  furnitureSurface: FurnitureSurfaceResolver;
  setFurnitureDrag(asset: CatalogAsset | null): void;
  setInsideLens(lens: InsideLens): void;
  setAdditiveSelection(enabled: boolean): void;
  setFinishBrush(presetId: string | null): void;
  revealSelection(available: ScreenRect): void;
  setLightingMood(mood: 'day' | 'evening'): void;
  setSkybox(preset: SkyboxPreset): boolean;
  getSun(): SunSettings;
  setSun(patch: Partial<SunSettings>): void;
  setTopLighting(enabled: boolean): void;
  inspectCeiling(roomId: string): boolean;
  /** A world point in canvas pixels, so overlays can follow the camera. `visible` is false behind the camera or off the canvas. */
  project(point: Vec3): { x: number; y: number; visible: boolean } | null;
  /** Calls the listener after every rendered frame. Returns an unsubscribe. */
  onFrame(listener: () => void): () => void;
  /** Drops a loaded model's parts into place one by one, bottom first; waits for the model if it is still loading. */
  animateAssembly(id: string): void;
  /** Hides these furniture objects in the view (an overlay may draw them instead); the scene is unchanged. */
  setHidden(ids: string[]): void;
  /** The current 3D camera and backdrop, read-only, so another view can hand over to this one. Null outside perspective. */
  cameraPose(): { position: Vec3; target: Vec3; fov: number; background: string | null } | null;
  /** Set the permanent blueprint paper; `null` clears the source sheet and restores the default paper. */
  setBackdrop(backdrop: BlueprintBackdrop | null): BlueprintGround | null;
  /** Look only: orbit, pan, zoom and keyboard movement keep working; nothing can be picked, tapped or dragged. */
  setLocked(locked: boolean): void;
  /** Glide (or cut, with 0 ms) the 3D camera to a pose. */
  setCameraPose(pose: { position: Vec3; target: Vec3; fov?: number }, duration?: number): void;
  /** Raise the current walls out of the floor. */
  riseStructure(duration?: number): void;
  /** True while furniture models are still loading or waiting to be installed. */
  loading(): boolean;
  /** Draw again after presentation-only changes made from outside (the blueprint sheet). */
  redraw(): void;
}
export function createViewport(host: HTMLElement, callbacks: FinishViewportCallbacks, normalizeScene?: SceneNormalizer): FinishViewport {
  // Keep canvas-relative helpers and drag listeners together when construction becomes editing.
  const container = document.createElement('div');
  container.className = 'world-viewport';
  container.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden';
  host.append(container);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    callbacks.onError('This browser could not create a WebGL viewport. Enable hardware acceleration and reload.');
    const message = document.createElement('p');
    message.textContent = '3D view unavailable. Enable browser hardware acceleration and reload.';
    message.style.cssText = 'margin:auto;padding:2rem;color:#6a5849;max-width:28rem;text-align:center';
    container.append(message);
    return { attach(next) { next.append(container); }, preservePresentation() { return () => {}; }, furnitureSurface() { return undefined; }, setFurnitureDrag() {}, setInsideLens() {}, setSkybox() { return false; }, getSun() { return { ...DEFAULT_SUN }; }, setSun() {}, setTopLighting() {}, setLightingMood() {}, inspectCeiling() { return false; }, project() { return null; }, onFrame() { return () => {}; }, animateAssembly() {}, setHidden() {}, cameraPose() { return null; }, setBackdrop() { return null; }, setLocked() {}, setCameraPose() {}, riseStructure() {}, loading() { return false; }, redraw() {}, setFinishBrush() {}, setAdditiveSelection() {}, revealSelection() {}, setScene() {}, animatePlacement() {}, setSelection() {}, setTool() {}, setView() {}, setSnap() {}, setWalls() {}, setQuality() {}, setLayer() {}, setDoorAngle() {}, getDoorAngle() { return 0; }, toggleSwitch() {}, setSwitchLevel() {}, getSwitchLevel() { return 0; }, setComparison() {}, focus() {}, cancelInteraction() {}, dispose() { container.remove(); } };
  }
  renderer.setClearColor(BLUEPRINT_PAPER);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D apartment. Click rooms, walls, openings, furniture, or building services to select. Tap a door or window in Select to open or close it. Shift-click walls or furniture to select several and move them together. Select a window, then drag its center to move or its edge handles to resize. Choose Move to drag a selected door along its wall. Click a selected switch again to test it. Drag empty space to orbit, hold Space and drag or right drag to pan, and scroll to zoom. Click the canvas, then use W A S D or arrow keys to move around.');
  container.appendChild(renderer.domElement);

  const world = new THREE.Scene();
  const shadowCache = new SceneShadowCache(world);
  const topLighting = new TopLightingProjection();
  let topLightingEnabled = false;
  const blueprint = new BlueprintGround({ paper: BLUEPRINT_PAPER }, renderer.toneMappingExposure);
  world.add(blueprint.group);
  world.background = blueprint.background;
  const perspective = new THREE.PerspectiveCamera(32, 1, 0.05, 250);
  perspective.position.set(11, 12, 15);
  const insideCamera = new THREE.PerspectiveCamera(60, 1, 0.03, 250);
  let insideLens: InsideLens = 'standard';
  configureInsideCamera(insideCamera, 1, insideLens);
  const orthographic = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.05, 250);
  orthographic.up.set(0, 0, -1);
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
  const orbit = new OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera>(camera, renderer.domElement);
  orbit.enableDamping = false;
  orbit.minDistance = 1;
  orbit.maxDistance = 65;
  // Paper is the permanent ground: keep the outside camera above it.
  orbit.minPolarAngle = 0.002;
  orbit.maxPolarAngle = Math.PI / 2 - 0.03;
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
  const ambient = new THREE.HemisphereLight('#dfe4ec', '#a89580', 0.42);
  lighting.add(ambient);
  const sunlight = new THREE.DirectionalLight('#ffd296', 0.95);
  sunlight.name = 'Sun';
  let sunSettings: SunSettings = { ...DEFAULT_SUN };
  let skySun = effectiveSunlight(sunSettings);
  let skyUpdateTimer: ReturnType<typeof setTimeout> | undefined;
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.near = 0.5;
  sunlight.shadow.camera.far = 65;
  sunlight.shadow.bias = -0.00005;
  sunlight.shadow.normalBias = 0.004;
  sunlight.shadow.radius = 1.5;
  lighting.add(sunlight, sunlight.target);
  const fill = new THREE.DirectionalLight('#adc8f5', 0.18);
  const rim = new THREE.DirectionalLight('#d7e7ff', 0.4);
  // Broad photographic softboxes produce warm pools without flattening every
  // wall with ambient light. They are presentation lights, outside scene data.
  const warmPool = new THREE.SpotLight('#ffbd76', 75, 0, Math.PI / 3, 1, 2);
  const secondPool = new THREE.SpotLight('#ffd29e', 24, 0, Math.PI / 3, 1, 2);
  lighting.add(fill, fill.target, rim, rim.target, warmPool, warmPool.target, secondPool, secondPool.target);
  world.add(lighting);
  let locked = false;
  let loadingModels = 0;
  const skyboxes = new SkyboxResources(renderer);
  let skyboxPreset: SkyboxPreset = 'studio';
  const sunOccluders = new SunOccluders(); world.add(sunOccluders.group);
  const practicalLights = new PracticalLightPool(); world.add(practicalLights.group);
  const eveningLights = new EveningRoomLights(); world.add(eveningLights.group);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, 0.04);
  world.environment = environment.texture;
  world.environmentIntensity = 0.16;
  roomEnvironment.dispose(); pmrem.dispose();
  const studioRenderer = new StudioRenderer(renderer, world, camera);
  studioRenderer.setVignette(0);

  const furniture = new THREE.Group(); world.add(furniture);
  const outgoingFurniture = new THREE.Group(); world.add(outgoingFurniture);
  const placementFeedback = new PlacementFeedback(container); world.add(placementFeedback.group);
  const rendered = new Map<string, RenderObject>();
  const pendingModels = new Map<string, { model: THREE.Group; token: object; color?: string }>();
  const loader = new AssetLoader();
  let structure: StructureProjection | null = null;
  let structureKey = '';
  let ceilingDesigns: THREE.Group | null = null;
  let ceilingRoomId: string | undefined;
  const practicalIntensities = new WeakMap<THREE.Light, number>();
  const practicalEmissions = new WeakMap<THREE.MeshStandardMaterial, number>();
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
  const openingAssets = new OpeningAssetLoader();
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
  const windowHandles = new OpeningHandles(container, startWindowDrag);
  let windowContextCache: { scene: SceneDocument; id: string; context?: OpeningTransformContext } | undefined;
  let openingMoveCache: { scene: SceneDocument; id: string; context?: OpeningMoveContext } | undefined;
  let endpointDrag: { id: string; endpoint: 'start' | 'end'; point: THREE.Vector3; plane: THREE.Plane; pointerId: number } | null = null;
  let collisionIssues = new Set<string>();
  let collisionTimer: ReturnType<typeof setTimeout> | undefined;
  let documentState: SceneDocument | null = null;
  let pendingFinishReveal: FinishReveal | undefined;
  let sceneGeneration = 0;
  let selectedId: string | null = null;
  // Rooms retain one semantic ID; picking their ceiling changes only the mask.
  let ceilingSelectionId: string | null = null;
  let selectedIds: string[] = [];
  let selectedFurnitureIds: string[] = [];
  let additiveSelection = false;
  let selection: SelectionFrame | null = null;
  let tool: ToolMode = 'select';
  let view: ViewMode = 'perspective';
  let walls: WallMode = 'cutaway';
  let drag: DragSnapshot | null = null;
  let frame = 0;
  let disposed = false;
  let renderFailed = false;
  let perfProbe: PerfProbe | undefined;
  const placementMotion = new PlacementMotion(furniture, () => { shadowCache.invalidate(); requestRender(); });
  const motion = new MotionTimeline(() => { shadowCache.invalidate(); requestRender(); });
  const cameraMotion = new MotionTimeline(requestRender);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let interactionUntil = 0;
  let interactionChanged = false;
  let renderedCamera: THREE.Camera | undefined;
  const cameraMatrix = new THREE.Matrix4(), cameraProjection = new THREE.Matrix4();
  const retiring = new Set<THREE.Group>();
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
  const walk = new WalkthroughControls(insideCamera, renderer.domElement,
    (position, delta) => documentState ? moveWalkPosition(documentState, catalogState, position, delta) : position, requestRender, event => {
      pointerRay(event);
      const id = pickEntity()?.id;
      if (id && documentState?.project?.components.some(component => component.id === id && component.kind === 'switch' && component.phase !== 'remove')) toggleSwitch(id);
    });
  let outsideView: { view: ViewMode; position: THREE.Vector3; quaternion: THREE.Quaternion; target: THREE.Vector3; zoom: number } | null = null;
  let previousDoorAngles = new Map<string, number>();
  const orbitLabel = renderer.domElement.getAttribute('aria-label')!;
  const keyboardNavigation = new KeyboardNavigationControls(renderer.domElement, {
    camera: () => camera, target: orbit.target,
    enabled: () => view !== 'inside' && orbit.enabled && !drag && !endpointDrag && !openingDrag
      && !wallMove.active && !finishInteraction.active && !furnitureDrop.active && (!pointerStart || orbitWasActive),
    start() { cameraMotion.cancel('camera'); if (pointerStart) suppressPick = true; reportNavigationInteraction(); },
    stop() { reportNavigationInteraction(); },
    change() { orbit.update(); },
    render: requestRender,
  });

  let wallPreview: StructureProjection | null = null;
  let wallPreviewServices: ServiceProjection | null = null;
  const wallMove = createWallMove({
    normalizeScene: (scene, previous) => normalizeScene?.(scene, previous) ?? scene,
    world, canvas: renderer.domElement,
    getCamera: () => camera, getScene: () => documentState, getCatalog: () => catalogState,
    getWall: () => documentState?.walls.find(wall => wall.id === selectedId),
    getWalls: () => documentState?.walls.filter(wall => selectedIds.includes(wall.id)) ?? [],
    enabled: () => view !== 'inside' && tool === 'move' && layers.shell && walls !== 'hidden' && Boolean(callbacks.onWallMove)
      && !additiveSelection && selectedIds.every(id => documentState?.walls.some(wall => wall.id === id))
      && !selectedIds.some(id => documentState?.project?.metadata[id]?.locked),
    snap: () => snapEnabled, wallMode: () => walls, topView: () => view === 'top',
    onStart() {
      keyboardNavigation.cancel();
      cameraMotion.cancel('camera');
      pointerStart = null; suppressPick = true; orbit.enabled = false; endpointHandles.visible = false;
      renderer.domElement.style.cursor = 'grabbing'; callbacks.onInteraction(true);
    },
    onPreview(shell, mounted, previewScene) {
      interactionChanged = true;
      if (previewScene ?? documentState) sunOccluders.setScene((previewScene ?? documentState)!);
      wallPreview = shell; wallPreviewServices = mounted;
      for (const [id, opening] of shell?.openings ?? []) {
        const angle = doorAngles.get(id) ?? 0; opening.target = angle; opening.setAngle(angle);
      }
      for (const [id, angle] of doorAngles) sunOccluders.setDoorAngle(id, angle);
      applyLayers();
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
  function automaticLightLevel(): number | null {
    return sunSettings.timeOfDay != null && sunSettings.autoLights !== false ? timeOfDayLighting(sunSettings.timeOfDay).autoLights : null;
  }
  function scalePracticalProjection(root: THREE.Object3D, level: number): void {
    root.traverse(object => {
      if (object instanceof THREE.Light) {
        if (!practicalIntensities.has(object)) practicalIntensities.set(object, object.intensity);
        object.intensity = practicalIntensities.get(object)! * level;
      }
      if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if (!practicalEmissions.has(material)) practicalEmissions.set(material, material.emissiveIntensity);
        material.emissiveIntensity = practicalEmissions.get(material)! * level;
      }
    });
  }
  function applyPracticalLighting(): void {
    const automaticLevel = automaticLightLevel();
    lightingPreview.setAutomaticLevel(automaticLevel);
    for (const projection of [services, wallPreviewServices]) projection?.applyLighting(lightingPreview.levels, automaticLevel, id => lightingPreview.getSwitchLevel(id));
    const level = automaticLevel ?? 1;
    for (const record of rendered.values()) if (record.group.userData.previewLamp) scalePracticalProjection(record.group, level);
    for (const shell of [structure, wallPreview]) if (shell) for (const ceiling of shell.ceilings.children) updateCeilingIndirectLighting(ceiling, lightingPreview.getLightLevel(ceiling.userData.entityId));
    if (ceilingDesigns) {
      ceilingDesigns.visible = (view === 'inside' || layers.shell) && !wallPreview;
      updateCeilingDesignVisibility(ceilingDesigns, camera);
      updateCeilingDesignLighting(ceilingDesigns, id => lightingPreview.getLightLevel(id));
    }
  }
  function applyLayers(): void {
    for (const shell of [structure, wallPreview]) if (shell) {
      const visible = (view === 'inside' || layers.shell) && (!wallPreview || shell === wallPreview);
      shell.group.visible = visible; shell.ceilings.visible = visible;
      shell.dimensions.visible = view !== 'inside' && layers.dimensions && (!wallPreview || shell === wallPreview);
    }
    furniture.visible = layers.furniture;
    outgoingFurniture.visible = layers.furniture;
    for (const projection of [services, wallPreviewServices]) if (projection) {
      projection.group.visible = layers.services && (!wallPreviewServices || projection === wallPreviewServices);
      for (const component of projection.components.values()) {
        component.visible = layers.components;
        const clearance = component.userData.clearance as THREE.Object3D | undefined;
        if (clearance) clearance.visible = layers.clearances;
      }
      for (const route of projection.routes.values()) route.group.visible = layers[route.system];
    }
    annotations.visible = view !== 'inside' && layers.assumptions && !wallPreview; if (comparison) comparison.visible = view !== 'inside' && comparisonEnabled;
    blueprint.group.visible = view !== 'inside';
    const inside = view === 'inside';
    const unlitTop = view === 'top' && !topLightingEnabled;
    const daylight = unlitTop || sunSettings.timeOfDay == null ? 1 : timeOfDayLighting(sunSettings.timeOfDay).daylight;
    sunOccluders.group.visible = inside || layers.shell;
    shadowCache.invalidate();
    // The blueprint is the outside world in every editing view. Sky selection
    // changes illumination, while windows still look onto an outdoor backdrop.
    // Keep that backdrop separate so entering Inside never substitutes a new rig.
    const lightingSky = skyboxPreset !== 'studio' && view !== 'top' ? skyboxes.get(skyboxPreset, skySun) : null;
    const night = inside && daylight < 0.05;
    const backgroundSky = inside ? skyboxes.get(night ? 'twilight' : skyboxPreset === 'studio' ? 'daylight' : skyboxPreset, skySun) : null;
    world.background = backgroundSky?.background ?? (unlitTop ? blueprint.paperColor : blueprint.background);
    world.backgroundIntensity = backgroundSky ? night ? INSIDE_TWILIGHT : THREE.MathUtils.lerp(0.15, 1, daylight) : 1;
    world.fog = null;
    world.environment = lightingSky?.environment ?? environment.texture;
    world.environmentIntensity = THREE.MathUtils.lerp(0.008, lightingSky ? 0.35 : 0.4, daylight);
    // A light studio: soft sky above, warm paper below; after dusk a warm lamplit bounce.
    // Inside by day reads like an airy listing photo: brighter floor-to-ceiling bounce and a soft room fill.
    ambient.intensity = THREE.MathUtils.lerp(0.1, inside ? 0.6 : 0.42, daylight);
    ambient.color.set('#dfe4ec').lerp(eveningSky, 1 - daylight);
    ambient.groundColor.set(inside ? '#cbb9a3' : '#a89580').lerp(eveningGround, 1 - daylight);
    eveningLights.setLevel(unlitTop ? 0 : inside ? THREE.MathUtils.lerp(1, 0.3, daylight) : 1 - daylight);
    const sun = effectiveSunlight(sunSettings);
    sunlight.color.set(sun.sunColor); sunlight.intensity = sun.sunIntensity;
    // Keep the studio readable without painting false pools of sunlight through walls.
    // Intensity only: hiding a light changes every material's program (a full recompile hitch).
    fill.intensity = 0.08 * daylight; rim.intensity = 0.12 * daylight;
    warmPool.visible = secondPool.visible = false;
    applyPracticalLighting();
    renderer.toneMappingExposure = inside ? THREE.MathUtils.lerp(1.02, 1.2, daylight) : 1.02;
    renderer.toneMapping = unlitTop ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    // Unlit Top bypasses lighting in the shader; toggling shadowMap.enabled would recompile every material.
    renderer.shadowMap.enabled = true;
    scheduleWarmUp();
  }
  function updateEndpointHandles(): void {
    for (const child of [...endpointHandles.children]) disposeObject(child);
    const wall = documentState?.walls.find(item => item.id === selectedId);
    if (view === 'inside' || !wall || tool !== 'move' || !callbacks.onWallEndpoint || !layers.shell || selectedIds.length > 1 || additiveSelection || documentState?.project?.metadata[wall.id]?.locked) return;
    const elevation = documentState?.project?.metadata[wall.id]?.elevation ?? 0;
    for (const endpoint of ['start', 'end'] as const) {
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), new THREE.MeshBasicMaterial({ color: endpoint === 'start' ? '#c18148' : '#376b81', depthTest: false }));
      handle.position.set(wall[endpoint][0], elevation + 0.15, wall[endpoint][1]); handle.renderOrder = 950;
      handle.userData.wallEndpoint = endpoint; endpointHandles.add(handle);
    }
  }
  function updateOpeningHandle(): void {
    if (selectedId && documentState && (openingMoveCache?.scene !== documentState || openingMoveCache.id !== selectedId)) {
      openingMoveCache = { scene: documentState, id: selectedId, context: findOpeningMove(documentState, selectedId) };
    }
    const context = selectedId && documentState ? openingMoveCache?.context : undefined;
    const transformedWindow = context?.opening.kind === 'window' && callbacks.onOpeningTransform;
    openingHandle.visible = Boolean(view !== 'inside' && context && !transformedWindow && tool === 'move' && callbacks.onOpeningMove && layers.shell && walls !== 'hidden');
    const windowContext = windowTransformContext();
    if (windowContext) windowHandles.update(windowContext.wall, openingDrag?.dimensions ?? windowContext.opening, documentState?.project?.metadata[windowContext.wall.id]?.elevation ?? 0, camera, width, height, windowVerticalAvailable(windowContext), openingDrag?.mode);
    else windowHandles.hide();
    if (!context || !openingHandle.visible) return;
    const { wall, opening } = context;
    const offset = openingDrag?.offset ?? opening.offset;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    const elevation = documentState?.project?.metadata[wall.id]?.elevation ?? 0;
    openingHandle.position.set(wall.start[0] + dx / length * (offset + opening.width / 2), elevation + opening.sill + opening.height / 2, wall.start[1] + dz / length * (offset + opening.width / 2));
    openingHandle.rotation.y = -Math.atan2(dz, dx);
    openingHandle.updateMatrixWorld(true);
  }
  function windowTransformContext(): OpeningTransformContext | undefined {
    if (!documentState || !selectedId || !callbacks.onOpeningTransform || view === 'inside' || !layers.shell || walls === 'hidden' || additiveSelection || selectedIds.length > 1) return;
    if (windowContextCache?.scene !== documentState || windowContextCache.id !== selectedId) {
      windowContextCache = { scene: documentState, id: selectedId, context: findOpeningTransform(documentState, selectedId) };
    }
    return windowContextCache.context;
  }
  function windowVerticalAvailable(context: OpeningTransformContext): boolean {
    if (view === 'top') return false;
    const { wall } = context;
    const normal = new THREE.Vector3(wall.end[1] - wall.start[1], 0, wall.start[0] - wall.end[0]).normalize();
    return Math.abs(normal.dot(camera.getWorldDirection(new THREE.Vector3()))) > 0.12;
  }
  function startWindowDrag(event: PointerEvent, requestedMode: OpeningTransformMode, body = false): void {
    if (event.button !== 0 || event.shiftKey || additiveSelection || drag || endpointDrag || openingDrag || wallMove.active) return;
    const context = windowTransformContext();
    if (!context) return;
    const vertical = windowVerticalAvailable(context);
    const mode = requestedMode === 'move' && !vertical ? 'move-x' : requestedMode;
    if (!vertical && mode !== 'move-x' && mode !== 'left' && mode !== 'right') return;
    cameraMotion.cancel('camera'); keyboardNavigation.cancel();
    const { wall, opening } = context;
    const axis = new THREE.Vector3(wall.end[0] - wall.start[0], 0, wall.end[1] - wall.start[1]).normalize();
    const normal = mode === 'move-x' || mode === 'left' || mode === 'right' ? camera.getWorldDirection(new THREE.Vector3()) : new THREE.Vector3().crossVectors(axis, upAxis);
    normal.addScaledVector(axis, -normal.dot(axis));
    if (normal.lengthSq() < 1e-6) return;
    const center = new THREE.Vector3(wall.start[0], documentState?.project?.metadata[wall.id]?.elevation ?? 0, wall.start[1]).addScaledVector(axis, opening.offset + opening.width / 2);
    center.y += opening.sill + opening.height / 2;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), center);
    pointerRay(event);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return;
    openingDrag = { context, transformContext: context, mode, axis, plane, startAlong: point.dot(axis), startUp: point.y,
      offset: opening.offset, dimensions: { offset: opening.offset, sill: opening.sill, width: opening.width, height: opening.height },
      pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, testOnClick: body && tool === 'select' };
    pointerStart = null; orbit.enabled = false; suppressPick = true;
    renderer.domElement.focus({ preventScroll: true }); renderer.domElement.style.cursor = 'grabbing';
    callbacks.onInteraction(true); renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault(); event.stopImmediatePropagation(); requestRender();
  }
  function setDoorAngle(id: string, angle: number): void {
    const opening = structure?.openings.get(id); if (!opening || opening.fixed || !Number.isFinite(angle)) return;
    opening.target = THREE.MathUtils.clamp(angle, 0, Math.PI / 2); doorAngles.set(id, opening.target);
    lastAnimation = performance.now(); requestRender();
  }
  function toggleSwitch(id: string): void {
    lightingPreview.toggleSwitch(id); applyPracticalLighting(); shadowCache.invalidate(); requestRender(); callbacks.onLightingChange?.();
  }
  function setSwitchLevel(id: string, level: number): void {
    lightingPreview.setSwitchLevel(id, level); applyPracticalLighting(); shadowCache.invalidate(); requestRender(); callbacks.onLightingChange?.();
  }
  function requestRender(): void {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      const now = performance.now(); const dt = Math.min((now - lastAnimation) / 1000, 0.06); lastAnimation = now;
      if (pendingModels.size) installLoadedModels(4);
      const geometryMoving = motion.update(now);
      let animating = geometryMoving;
      let shadowsChanged = geometryMoving;
      if (cameraMotion.update(now)) animating = true;
      if (keyboardNavigation.update(now)) animating = true;
      if (placementMotion.update(now)) { animating = true; shadowsChanged = true; }
      if (updateAssemblies(now)) { animating = true; shadowsChanged = true; }
      // SunOccluders keep the intact shell in the sun's map, so cutaway fades reuse cached shadows.
      if (structure?.updateWalls(camera, view === 'inside' ? 'full' : walls, view === 'top', now, motion.reduced, selectedId ?? undefined)) animating = true;
      if (walk.update(now)) animating = true;
      if (documentState && view === 'inside') {
        const occupied = ceilingDesignRoomAt(documentState, insideCamera.position.toArray());
        if (occupied !== ceilingRoomId) {
          ceilingRoomId = occupied;
          if (ceilingDesigns) disposeObject(ceilingDesigns);
          ceilingDesigns = makeCeilingDesigns(documentState, occupied); world.add(ceilingDesigns);
          applyPracticalLighting(); shadowCache.invalidate();
        }
      }
      wallMove.render();
      if (structure?.updateFinishes(now)) animating = true;
      for (const [id, opening] of structure?.openings ?? []) {
        if (Math.abs(opening.target - opening.angle) > 0.001) {
          shadowsChanged = true;
          if (motion.reduced) { opening.setAngle(opening.target); sunOccluders.setDoorAngle(id, opening.angle); continue; }
          const step = Math.sign(opening.target - opening.angle) * Math.min(Math.abs(opening.target - opening.angle), Math.max(0.01, dt) * 4.2);
          opening.setAngle(opening.angle + step); animating = true;
        }
        sunOccluders.setDoorAngle(id, opening.angle);
        opening.setCollision(selectedId === id && collisionIssues.has(id));
      }
      if (selection && selectedId) { const chosen = entity(selectedId); if (chosen) selectionBounds(chosen, selection.box); }
      camera.updateMatrixWorld();
      if (ceilingDesigns && updateCeilingDesignVisibility(ceilingDesigns, camera)) shadowsChanged = true;
      updateOpeningHandle();
      const cameraChanged = renderedCamera !== camera || !cameraMatrix.equals(camera.matrixWorld) || !cameraProjection.equals(camera.projectionMatrix);
      renderedCamera = camera; cameraMatrix.copy(camera.matrixWorld); cameraProjection.copy(camera.projectionMatrix);
      // Reduced-motion cutaways can switch occluders in a single camera frame.
      if (cameraChanged && motion.reduced && view !== 'inside' && walls === 'cutaway') shadowCache.invalidate();
      shadowCache.update(shadowsChanged);
      if (motion.reduced) {
        clearTimeout(settleTimer); settleTimer = undefined; interactionUntil = 0;
      } else if (animating || cameraChanged || interactionChanged) {
        interactionUntil = now + 140;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { settleTimer = undefined; requestRender(); }, 145);
      }
      interactionChanged = false;
      studioRenderer.setInteracting(view !== 'top' && now < interactionUntil);
      if (animating) requestRender();
      // Resolve live roots, including wall-drag projections and loaded models.
      const selectedRoots = new Set<THREE.Object3D>();
      for (const id of selectedIds) {
        const shell = wallPreview ?? structure;
        const root = id === ceilingSelectionId
          ? shell?.ceilings.children.find(object => object.userData.entityId === id)
          : entity(id);
        if (root) selectedRoots.add(root);
      }
      studioRenderer.setSelection(view === 'inside' ? [] : [...selectedRoots]);
      try { renderScene(); for (const listener of frameListeners) listener(); }
      catch (error) {
        if (!renderFailed) { renderFailed = true; callbacks.onError(`The 3D view could not render: ${error instanceof Error ? error.message : 'unknown graphics error'}`); }
      }
    });
  }

  let warmTimer: ReturnType<typeof setTimeout> | undefined;
  /** Idle warm-up of first-use costs: the inside day/evening skies and the faded-wall/furniture programs. */
  function scheduleWarmUp(): void {
    if (disposed || warmTimer) return;
    warmTimer = setTimeout(() => {
      warmTimer = undefined;
      if (disposed) return;
      // A pending frame means something is animating; warm up only when the view is at rest.
      if (frame || loadingModels > 0 || pendingModels.size || drag || interactionUntil > performance.now()) { scheduleWarmUp(); return; }
      warmUp();
    }, 400);
  }
  const warmed = new WeakSet<THREE.Material>();
  function warmUp(): void {
    try {
      // One capture per preset is cached: pre-capture the other mood exactly as setLightingMood will ask for it.
      const night = sunSettings.timeOfDay != null && timeOfDayLighting(sunSettings.timeOfDay).daylight < 0.05;
      skyboxes.get('daylight', night ? effectiveSunlight(normalizeSun({ timeOfDay: 12, enabled: true }, sunSettings)) : skySun);
      skyboxes.get('twilight', night ? skySun : effectiveSunlight(normalizeSun({ timeOfDay: 22, enabled: false }, sunSettings)));
    } catch { /* The sky is captured again on use; a failure is reported there. */ }
    // Cutaway walls and entering furniture fade through transparent materials, a separate program.
    const flipped: THREE.Material[] = [];
    world.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.userData.studioAO === false) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.transparent || warmed.has(material)) continue;
        warmed.add(material); material.transparent = true; material.needsUpdate = true; flipped.push(material);
      }
    });
    if (!flipped.length) return;
    // Compile the whole world, not subtrees: a subtree's own lights would be counted twice.
    try { studioRenderer.compile(() => renderer.compile(world, camera)); }
    finally { for (const material of flipped) { material.transparent = false; material.needsUpdate = true; } }
  }

  function renderScene(): void {
    const started = perfProbe ? performance.now() : 0;
    if (perfProbe) { renderer.info.autoReset = false; renderer.info.reset(); }
    topLighting.prepare(world, view === 'top' && !topLightingEnabled);
    practicalLights.sync(world, camera);
    studioRenderer.render(camera);
    if (perfProbe) perfProbe.submits.push({ at: started, ms: performance.now() - started, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  }

  function selectionBounds(chosen: THREE.Object3D, target = new THREE.Box3()): THREE.Box3 {
    entityBounds(chosen, target);
    for (const id of selectedIds) {
      const member = entity(id);
      if (member && member !== chosen) target.union(entityBounds(member));
    }
    return target;
  }

  function furnitureTransformAllowed(): boolean {
    if (!documentState || !selectedId || !rendered.has(selectedId)) return false;
    const members = documentState.objects.filter(object => selectedFurnitureIds.includes(object.id));
    if (members.some(object => documentState?.project?.metadata[object.id]?.locked)) return false;
    if (members.length !== selectedIds.length) return false;
    return tool !== 'scale' || members.length < 2;
  }

  function updateSelection(): void {
    if (selection) { disposeObject(selection); selection = null; }
    transform.detach();
    const chosen = selectedId ? entity(selectedId) : undefined;
    if (chosen && view !== 'inside') {
      if (tool !== 'select' && !chosen.userData.selectionSurface) {
        selection = new SelectionFrame(selectionBounds(chosen));
        world.add(selection);
      }
      if (!additiveSelection && tool !== 'select' && selectedId && (furnitureTransformAllowed() || (services?.components.has(selectedId) && callbacks.onComponentTransform))) {
        const component = services?.components.has(selectedId); transform.minY = component ? -50 : chosen.position.y; transform.maxY = component ? 50 : chosen.position.y;
        transform.showY = tool === 'rotate' || tool === 'scale' || (Boolean(component) && tool === 'move'); transform.attach(chosen);
      }
    }
    for (const [id, opening] of structure?.openings ?? []) {
      const envelope = opening.group.userData.envelope as THREE.Group; envelope.visible = view !== 'inside' && id === selectedId;
    }
    for (const [id, component] of services?.components ?? []) {
      const clearance = component.userData.clearance as THREE.Object3D | undefined; if (clearance) clearance.visible = layers.clearances;
    }
    updateEndpointHandles(); updateOpeningHandle(); wallMove.refresh(); shadowCache.invalidate(); requestRender();
  }

  function applyTransform(group: THREE.Group, object: SceneObject): void {
    group.position.fromArray(object.position);
    group.rotation.set(0, object.rotation, 0);
    group.scale.fromArray(object.scale);
    group.updateMatrixWorld(true);
  }

  const frameListeners = new Set<() => void>();
  let hiddenIds = new Set<string>();
  function applyHidden(): void { for (const [id, record] of rendered) record.group.visible = !hiddenIds.has(id); }
  const installedModels = new WeakSet<THREE.Object3D>();
  const furnitureSurface = createFurnitureSurfaceResolver(id => {
    const record = rendered.get(id), object = documentState?.objects.find(o => o.id === id);
    const asset = catalogState.find(a => a.id === object?.assetId);
    return record?.visual.children.find(child => installedModels.has(child) || asset?.source.type === 'procedural');
  });
  let furnitureCeiling: number | undefined;
  function pointerFurnitureSurface(exclude?: string): THREE.Vector3 | undefined {
    return furniturePointerSurface(raycaster, [...rendered].filter(([id]) => id !== exclude && (!exclude || !documentState || !isDescendant(documentState, id, exclude))).map(([, r]) => r.visual));
  }
  const assemblyWanted = new Set<string>();
  interface AssemblyPart { part: THREE.Object3D; y: number; lift: number }
  let assemblies: { parts: AssemblyPart[]; start: number; stagger: number }[] = [];
  const ASSEMBLY_PART_MS = 380;
  function startAssembly(model: THREE.Object3D, height: number): void {
    if (motion.reduced) return;
    const meshes: THREE.Object3D[] = [];
    model.traverse(child => { if (child instanceof THREE.Mesh) meshes.push(child); });
    if (meshes.length < 2) return;
    const box = new THREE.Box3(), scale = new THREE.Vector3();
    const parts = meshes.map(part => ({ part, y: part.position.y, bottom: box.setFromObject(part).min.y, lift: height * 0.7 / Math.max(1e-6, part.parent?.getWorldScale(scale).y ?? 1) }))
      .sort((a, b) => a.bottom - b.bottom).map(({ part, y, lift }) => ({ part, y, lift }));
    for (const { part } of parts) part.visible = false;
    assemblies.push({ parts, start: performance.now(), stagger: Math.min(140, 1400 / parts.length) });
    requestRender();
  }
  function updateAssemblies(now: number): boolean {
    if (!assemblies.length) return false;
    assemblies = assemblies.filter(assembly => {
      let active = false;
      assembly.parts.forEach(({ part, y, lift }, index) => {
        const k = Math.min(1, Math.max(0, (now - assembly.start - index * assembly.stagger) / ASSEMBLY_PART_MS));
        part.visible = now >= assembly.start + index * assembly.stagger;
        part.position.y = y + lift * (1 - (1 - (1 - k) ** 3));
        if (k < 1) active = true;
      });
      return active && assembly.parts.every(({ part }) => part.parent);
    });
    return true;
  }

  /** A budget (ms) spreads a burst of arriving models, with their texture uploads, over several frames. */
  function installLoadedModels(budget = Infinity): void {
    if (drag) return;
    const started = performance.now();
    for (const [id, pending] of pendingModels) {
      if (performance.now() - started > budget) { requestRender(); break; }
      pendingModels.delete(id);
      const current = rendered.get(id);
      if (disposed || !current || current.token !== pending.token) { disposeObject(pending.model); continue; }
      if (budget !== Infinity) pending.model.traverse(child => {
        if (child instanceof THREE.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) renderer.initTexture(value);
        }
      });
      for (const child of [...current.visual.children]) disposeObject(child);
      current.visual.add(pending.model); installedModels.add(pending.model);
      const object = documentState?.objects.find(o => o.id === id), asset = catalogState.find(a => a.id === object?.assetId);
      if (object && asset) poseWallDecoration(pending.model, asset, object);
      if (assemblyWanted.delete(id)) startAssembly(pending.model, current.dimensions[1]);
      if (pending.color) pending.model.traverse(child => {
        if (child instanceof THREE.Mesh) for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
          if (mat instanceof THREE.MeshStandardMaterial) mat.color.set(pending.color!);
        }
      });
    }
    applyPracticalLighting(); shadowCache.invalidate();
    updateSelection(); requestRender();
  }

  function finishDrag(cancel: boolean): void {
    if (!drag) return;
    const previous = drag;
    const group = previous.component ? services?.components.get(previous.id) : rendered.get(previous.id)?.group;
    const releasedPosition = group?.position.clone();
    const releaseHeight = rendered.get(previous.id)?.visual.position.y ?? 0;
    const releaseScale = rendered.get(previous.id)?.visual.scale.clone();
    placementMotion.stop(previous.id);
    const queued = pendingScene;
    pendingScene = null;
    const generationBeforeCommit = sceneGeneration;
    drag = null;
    if (previous.body) {
      transform.enabled = true;
      renderer.domElement.style.cursor = '';
      pointerStart = null;
      if (renderer.domElement.hasPointerCapture(previous.body.pointerId)) renderer.domElement.releasePointerCapture(previous.body.pointerId);
    }
    placementFeedback.clear();
    transform.dragging = false;
    orbit.enabled = true;
    suppressPick = true;
    if (group && cancel) {
      for (const member of previous.members ?? []) { const root = rendered.get(member.id)?.group; if (root) applyTransform(root, member); }
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
        const patch: ObjectPatch = tool === 'move' ? { position: [group.position.x, group.position.y, group.position.z] }
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
    for (const member of previous.members ?? []) {
      const root = rendered.get(member.id)?.group, current = documentState?.objects.find(object => object.id === member.id);
      if (root && current) applyTransform(root, current);
    }
    for (const object of documentState?.objects ?? []) if (object.restsOn) { const root = rendered.get(object.id)?.group; if (root) applyTransform(root, object); }
    if (pendingModels.size) installLoadedModels();
    // A rejected/canceled/no-op drag must never play a successful landing.
    const record = rendered.get(previous.id);
    if (!cancel && !previous.component && (previous.members?.length ?? 1) < 2 && tool === 'move' && record && committed && releasedPosition
      && releasedPosition.distanceToSquared(previous.position) > 1e-10
      && record.group.position.distanceToSquared(releasedPosition) < 1e-10) {
      record.visual.position.y = releaseHeight;
      if (releaseScale) record.visual.scale.copy(releaseScale);
      placementMotion.land(previous.id, record.visual, record.dimensions);
    }
    // Cancellation, rejected edits and grouped/component restores may have no
    // placement animation to refresh the maps after the preview was rendered.
    shadowCache.invalidate();
    requestRender();
  }

  function startDrag(): void {
    if (!selectedId) return;
    const component = callbacks.onComponentTransform ? documentState?.project?.components.find(item => item.id === selectedId) : undefined;
    const group = rendered.get(selectedId)?.group ?? (component ? services?.components.get(selectedId) : undefined);
    if (!group || (!component && !furnitureTransformAllowed())) return;
    keyboardNavigation.cancel();
    const members = !component && documentState ? documentState.objects.filter(object => selectedFurnitureIds.includes(object.id)) : undefined;
    motion.finish(group); cameraMotion.cancel('camera');
    for (const member of members ?? []) { const root = rendered.get(member.id)?.group; if (root) motion.finish(root); }
    furnitureCeiling = undefined;
    drag = { members, component, id: selectedId, position: group.position.clone(), quaternion: group.quaternion.clone(), scale: group.scale.clone() };
    const record = rendered.get(selectedId);
    if (!component && (members?.length ?? 1) < 2 && tool === 'move' && record) placementMotion.lift(selectedId, record.visual, record.dimensions);
    else placementMotion.stop(selectedId);
    suppressPick = true; orbit.enabled = false; callbacks.onInteraction(true);
    updatePlacementFeedback();
  }

  function startFurnitureBodyDrag(event: PointerEvent): boolean {
    if (event.button !== 0 || tool !== 'move' || drag || event.shiftKey || additiveSelection) return false;
    pointerRay(event);
    // Refresh from this press rather than trusting the previous hover position.
    // Visible gizmo handles retain their existing constrained-axis gestures.
    // Three consumes its internal normalized pointer shape here; its declaration
    // still names the DOM event type.
    transform.pointerHover({ x: pointer.x, y: pointer.y, button: event.button } as PointerEvent);
    if (transform.enabled && transform.object && transform.axis !== null) return false;
    const hit = pickEntity();
    if (!hit || !rendered.has(hit.id)) return false;
    if (!selectedFurnitureIds.includes(hit.id)) callbacks.onSelect(hit.id);
    if (!selectedFurnitureIds.includes(hit.id) || !furnitureTransformAllowed()) return false;
    const plane = new THREE.Plane(upAxis, -hit.point.y);
    const origin = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!origin) return false;
    startDrag();
    // Selection is host-controlled; a read-only host may decline the gesture.
    const gesture = drag as DragSnapshot | null;
    if (!gesture) return false;
    gesture.body = { pointerId: event.pointerId, plane, origin, x: event.clientX, y: event.clientY, moved: false };
    // Native TransformControls must not release this gesture's capture on up.
    transform.enabled = false;
    pointerStart = null;
    renderer.domElement.style.cursor = 'grabbing';
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault(); event.stopImmediatePropagation();
    return true;
  }

  function moveFurnitureBody(event: PointerEvent): boolean {
    const gesture = drag, body = gesture?.body;
    if (!gesture || !body) return false;
    if (event.pointerId !== body.pointerId) return true;
    if (!body.moved && Math.hypot(event.clientX - body.x, event.clientY - body.y) <= 3) return true;
    pointerRay(event);
    const point = raycaster.ray.intersectPlane(body.plane, new THREE.Vector3());
    const group = rendered.get(gesture.id)?.group;
    if (!point || !group) return true;
    body.moved = true;
    const original = documentState?.objects.find(o => o.id === gesture.id), asset = catalogState.find(a => a.id === original?.assetId);
    const surface = asset && canRestOnFurniture(asset) ? pointerFurnitureSurface(gesture.id) : undefined;
    furnitureCeiling = surface ? surface.y + .02 : undefined;
    const x = surface?.x ?? gesture.position.x + point.x - body.origin.x, z = surface?.z ?? gesture.position.z + point.z - body.origin.z;
    group.position.set(snapEnabled ? Math.round(x * 4) / 4 : x, gesture.position.y, snapEnabled ? Math.round(z * 4) / 4 : z);
    changedTransform();
    return true;
  }

  function updatePlacementFeedback(): void {
    if (!drag || drag.component || !documentState) { placementFeedback.clear(); return; }
    const original = documentState.objects.find(object => object.id === drag!.id);
    const group = rendered.get(drag.id)?.group;
    if (!original || !group) { placementFeedback.clear(); return; }
    let candidate: SceneObject = {
      ...original,
      position: [group.position.x, group.position.y, group.position.z],
      rotation: yawOf(group.quaternion),
      scale: [group.scale.x, group.scale.y, group.scale.z],
    };
    try { candidate = placeFurniture(documentState, catalogState, candidate, undefined, furnitureSurface, furnitureCeiling); } catch { /* feedback remains available */ }
    const updates = (drag.members ?? [original]).map(member => {
      const root = rendered.get(member.id)?.group;
      if (member.id === candidate.id) return candidate;
      return root ? { ...member, position: root.position.toArray() as SceneObject['position'], rotation: yawOf(root.quaternion), scale: root.scale.toArray() as SceneObject['scale'] } : member;
    });
    const byId = new Map(updates.map(object => [object.id, object]));
    const preview = { ...documentState, objects: documentState.objects.map(object => structuredClone(byId.get(object.id) ?? object)) };
    followSupports(documentState, preview, new Set(updates.map(o => o.id)), catalogState);
    for (const object of preview.objects) if (!byId.has(object.id) && object.restsOn) { const root = rendered.get(object.id)?.group; if (root) applyTransform(root, object); }
    placementFeedback.update(updates.length > 1 ? updates.flatMap(object => placementConflicts(preview, catalogState, object)) : placementConflicts(documentState, catalogState, candidate));
  }

  function changedTransform(): void {
    const group = transform.object;
    if (group && drag) {
      if (!drag.component) {
        group.position.y = drag.position.y;
        const original = documentState?.objects.find(o => o.id === drag!.id);
        const asset = catalogState.find(a => a.id === original?.assetId);
        if (original && asset && documentState) {
          try {
            const mounted = placeFurniture(documentState, catalogState, { ...original, position: group.position.toArray() as SceneObject['position'] }, undefined, furnitureSurface, furnitureCeiling);
            group.position.fromArray(mounted.position); if (mounted.host) group.rotation.y = mounted.rotation;
          } catch { /* Release reports the unavailable wall through the command boundary. */ }
        }
      }
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
      if (!drag.component && documentState && (drag.members?.length ?? 0) > 1) {
        const patch: ObjectPatch = tool === 'rotate' ? { rotation: yawOf(group.quaternion) } : { position: group.position.toArray() as SceneObject['position'] };
        for (const object of selectionFurnitureUpdates(documentState, drag.id, patch, drag.members!.map(member => member.id))) {
          const member = rendered.get(object.id)?.group; if (member) applyTransform(member, object);
        }
      }
      updatePlacementFeedback(); shadowCache.invalidate(); interactionChanged = true;
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

  /** Components with a catalog asset show its model once loaded; until then, or if it fails, the procedural shape stays. */
  function loadComponentModels(projection: ServiceProjection, scene: SceneDocument, catalogById: ReadonlyMap<string, CatalogAsset>): void {
    for (const component of scene.project?.components ?? []) {
      const asset = component.assetId ? catalogById.get(component.assetId) : undefined;
      if (!asset) continue;
      void loader.load({ ...asset, dimensions: component.dimensions }).then(model => {
        const group = projection.components.get(component.id);
        if (disposed || services !== projection || !group) { disposeObject(model); return; }
        installComponentModel(group, component, model); shadowCache.invalidate(); requestRender();
      }).catch(error => {
        if (!disposed && services === projection) callbacks.onError(`Could not load ${asset.name}; showing ${component.name} as drawn. ${error instanceof Error ? error.message : ''}`);
      });
    }
  }

  /** Openings with a catalog model show it once loaded; until then, or if it fails, the procedural opening stays. */
  function loadOpeningModels(projection: StructureProjection, scene: SceneDocument): void {
    for (const wall of scene.walls) for (const opening of wall.openings) {
      const found = openingModel(opening.assetId), target = projection.openings.get(opening.id);
      if (!found || !target) continue;
      let token = 0;
      const install = (shape: Opening) => {
        const mine = ++token;
        void loader.loadAuthored(found.url).then(model => {
          // A later resize preview superseded this load, or the structure was replaced.
          if (disposed || structure !== projection || mine !== token) { disposeObject(model); return; }
          installOpeningModel(target, shape, scene.project?.metadata?.[opening.id] ?? {}, found.entry, model);
          shadowCache.invalidate(); requestRender();
        }).catch(error => {
          if (!disposed && structure === projection) callbacks.onError(`Could not load the ${opening.kind} model; showing it as drawn. ${error instanceof Error ? error.message : ''}`);
        });
      };
      target.rebuilt = install; install(opening);
    }
  }

  function setScene(next: SceneDocument, catalog: CatalogAsset[]): void {
    // A replacement or catalog refresh invalidates the library gesture's snapshot.
    furnitureDrop.cancel();
    if (disposed) return;
    if (drag || endpointDrag || openingDrag || wallMove.active) { pendingScene = { scene: next, catalog }; return; }
    const previousObjects = new Map(documentState?.objects.map(object => [object.id, object]));
    const animate = initialized && documentState?.id === next.id;
    if (documentState?.id !== next.id) ceilingSelectionId = null;
    sceneGeneration++;
    lightingPreview.setScene(next);
    documentState = next; catalogState = catalog;
    const nextKey = JSON.stringify([next.rooms, next.walls, next.project?.metadata, next.project?.finishes, next.project?.materials]);
    if (structureKey !== nextKey) {
      if (structure) { disposeObject(structure.group); disposeObject(structure.ceilings); disposeObject(structure.dimensions); }
      if (ceilingDesigns) disposeObject(ceilingDesigns);
      ceilingDesigns = makeCeilingDesigns(next, ceilingRoomId); world.add(ceilingDesigns);
      structure = makeStructure(next, pendingFinishReveal, { openingAssets, onAssetReady() { shadowCache.invalidate(); updateSelection(); requestRender(); } }); pendingFinishReveal = undefined;
      sunOccluders.setScene(next);
      eveningLights.setRooms(eveningRooms(next));
      structureKey = nextKey; world.add(structure.group, structure.ceilings, structure.dimensions);
      loadOpeningModels(structure, next);
      for (const [id, opening] of structure.openings) { const angle = opening.fixed ? 0 : doorAngles.get(id) ?? 0; if (opening.fixed) doorAngles.delete(id); opening.target = angle; opening.setAngle(angle); }
      for (const id of doorAngles.keys()) if (!structure.openings.has(id)) doorAngles.delete(id);
      structure.bounds.getCenter(center); structure.bounds.getSize(size);
      blueprint.update(structure.bounds);
      // Follow imported/off-origin shells, keeping the same light direction at any scale.
      const lightScale = Math.max(size.length(), 6) / 13;
      const shadowBounds = structure.bounds.clone().union(new THREE.Box3().setFromObject(sunOccluders.group));
      fitSunShadow(sunlight, shadowBounds, sunSettings);
      fill.target.position.copy(center);
      fill.position.copy(center).addScaledVector(new THREE.Vector3(8, 5, 3), lightScale);
      rim.target.position.copy(center);
      rim.position.copy(center).addScaledVector(new THREE.Vector3(1, 9, -9), lightScale);
      warmPool.position.set(center.x - size.x * 0.29, structure.bounds.min.y + Math.max(4.5, size.y * 1.5), center.z + size.z * 0.15);
      warmPool.target.position.set(center.x - size.x * 0.28, structure.bounds.min.y, center.z - size.z * 0.15);
      secondPool.position.set(center.x + size.x * 0.25, structure.bounds.min.y + Math.max(4.2, size.y * 1.4), center.z + size.z * 0.28);
      secondPool.target.position.set(center.x + size.x * 0.24, structure.bounds.min.y, center.z + size.z * 0.14);
      warmPool.intensity = 75 * lightScale * lightScale;
      secondPool.intensity = 24 * lightScale * lightScale;
    }
    const catalogById = new Map(catalog.map(asset => [asset.id, asset]));
    const componentAssets = (next.project?.components ?? []).map(component => component.assetId ? catalogById.get(component.assetId) ?? null : null);
    const nextServiceKey = JSON.stringify([next.project?.components, next.project?.routes, next.walls, next.project?.finishes, next.project?.materials, componentAssets]);
    if (serviceKey !== nextServiceKey) {
      if (services) disposeObject(services.group);
      services = makeServices(next); serviceKey = nextServiceKey; world.add(services.group);
      loadComponentModels(services, next, catalogById);
    }
    const existingIds = new Set(next.objects.map(object => object.id));
    for (const [id, record] of rendered) if (!existingIds.has(id)) {
      placementMotion.stop(id);
      motion.sample(record.group); motion.cancel(record.group);
      motion.sample(record.pose); motion.cancel(record.pose);
      if (transform.object === record.group) transform.detach();
      rendered.delete(id);
      if (animate && !motion.reduced) {
        outgoingFurniture.add(record.group); retiring.add(record.group);
        const fromOpacity = record.opacity;
        motion.animate(record.pose, MOTION.surface, t => setProjectionOpacity(record.group, fromOpacity * (1 - t)), () => {
          retiring.delete(record.group); disposeObject(record.group);
        });
      } else disposeObject(record.group);
    }
    for (const object of next.objects) {
      const asset = catalogById.get(object.assetId);
      if (!asset) continue;
      const previous = previousObjects.get(object.id);
      const transformChanged = previous && (previous.rotation !== object.rotation
        || previous.position.some((value, axis) => value !== object.position[axis])
        || previous.scale.some((value, axis) => value !== object.scale[axis]));
      if (transformChanged) placementMotion.stop(object.id);
      const signature = JSON.stringify([asset, object.color]);
      let record = rendered.get(object.id);
      let created = false;
      if (!record || record.signature !== signature) {
        placementMotion.stop(object.id);
        if (record) { motion.cancel(record.group); motion.cancel(record.pose); if (transform.object === record.group) transform.detach(); disposeObject(record.group); }
        // Keep the authoritative transform on the root; only this inner visual moves.
        const group = new THREE.Group();
        const pose = new THREE.Group(); pose.name = 'Committed edit motion'; pose.matrixAutoUpdate = false;
        const visual = new THREE.Group();
        visual.add(makeFurniture(asset, object.color ?? asset.color)); pose.add(visual); group.add(pose);
        if (asset.kind === 'lamp') {
          group.userData.previewLamp = true;
          const practical = new THREE.PointLight('#ffb968', 10, 4, 2);
          practical.position.y = asset.dimensions[1] * 0.8;
          pose.add(practical);
        }
        group.userData.objectId = object.id;
        group.name = object.name;
        record = { group, pose, visual, signature, token: {}, dimensions: [...asset.dimensions], opacity: 1 }; created = true;
        rendered.set(object.id, record); furniture.add(group);
        if (asset.source.type === 'gltf') {
          const token = record.token;
          loadingModels++;
          // Compile the model's programs off the frame before it appears (parallel shader compile).
          void loader.load(asset).then(model => (topLighting.wrap(model), studioRenderer.compile(() => renderer.compileAsync(model, camera, world)).catch(() => undefined).then(() => model)))
            .finally(() => { loadingModels--; }).then(model => {
            const current = rendered.get(object.id);
            if (disposed || !current || current.token !== token) { disposeObject(model); return; }
            // Do not detach or resize a manipulation target while its pointer gesture is live.
            const stale = pendingModels.get(object.id);
            if (stale) disposeObject(stale.model);
            pendingModels.set(object.id, { model, token, color: object.color });
            requestRender();
          }).catch(error => {
            if (!disposed) callbacks.onError(`Could not load ${asset.name}; showing its measured bounds. ${error instanceof Error ? error.message : ''}`);
          });
        }
      }
      for (const model of record.visual.children) poseWallDecoration(model, asset, object);
      record.group.name = object.name;
      if (created || transformChanged || !animate) transitionTransform(motion, record.group, record.pose, object, animate && !created);
      else applyTransform(record.group, object);
      if (created && animate) {
        const entering = record;
        motion.animate(record.pose, MOTION.surface, t => { entering.opacity = t; setProjectionOpacity(entering.group, t); });
      }
    }
    rebuildAnnotations(); rebuildComparison(catalog);
    // Door-swing warnings only tint a selected door; analyse after this frame, not inside the edit's task.
    clearTimeout(collisionTimer);
    collisionTimer = setTimeout(() => {
      if (disposed || documentState !== next) return;
      collisionIssues = new Set(analyzeProject(next, catalog).issues.filter(issue => issue.id.startsWith('swing:') || issue.id.startsWith('swing-wall:')).map(issue => issue.entityId).filter((id): id is string => Boolean(id)));
      requestRender();
    }, 32);
    if (selectedId && !entity(selectedId)) selectedId = null;
    selectedFurnitureIds = expandFurnitureSelection(next, selectedFurnitureIds);
    applyLayers(); updateSelection(); applyHidden();
    if (!initialized) { initialized = true; focus(undefined, false); }
    if (view === 'inside') {
      const spawn = findWalkSpawn(next, catalog, { point: [insideCamera.position.x, insideCamera.position.z] });
      if (spawn) { insideCamera.position.fromArray(spawn.position); openWalkDoors(); }
      else {
        setView(outsideView?.view ?? 'perspective'); callbacks.onViewChange?.(view);
        callbacks.onError('This layout has no clear standing space for Inside view.');
      }
    }
    requestRender();
  }

  function walkSpawn(id?: string) {
    if (!documentState) return null;
    if (id && documentState.rooms.some(room => room.id === id)) return findWalkSpawn(documentState, catalogState, { roomId: id });
    const chosen = id ? entity(id) : undefined;
    const point = chosen ? entityBounds(chosen).getCenter(new THREE.Vector3()) : orbit.target;
    return findWalkSpawn(documentState, catalogState, { point: [point.x, point.z] });
  }
  function openWalkDoors(): void {
    for (const wall of documentState?.walls ?? []) for (const door of wall.openings) {
      const projection = structure?.openings.get(door.id);
      if (door.kind !== 'door' || !projection || projection.fixed) continue;
      if (!previousDoorAngles.has(door.id)) previousDoorAngles.set(door.id, projection.target);
      projection.target = Math.PI / 2; projection.setAngle(Math.PI / 2); doorAngles.set(door.id, Math.PI / 2);
    }
  }
  function setView(next: ViewMode): boolean {
    if (next === view) return true;
    const spawn = next === 'inside' ? walkSpawn(selectedId ?? undefined) : null;
    if (next === 'inside' && !spawn) {
      callbacks.onError('No clear standing space was found. Inside view needs a room with at least 1.8 m headroom.'); return false;
    }
    onPointerCancel();
    cameraMotion.sample('camera'); cameraMotion.cancel('camera');
    if (next === 'inside') {
      outsideView = { view, position: camera.position.clone(), quaternion: camera.quaternion.clone(), target: orbit.target.clone(), zoom: camera.zoom };
      previousDoorAngles = new Map(); view = next; camera = insideCamera;
      insideCamera.position.fromArray(spawn!.position); insideCamera.lookAt(new THREE.Vector3(...spawn!.target));
      orbit.enabled = false; transform.enabled = false; transform.camera = camera;
      finishInteraction.setBrush(null); openWalkDoors();
      renderer.domElement.setAttribute('aria-label', 'Inside apartment. Eye height 1.65 metres above the floor. Drag to look around. W A S D or arrow keys to walk. Escape to leave Inside.');
      walk.setEnabled(true);
    } else {
      const leavingInside = view === 'inside';
      const previousPosition = camera.position.clone();
      walk.setEnabled(false); view = next;
      camera = next === 'top' ? orthographic : perspective;
      orbit.object = camera; transform.camera = camera; orbit.enabled = true; transform.enabled = true;
      orbit.enableRotate = next !== 'top'; orbit.minPolarAngle = next === 'top' ? 0 : 0.002;
      orbit.maxPolarAngle = Math.PI / 2 - (next === 'top' ? 0.05 : 0.03);
      orbit.mouseButtons.LEFT = next === 'top' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      if (leavingInside) {
        for (const [id, angle] of previousDoorAngles) {
          const projection = structure?.openings.get(id); if (!projection) continue;
          projection.target = angle; projection.setAngle(angle); doorAngles.set(id, angle);
        }
        previousDoorAngles.clear(); renderer.domElement.setAttribute('aria-label', orbitLabel);
      }
      if (leavingInside && outsideView?.view === next) {
        camera.position.copy(outsideView.position); camera.quaternion.copy(outsideView.quaternion);
        camera.zoom = outsideView.zoom; camera.updateProjectionMatrix(); orbit.target.copy(outsideView.target); orbit.update();
      } else { camera.position.copy(previousPosition); focus(); }
      outsideView = null;
    }
    // Entering a room is immediate: flying through exterior walls is disorienting.
    structure?.updateWalls(camera, view === 'inside' ? 'full' : walls, view === 'top', performance.now(), true);
    applyLayers(); updateSelection(); requestRender(); return true;
  }

  function setTool(next: ToolMode): void {
    handPan.cancel();
    furnitureDrop.cancel();
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

  function revealSelection(available: ScreenRect): void {
    if (disposed || view === 'inside' || drag || endpointDrag || openingDrag || wallMove.active || furnitureDrop.active || orbitWasActive || handPan.active || keyboardNavigation.active) return;
    cameraMotion.sample('camera'); cameraMotion.cancel('camera');
    const chosen = selectedId ? entity(selectedId) : undefined;
    if (!chosen) return;
    const room = documentState?.rooms.find(item => item.id === selectedId);
    if (room) {
      const metadata = documentState?.project?.metadata[room.id];
      const bounds = entityBounds(chosen);
      bounds.max.y = (metadata?.elevation ?? 0) + roomCeilingHeight(documentState!, room);
      const frame = roomCameraFrame(camera, bounds, { width, height }, available);
      if (!frame || (camera.position.distanceToSquared(frame.position) < 1e-12
        && orbit.target.distanceToSquared(frame.target) < 1e-12 && Math.abs(camera.zoom - frame.zoom) < 1e-9)) return;
      const fromPosition = camera.position.clone(), fromTarget = orbit.target.clone(), fromZoom = camera.zoom;
      const framingCamera = camera;
      const distance = frame.position.distanceTo(frame.target);
      orbit.maxDistance = Math.max(65, distance * 2);
      framingCamera.far = Math.max(250, distance * 4);
      // Rooms get a deliberate dolly and pan; ordinary objects retain minimal reveal.
      cameraMotion.animate('camera', 650, t => {
        framingCamera.position.lerpVectors(fromPosition, frame.position, t);
        orbit.target.lerpVectors(fromTarget, frame.target, t);
        framingCamera.zoom = fromZoom + (frame.zoom - fromZoom) * t;
        framingCamera.updateProjectionMatrix();
        framingCamera.lookAt(orbit.target); orbit.update();
      });
      return;
    }
    const offset = selectionCameraOffset(camera, selectionBounds(chosen), { width, height }, available);
    if (offset.lengthSq() < 1e-12) return;
    const fromPosition = camera.position.clone(), fromTarget = orbit.target.clone();
    const framingCamera = camera;
    cameraMotion.animate('camera', MOTION.camera, t => {
      framingCamera.position.copy(fromPosition).addScaledVector(offset, t);
      orbit.target.copy(fromTarget).addScaledVector(offset, t);
      orbit.update();
    });
  }

  function focus(id?: string, animate = true): void {
    handPan.cancel(); keyboardNavigation.cancel();
    if (view === 'inside') {
      const spawn = walkSpawn(id);
      if (spawn) { insideCamera.position.fromArray(spawn.position); insideCamera.lookAt(new THREE.Vector3(...spawn.target)); walk.orient(); requestRender(); }
      else callbacks.onError('No clear standing space was found. Choose another room or adjust the layout.');
      return;
    }
    cameraMotion.sample('camera');
    const fromPosition = camera.position.clone(), fromTarget = orbit.target.clone(), fromZoom = camera.zoom;
    const chosen = id ? entity(id) : undefined;
    if (chosen) {
      entityBounds(chosen, box);
      if (documentState && id) for (const member of furnitureMembers(documentState, id)) { const root = rendered.get(member.id)?.group; if (root) box.union(entityBounds(root)); }
      if (id === selectedId) selectionBounds(chosen, box);
    }
    else if (structure) box.copy(structure.bounds);
    else box.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 1, 3));
    box.getCenter(center); box.getSize(size);
    if (!chosen) {
      const floorTarget = (structure?.bounds.min.y ?? 0) + 0.55;
      // Frame the apartment on its drafting ground, keeping the rooms prominent.
      center.y = view === 'top' ? floorTarget : THREE.MathUtils.lerp(floorTarget, center.y, 0.45);
    }
    const radius = Math.max(size.x, size.y, size.z, 1.2);
    orbit.target.copy(center);
    if (view === 'top') {
      camera.position.set(center.x, 25, center.z + 0.001);
      const span = Math.max(size.z, size.x / Math.max(width / height, 0.1), 2) * 1.25;
      orthographic.zoom = 16 / span;
      orthographic.updateProjectionMatrix();
    } else {
      // Fit all eight corners in the actual camera basis, including the diagonal footprint.
      const direction = new THREE.Vector3(0.95, 0.98, 1.35).normalize();
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
    const toPosition = camera.position.clone(), toTarget = orbit.target.clone(), toZoom = camera.zoom;
    const framingCamera = camera;
    cameraMotion.animate('camera', animate ? MOTION.camera : 0, t => {
      framingCamera.position.lerpVectors(fromPosition, toPosition, t);
      orbit.target.lerpVectors(fromTarget, toTarget, t);
      framingCamera.zoom = fromZoom + (toZoom - fromZoom) * t;
      framingCamera.updateProjectionMatrix();
      framingCamera.lookAt(orbit.target); orbit.update();
    });
  }

  function resize(): void {
    width = Math.max(container.clientWidth, 1); height = Math.max(container.clientHeight, 1);
    resizeTransformControls(transform, height);
    renderer.setSize(width, height, false);
    studioRenderer.setSize(width, height);
    perspective.aspect = width / height; perspective.updateProjectionMatrix();
    configureInsideCamera(insideCamera, width / height, insideLens);
    const aspect = width / height;
    orthographic.left = -8 * aspect; orthographic.right = 8 * aspect; orthographic.top = 8; orthographic.bottom = -8;
    orthographic.updateProjectionMatrix(); requestRender();
  }

  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  function pointerRay(event: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
  }
  function pickEntity(): { id: string; point: THREE.Vector3; ceiling: boolean } | undefined {
    const pickables: THREE.Object3D[] = [];
    for (const root of [furniture, structure?.group, structure?.ceilings, ceilingDesigns, services?.group, annotations]) if (root?.visible) root.traverseVisible(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) pickables.push(object);
    });
    for (const intersection of raycaster.intersectObjects(pickables, false)) {
      let parent: THREE.Object3D | null = intersection.object;
      while (parent && !parent.userData.objectId && !parent.userData.entityId) parent = parent.parent;
      const id = parent?.userData.objectId ?? parent?.userData.entityId;
      if (id) return { id: id as string, point: intersection.point,
        ceiling: parent?.userData.shellPart === 'ceiling' || parent?.userData.ceilingDesign === true };
    }
    return undefined;
  }
  function onPointerDown(event: PointerEvent): void {
    if (view === 'inside') return;
    // Locked: leave the press to orbit and pan, and never turn it into a pick.
    if (locked) { pointerStart = null; return; }
    if (furnitureDrop.active) { event.stopImmediatePropagation(); return; }
    // Navigation must stop before computing any captured shell gesture's ray.
    cameraMotion.cancel('camera');
    if (drag?.body || openingDrag || endpointDrag || wallMove.active) { event.stopImmediatePropagation(); return; }
    // A selection modifier must win even when a handle overlaps the clicked item.
    if (event.button === 0 && (event.shiftKey || additiveSelection)) {
      keyboardNavigation.cancel();
      pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, button: event.button };
      suppressPick = false; event.stopImmediatePropagation(); return;
    }
    if (startFurnitureBodyDrag(event)) return;
    if (event.button === 0 && windowTransformContext() && tool !== 'rotate') {
      pointerRay(event);
      if (pickEntity()?.id === selectedId) { startWindowDrag(event, 'move', true); if (openingDrag) return; }
    }
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
          keyboardNavigation.cancel();
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
        keyboardNavigation.cancel();
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
    if (!drag) suppressPick = keyboardNavigation.active;
  }
  function onPointerMove(event: PointerEvent): void {
    if (locked) return;
    if (moveFurnitureBody(event)) return;
    if (wallMove.active) { wallMove.pointerMove(event); return; }
    if (openingDrag) {
      if (event.pointerId !== openingDrag.pointerId) return;
      const gesture = openingDrag;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 3) return;
      gesture.moved = true;
      pointerRay(event); const point = raycaster.ray.intersectPlane(gesture.plane, new THREE.Vector3()); if (!point) return;
      if (gesture.transformContext && gesture.mode && gesture.dimensions) {
        const next = constrainOpeningTransform(gesture.transformContext, gesture.mode, point.dot(gesture.axis) - gesture.startAlong, point.y - gesture.startUp!, snapEnabled);
        if ((['offset', 'sill', 'width', 'height'] as const).some(key => Math.abs(next[key] - gesture.dimensions![key]) > 1e-8)) {
          gesture.dimensions = next;
          structure?.previewOpening(gesture.context.opening.id, next); sunOccluders.previewOpening(gesture.context.opening.id, next);
          shadowCache.invalidate(); interactionChanged = true; updateOpeningHandle(); requestRender();
        }
        return;
      }
      const offset = constrainOpeningOffset(gesture.context, gesture.context.opening.offset + point.dot(gesture.axis) - gesture.startAlong, snapEnabled);
      if (Math.abs(offset - gesture.offset) > 1e-8) {
        gesture.offset = offset; structure?.previewOpeningOffset(gesture.context.opening.id, offset);
        sunOccluders.previewOpeningOffset(gesture.context.opening.id, offset); shadowCache.invalidate(); interactionChanged = true;
        updateOpeningHandle(); requestRender();
      }
      return;
    }
    if (!endpointDrag && !drag && windowTransformContext()) {
      pointerRay(event); renderer.domElement.style.cursor = tool !== 'rotate' && pickEntity()?.id === selectedId ? 'grab' : '';
    }
    if (!endpointDrag && !drag && openingHandle.visible && selectedId) {
      pointerRay(event);
      const overHandle = raycaster.intersectObjects(openingHandle.children, false).length > 0;
      renderer.domElement.style.cursor = overHandle || pickEntity()?.id === selectedId ? 'grab' : '';
    }
    if (!endpointDrag || event.pointerId !== endpointDrag.pointerId) return;
    pointerRay(event); const point = raycaster.ray.intersectPlane(endpointDrag.plane, new THREE.Vector3()); if (!point) return;
    const wall = documentState?.walls.find(item => item.id === endpointDrag!.id);
    if (wall && documentState) {
      const snapped = snapWallEndpoint(documentState, wall, endpointDrag.endpoint, [point.x, point.z], snapEnabled);
      point.x = snapped[0]; point.z = snapped[1];
    }
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
    if (gesture.dimensions) {
      const original = { offset: opening.offset, sill: opening.sill, width: opening.width, height: opening.height };
      structure?.previewOpening(opening.id, original); sunOccluders.previewOpening(opening.id, original);
    } else {
      structure?.previewOpeningOffset(opening.id, opening.offset); sunOccluders.previewOpeningOffset(opening.id, opening.offset);
    }
    shadowCache.invalidate();
    orbit.enabled = true; suppressPick = true; pointerStart = null; renderer.domElement.style.cursor = '';
    if (renderer.domElement.hasPointerCapture(gesture.pointerId)) renderer.domElement.releasePointerCapture(gesture.pointerId);
    callbacks.onInteraction(false);
    if (!cancel && gesture.moved) {
      if (gesture.dimensions) {
        if ((['offset', 'sill', 'width', 'height'] as const).some(key => Math.abs(gesture.dimensions![key] - opening[key]) > 1e-8)) callbacks.onOpeningTransform?.(opening.id, gesture.dimensions);
      } else if (Math.abs(gesture.offset - opening.offset) > 1e-8) callbacks.onOpeningMove?.(opening.id, gesture.offset);
    } else if (!cancel && gesture.testOnClick) {
      const projection = structure?.openings.get(opening.id);
      if (projection && !projection.fixed) setDoorAngle(opening.id, projection.target > 0.01 ? 0 : Math.PI / 2);
    }
    if (queued && sceneGeneration === generation) setScene(queued.scene, queued.catalog);
    shadowCache.invalidate(); updateOpeningHandle(); requestRender();
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
    if (drag?.body) {
      if (event.pointerId === drag.body.pointerId && event.button === 0) { moveFurnitureBody(event); finishDrag(false); }
      return;
    }
    if (wallMove.active) { if (event.button === 0) wallMove.finish(false, event); return; }
    if (openingDrag) { if (event.pointerId === openingDrag.pointerId && event.button === 0) { onPointerMove(event); finishOpening(false); } return; }
    if (endpointDrag) { if (event.pointerId === endpointDrag.pointerId && event.button === 0) finishEndpoint(false); pointerStart = null; return; }
    const start = pointerStart; pointerStart = null;
    if (!start || event.pointerId !== start.pointerId || start.button !== 0 || suppressPick || drag) return;
    if (!event.composedPath().includes(renderer.domElement)) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    pointerRay(event);
    const hit = pickEntity();
    const id = hit?.id ?? null;
    ceilingSelectionId = hit?.ceiling ? id : null;
    if (!event.shiftKey && !additiveSelection && id && tool === 'select') {
      const opening = structure?.openings.get(id); if (opening && !opening.fixed) setDoorAngle(id, opening.target > 0.01 ? 0 : Math.PI / 2);
      if (id === selectedId && documentState?.project?.components.find(component => component.id === id)?.control) toggleSwitch(id);
    }
    callbacks.onSelect(id, event.shiftKey || additiveSelection);
  }
  function onPointerCancel(event?: Event): void {
    // Native HTML dragging ends the pointer stream with pointercancel. The
    // catalog session now belongs to drag/drop; it ends on drop, dragend, blur,
    // Escape or an explicit editor cancellation, not this browser handoff.
    if (event?.type === 'pointercancel' && furnitureDrop.active) return;
    furnitureDrop.cancel();
    handPan.cancel(); walk.cancel(); keyboardNavigation.cancel();
    pointerStart = null; finishDrag(true); finishEndpoint(true); finishOpening(true); wallMove.finish(true);
    if (orbitWasActive) { orbitWasActive = false; callbacks.onInteraction(false); }
  }
  function onLostPointerCapture(event: PointerEvent): void {
    if (drag?.body?.pointerId === event.pointerId) finishDrag(true);
    wallMove.finish(true, event);
    if (openingDrag?.pointerId === event.pointerId) finishOpening(true);
  }
  function onContextLoss(event: Event): void { event.preventDefault(); onPointerCancel(); callbacks.onError('The graphics context was interrupted. Reload the page to restore the 3D view; saved scenes remain available.'); }
  function reportNavigationInteraction(): void {
    callbacks.onInteraction(keyboardNavigation.active || orbitWasActive || handPan.active || !!drag || !!endpointDrag || !!openingDrag || wallMove.active || furnitureDrop.active);
  }
  function onOrbitStart(): void { cameraMotion.cancel('camera'); if (!drag) { orbitWasActive = true; reportNavigationInteraction(); } }
  function onOrbitEnd(): void { if (orbitWasActive) { orbitWasActive = false; reportNavigationInteraction(); } }
  function endDrag(): void { finishDrag(false); }

  const stopFinishTextureUpdates = subscribeFinishTextures(requestRender);
  const finishInteraction = createFinishInteraction({
    canvas: renderer.domElement, container, world,
    camera: () => camera, scene: () => documentState,
    roots: () => [structure?.group, structure?.ceilings, furniture, services?.group],
    render: requestRender, error: message => callbacks.onError(message),
    onStart: () => keyboardNavigation.cancel(),
    apply: (presetId, target) => {
      if (!documentState || drag || endpointDrag || openingDrag || wallMove.active || furnitureDrop.active) return;
      if (structure?.updateFinishes(performance.now())) {
        callbacks.onError('The finish is still spreading. Apply the next sample in a moment.');
        return;
      }
      pendingFinishReveal = { ...target, previousScene: documentState, startedAt: performance.now(), reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
      try { callbacks.onFinish?.(presetId, target); }
      finally { pendingFinishReveal = undefined; }
    },
  });
  const furnitureDrop = createFurnitureDrop({
    canvas: renderer.domElement, container, world,
    surfaceResolver: furnitureSurface,
    pointerSurface: ray => furniturePointerSurface(ray, [...rendered.values()].map(r => r.visual)),
    camera: () => camera, scene: () => documentState, catalog: () => catalogState,
    snap: () => snapEnabled,
    enabled: () => !disposed && view !== 'inside' && layers.furniture && !!callbacks.onFurnitureDrop
      && !drag && !endpointDrag && !openingDrag && !wallMove.active,
    render: requestRender, error: message => callbacks.onError(message),
    interaction(active) {
      if (active) { keyboardNavigation.cancel(); cameraMotion.cancel('camera'); pointerStart = null; suppressPick = true; }
      orbit.enabled = !active && view !== 'inside'; transform.enabled = !active && view !== 'inside';
      callbacks.onInteraction(active);
    },
    apply: (assetId, position) => callbacks.onFurnitureDrop?.(assetId, position),
  });
  const handPan = new HandPanControls(renderer.domElement, {
    enabled: () => view !== 'inside' && orbit.enabled && !drag && !endpointDrag && !openingDrag
      && !wallMove.active && !finishInteraction.active && !furnitureDrop.active && !pointerStart,
    start() { cameraMotion.cancel('camera'); pointerStart = null; suppressPick = true; reportNavigationInteraction(); },
    move(dx, dy) { orbit.pan(dx * orbit.panSpeed, dy * orbit.panSpeed); },
    stop: reportNavigationInteraction,
  });
  transform.addEventListener('mouseDown', startDrag);
  transform.addEventListener('mouseUp', endDrag);
  transform.addEventListener('objectChange', changedTransform);
  transform.addEventListener('change', requestRender);
  orbit.addEventListener('change', requestRender);
  orbit.addEventListener('start', onOrbitStart);
  orbit.addEventListener('end', onOrbitEnd);
  renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
  // OrbitControls ends its gesture on document. Pick after that bubbles to window,
  // so the app's interaction gate is clear before onSelect runs.
  window.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);
  renderer.domElement.addEventListener('lostpointercapture', onLostPointerCapture);
  renderer.domElement.addEventListener('webglcontextlost', onContextLoss);
  window.addEventListener('blur', onPointerCancel);
  resize(); setTool('select');
  const unregisterDesignerSnapshot = registerDesignerRenderer(renderer.domElement, renderScene, () => drag || endpointDrag || openingDrag || wallMove.active || furnitureDrop.active || handPan.active ? null : documentState);

  const api: FinishViewport = {
    attach(next, nextCallbacks, nextNormalizer) {
      if (disposed) throw new Error('Cannot attach a disposed viewport');
      onPointerCancel(); keyboardNavigation.cancel(); handPan.cancel();
      cameraMotion.cancel('camera');
      callbacks = nextCallbacks; normalizeScene = nextNormalizer;
      next.append(container);
      resize();
    },
    preservePresentation() {
      const sceneId = documentState?.id, savedView = view, savedWalls = walls;
      const savedPerspective = perspective.clone(), savedTop = orthographic.clone(), savedInside = insideCamera.clone();
      const savedTarget = orbit.target.clone(), savedOrbitCamera = orbit.object;
      const savedOrbitRange = [orbit.minDistance, orbit.maxDistance, orbit.minPolarAngle, orbit.maxPolarAngle] as const;
      const savedOutside = outsideView ? { ...outsideView, position: outsideView.position.clone(), quaternion: outsideView.quaternion.clone(), target: outsideView.target.clone() } : null;
      const savedDoors = new Map(doorAngles), savedPreviousDoors = new Map(previousDoorAngles);
      const savedOpenings = new Map([...structure?.openings ?? []].map(([id, opening]) => [id, { angle: opening.angle, target: opening.target }]));
      const savedSun = { ...sunSettings }, savedSky = skyboxPreset, savedTopLighting = topLightingEnabled, savedLens = insideLens;
      const restoreLights = lightingPreview.preserveLevels();
      let restored = false;
      return () => {
        if (restored || disposed || documentState?.id !== sceneId) return;
        restored = true;
        onPointerCancel(); cameraMotion.cancel('camera');
        // The caller has restored the original document. Rewire the controls before
        // restoring the exact poses, instead of accepting setView's default framing.
        setView(savedView); cameraMotion.cancel('camera'); walls = savedWalls;
        perspective.copy(savedPerspective, false); orthographic.copy(savedTop, false); insideCamera.copy(savedInside, false);
        insideLens = savedLens;
        orbit.target.copy(savedTarget); orbit.object = savedOrbitCamera;
        [orbit.minDistance, orbit.maxDistance, orbit.minPolarAngle, orbit.maxPolarAngle] = savedOrbitRange;
        outsideView = savedOutside;
        doorAngles.clear(); for (const [id, angle] of savedDoors) if (structure?.openings.has(id)) doorAngles.set(id, angle);
        previousDoorAngles = new Map(savedPreviousDoors);
        for (const [id, opening] of structure?.openings ?? []) {
          const saved = savedOpenings.get(id), angle = opening.fixed ? 0 : saved?.angle ?? 0;
          opening.target = opening.fixed ? 0 : saved?.target ?? 0;
          opening.setAngle(angle); sunOccluders.setDoorAngle(id, angle);
        }
        clearTimeout(skyUpdateTimer); skyUpdateTimer = undefined;
        sunSettings = savedSun; skyboxPreset = savedSky; skySun = effectiveSunlight(sunSettings);
        topLightingEnabled = savedTopLighting; restoreLights();
        if (structure) {
          fitSunShadow(sunlight, structure.bounds.clone().union(new THREE.Box3().setFromObject(sunOccluders.group)), sunSettings);
          structure.updateWalls(camera, view === 'inside' ? 'full' : walls, view === 'top', performance.now(), true);
        }
        if (view === 'inside') walk.orient();
        resize(); applyLayers(); updateSelection(); shadowCache.invalidate(); requestRender();
        callbacks.onSunChange?.({ ...sunSettings }); callbacks.onLightingChange?.();
      };
    },
    furnitureSurface,
    setScene,
    cameraPose() {
      if (disposed || view !== 'perspective') return null;
      const background = world.background instanceof THREE.Color ? `#${world.background.getHexString()}` : null;
      return { position: perspective.position.toArray(), target: orbit.target.toArray(), fov: perspective.fov, background };
    },
    setBackdrop(backdrop) {
      if (disposed) return null;
      blueprint.setPaper(backdrop?.paper ?? BLUEPRINT_PAPER, renderer.toneMappingExposure);
      if (!backdrop) {
        blueprint.setSheet(null); blueprint.sheetOpacity = 0;
        blueprint.trace = null; blueprint.scan = null; blueprint.erase = 0; blueprint.gridOpacity = 1;
      }
      applyLayers(); shadowCache.invalidate(); requestRender();
      return blueprint;
    },
    setLocked(next) {
      if (next === locked) return;
      if (next) { onPointerCancel(); furnitureDrop.cancel(); finishInteraction.setBrush(null); }
      locked = next; pointerStart = null; renderer.domElement.style.cursor = '';
    },
    setCameraPose(pose, duration = MOTION.camera) {
      if (disposed) return;
      if (view !== 'perspective') setView('perspective');
      handPan.cancel(); keyboardNavigation.cancel();
      cameraMotion.sample('camera');
      const fromPosition = perspective.position.clone(), fromTarget = orbit.target.clone(), fromFov = perspective.fov;
      const toPosition = new THREE.Vector3(...pose.position), toTarget = new THREE.Vector3(...pose.target), toFov = pose.fov ?? fromFov;
      const distance = toPosition.distanceTo(toTarget);
      orbit.maxDistance = Math.max(orbit.maxDistance, distance * 2);
      perspective.far = Math.max(perspective.far, distance * 4);
      cameraMotion.animate('camera', duration, t => {
        perspective.position.lerpVectors(fromPosition, toPosition, t);
        orbit.target.lerpVectors(fromTarget, toTarget, t);
        perspective.fov = fromFov + (toFov - fromFov) * t; perspective.updateProjectionMatrix();
        perspective.lookAt(orbit.target); orbit.update();
      });
    },
    riseStructure(duration = 1500) {
      const rising = structure;
      if (disposed || !rising) return;
      const groups = [rising.group, rising.ceilings];
      motion.animate(rising.group, duration, t => {
        // Ease the last stretch softly: walls settle rather than stop.
        const k = Math.max(0.002, 1 - (1 - t) ** 2);
        for (const group of groups) group.scale.y = k;
        sunOccluders.group.scale.y = k;
      }, () => { for (const group of groups) group.scale.y = 1; sunOccluders.group.scale.y = 1; });
    },
    loading() { return loadingModels > 0 || pendingModels.size > 0; },
    redraw() { requestRender(); },
    setFurnitureDrag(asset) {
      onPointerCancel();
      if (asset) finishInteraction.setBrush(null);
      furnitureDrop.setAsset(asset);
    },
    revealSelection,
    setFinishBrush(id) { onPointerCancel(); finishInteraction.setBrush(id); },
    animatePlacement(id) {
      const record = rendered.get(id);
      if (disposed || drag || !record) return;
      placementMotion.enter(id, record.visual, record.dimensions);
    },
    animateAssembly(id) {
      const record = rendered.get(id);
      if (disposed || !record) return;
      const model = record.visual.children.find(child => installedModels.has(child));
      if (model) startAssembly(model, record.dimensions[1]); else assemblyWanted.add(id);
    },
    project(point) {
      if (disposed) return null;
      const v = new THREE.Vector3(...point).project(camera);
      const width = renderer.domElement.clientWidth, height = renderer.domElement.clientHeight;
      return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, visible: v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
    },
    onFrame(listener) { frameListeners.add(listener); return () => { frameListeners.delete(listener); }; },
    setHidden(ids) { hiddenIds = new Set(ids); applyHidden(); shadowCache.invalidate(); requestRender(); },
    setSelection(id, ids) {
      if (id !== ceilingSelectionId) ceilingSelectionId = null;
      const requested = id ? [...new Set([id, ...(ids ?? [])])] : [];
      const furnitureIds = documentState ? expandFurnitureSelection(documentState, requested) : [];
      const nextIds = [...new Set([...requested, ...furnitureIds])];
      const changed = id !== selectedId || nextIds.length !== selectedIds.length || nextIds.some(item => !selectedIds.includes(item));
      if (changed) { cameraMotion.cancel('camera'); wallMove.finish(true); finishDrag(true); finishOpening(true); }
      if (endpointDrag) finishEndpoint(true);
      selectedId = id; selectedIds = nextIds; selectedFurnitureIds = furnitureIds;
      renderer.domElement.style.cursor = ''; updateSelection();
    },
    setAdditiveSelection(enabled) { if (enabled !== additiveSelection) { onPointerCancel(); additiveSelection = enabled; updateSelection(); } },
    setTool,
    setView,
    setInsideLens(lens) {
      if (disposed || !isInsideLens(lens)) return;
      insideLens = lens;
      configureInsideCamera(insideCamera, width / height, insideLens);
      requestRender();
    },
    getSun() { return { ...sunSettings }; },
    setTopLighting(enabled) {
      if (disposed || topLightingEnabled === enabled) return;
      topLightingEnabled = enabled;
      applyLayers(); requestRender();
    },
    setSun(patch) {
      sunSettings = normalizeSun(patch, sunSettings);
      // Direct light follows the slider immediately. Cubemap/PMREM capture waits
      // for a pause so dragging does not allocate six-face captures every frame.
      clearTimeout(skyUpdateTimer);
      skyUpdateTimer = setTimeout(() => {
        skyUpdateTimer = undefined; skySun = effectiveSunlight(sunSettings);
        if (!disposed) { applyLayers(); requestRender(); }
      }, 150);
      if (structure) fitSunShadow(sunlight, structure.bounds.clone().union(new THREE.Box3().setFromObject(sunOccluders.group)), sunSettings);
      applyLayers(); callbacks.onSunChange?.({ ...sunSettings }); requestRender();
    },
    setLightingMood(mood) {
      // A discrete switch, not a slider: capture its sky once, now, instead of a stale then a debounced one.
      sunSettings = normalizeSun({ timeOfDay: mood === 'day' ? 12 : 22, enabled: mood === 'day' }, sunSettings);
      clearTimeout(skyUpdateTimer); skyUpdateTimer = undefined; skySun = effectiveSunlight(sunSettings);
      if (structure) fitSunShadow(sunlight, structure.bounds.clone().union(new THREE.Box3().setFromObject(sunOccluders.group)), sunSettings);
      applyLayers(); callbacks.onSunChange?.({ ...sunSettings }); requestRender();
    },
    setSkybox(preset) {
      if (disposed || !isSkyboxPreset(preset)) return false;
      if (preset === skyboxPreset) return true;
      try {
        skySun = effectiveSunlight(sunSettings);
        if (preset !== 'studio') skyboxes.get(preset, skySun);
      } catch {
        callbacks.onError('This sky could not be rendered. Choose another sky or reload the editor.');
        return false;
      }
      skyboxPreset = preset;
      applyLayers(); requestRender(); return true;
    },
    inspectCeiling(roomId) {
      const room = documentState?.rooms.find(room => room.id === roomId);
      if (!room || !documentState) return false;
      const layout = layoutCeilingDesign(documentState, room);
      const xs = layout ? layout.elements.flatMap(e => [e.position[0] - e.dimensions[0] / 2, e.position[0] + e.dimensions[0] / 2]) : room.polygon.map(p => p[0]);
      const zs = layout ? layout.elements.flatMap(e => [e.position[2] - e.dimensions[2] / 2, e.position[2] + e.dimensions[2] / 2]) : room.polygon.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const spawn = findWalkSpawn({ ...documentState, rooms: [room] }, catalogState, { point: [minX + (maxX - minX) * .2, minZ + (maxZ - minZ) * .2] });
      if (!spawn) { callbacks.onError('No clear standing space was found in this room.'); return false; }
      if (!setView('inside')) return false;
      ceilingRoomId = roomId;
      if (ceilingDesigns) disposeObject(ceilingDesigns);
      ceilingDesigns = makeCeilingDesigns(documentState, roomId); world.add(ceilingDesigns);
      insideCamera.position.fromArray(spawn.position);
      const meta = documentState.project?.metadata[roomId];
      const ceilingY = (meta?.elevation ?? 0) + roomCeilingHeight(documentState, room) - (meta?.ceilingDesign?.drop ?? 0);
      insideCamera.lookAt(layout ? (minX + maxX) / 2 : spawn.target[0], ceilingY - .4, layout ? (minZ + maxZ) / 2 : spawn.target[2]);
      walk.orient(); applyLayers(); requestRender(); return true;
    },
    setSnap(enabled) { snapEnabled = enabled; transform.setTranslationSnap(enabled ? 0.25 : null); transform.setRotationSnap(enabled ? Math.PI / 12 : null); transform.setScaleSnap(enabled ? 0.1 : null); requestRender(); },
    setWalls(mode) { finishOpening(true); wallMove.finish(true); walls = mode; shadowCache.invalidate(); updateOpeningHandle(); wallMove.refresh(); renderer.domElement.style.cursor = ''; requestRender(); },
    setQuality(mode) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, mode === 'high' ? 2 : 1.5));
      studioRenderer.setQuality(mode);
      const resolution = mode === 'high' ? 4096 : 2048;
      sunlight.shadow.radius = mode === 'high' ? 2 : 1.5;
      if (sunlight.shadow.mapSize.x !== resolution) {
        sunlight.shadow.mapSize.set(resolution, resolution);
        sunlight.shadow.map?.dispose(); sunlight.shadow.map = null; sunlight.shadow.needsUpdate = true;
      }
      resize();
    },
    setLayer(layer, visible) { wallMove.finish(true); if (layer === 'shell') finishOpening(true); if (layer === 'furniture' && !visible) furnitureDrop.cancel(); layers[layer] = visible; applyLayers(); updateSelection(); },
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
      unregisterDesignerSnapshot();
      finishInteraction.dispose();
      furnitureDrop.dispose();
      stopFinishTextureUpdates();
      handPan.dispose(); walk.dispose(); keyboardNavigation.dispose();
      cancelAnimationFrame(frame); clearTimeout(settleTimer); clearTimeout(warmTimer); clearTimeout(collisionTimer); clearTimeout(skyUpdateTimer); resizeObserver.disconnect();
      window.removeEventListener('blur', onPointerCancel);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('lostpointercapture', onLostPointerCapture);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLoss);
      transform.removeEventListener('mouseDown', startDrag); transform.removeEventListener('mouseUp', endDrag);
      transform.removeEventListener('objectChange', changedTransform); transform.removeEventListener('change', requestRender);
      orbit.removeEventListener('change', requestRender); orbit.removeEventListener('start', onOrbitStart); orbit.removeEventListener('end', onOrbitEnd);
      wallMove.dispose(); transform.dispose(); orbit.dispose();
      placementMotion.dispose(); frameListeners.clear(); assemblies = [];
      motion.dispose(); cameraMotion.dispose();
      for (const group of retiring) disposeObject(group); retiring.clear();
      placementFeedback.dispose();
      if (selection) disposeObject(selection);
      rendered.forEach(record => disposeObject(record.group)); rendered.clear();
      pendingModels.forEach(pending => disposeObject(pending.model)); pendingModels.clear();
      if (structure) { disposeObject(structure.group); disposeObject(structure.ceilings); disposeObject(structure.dimensions); }
      if (ceilingDesigns) disposeObject(ceilingDesigns);
      if (services) disposeObject(services.group); if (comparison) disposeObject(comparison); disposeObject(annotations); disposeObject(endpointHandles); disposeObject(openingHandle); windowHandles.dispose();
      practicalLights.dispose(); eveningLights.setRooms([]);
      blueprint.dispose(); sunOccluders.dispose(); loader.dispose(); openingAssets.dispose(); sunlight.shadow.dispose(); topLighting.dispose();
      studioRenderer.dispose(); skyboxes.dispose(); environment.dispose(); renderer.dispose(); container.remove();
    },
  };
  perfProbe = installPerfProbe({ viewport: api, renderer, world });
  return api;
}
