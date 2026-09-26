import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CatalogAsset, ObjectPatch, SceneDocument, SceneObject, ToolMode, ViewMode, Viewport, ViewportCallbacks, WallMode } from '../contracts';
import { AssetLoader, disposeObject, makeFurniture } from './assets';
import { makeStructure, type StructureProjection } from './structure';

interface RenderObject { group: THREE.Group; signature: string; token: object }
interface DragSnapshot { id: string; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }

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
    return { setScene() {}, setSelection() {}, setTool() {}, setView() {}, setSnap() {}, setWalls() {}, setQuality() {}, focus() {}, cancelInteraction() {}, dispose() { message.remove(); } };
  }
  renderer.setClearColor('#e9e7e0');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D apartment. Click furniture to select. Drag to orbit, right drag to pan, and scroll to zoom.');
  container.appendChild(renderer.domElement);

  const world = new THREE.Scene();
  world.background = new THREE.Color('#e9e7e0');
  const perspective = new THREE.PerspectiveCamera(38, 1, 0.05, 250);
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
  transform.setSize(0.85);
  transform.setSpace('world');
  transform.setTranslationSnap(0.25);
  transform.setRotationSnap(Math.PI / 12);
  transform.setScaleSnap(0.1);
  transform.minY = 0; transform.maxY = 0;
  const transformHelper = transform.getHelper();
  world.add(transformHelper);

  const lighting = new THREE.Group();
  const ambient = new THREE.HemisphereLight('#e8f0fa', '#9e8e73', 1.2);
  lighting.add(ambient);
  const sunlight = new THREE.DirectionalLight('#fff2d7', 2.6);
  sunlight.position.set(-5, 13, 9);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.near = 0.5;
  sunlight.shadow.camera.far = 65;
  sunlight.shadow.bias = -0.00025;
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.radius = 3;
  lighting.add(sunlight, sunlight.target);
  const fill = new THREE.DirectionalLight('#dde7fa', 0.75);
  fill.position.set(7, 6, -8); lighting.add(fill);
  world.add(lighting);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), new THREE.MeshStandardMaterial({ color: '#e9e7e0', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.18; ground.receiveShadow = true; world.add(ground);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, 0.04);
  world.environment = environment.texture;
  world.environmentIntensity = 0.35;
  roomEnvironment.dispose(); pmrem.dispose();

  const furniture = new THREE.Group(); world.add(furniture);
  const rendered = new Map<string, RenderObject>();
  const pendingModels = new Map<string, { model: THREE.Group; token: object; color?: string }>();
  const loader = new AssetLoader();
  let structure: StructureProjection | null = null;
  let structureKey = '';
  let documentState: SceneDocument | null = null;
  let sceneGeneration = 0;
  let selectedId: string | null = null;
  let selection: THREE.BoxHelper | null = null;
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

  function requestRender(): void {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      structure?.updateWalls(camera, walls, view === 'top');
      selection?.update();
      try { renderer.render(world, camera); }
      catch (error) {
        if (!renderFailed) { renderFailed = true; callbacks.onError(`The 3D view could not render: ${error instanceof Error ? error.message : 'unknown graphics error'}`); }
      }
    });
  }

  function updateSelection(): void {
    if (selection) { disposeObject(selection); selection = null; }
    transform.detach();
    const chosen = selectedId ? rendered.get(selectedId)?.group : undefined;
    if (chosen) {
      selection = new THREE.BoxHelper(chosen, '#b36f3f');
      const material = selection.material as THREE.LineBasicMaterial;
      material.depthTest = false; material.transparent = true; material.opacity = 0.8;
      selection.renderOrder = 900; world.add(selection);
      if (tool !== 'select') transform.attach(chosen);
    }
    requestRender();
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
    const group = rendered.get(previous.id)?.group;
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
      if (changed) {
        const patch: ObjectPatch = tool === 'move' ? { position: [group.position.x, 0, group.position.z] }
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
    const group = rendered.get(selectedId)?.group;
    if (!group) return;
    drag = { id: selectedId, position: group.position.clone(), quaternion: group.quaternion.clone(), scale: group.scale.clone() };
    suppressPick = true; orbit.enabled = false; callbacks.onInteraction(true);
  }

  function changedTransform(): void {
    const group = transform.object;
    if (group && drag) {
      group.position.y = 0;
      group.quaternion.setFromAxisAngle(upAxis, yawOf(group.quaternion));
      group.scale.set(Math.max(0.1, Math.min(4, group.scale.x)), Math.max(0.1, Math.min(4, group.scale.y)), Math.max(0.1, Math.min(4, group.scale.z)));
      group.updateMatrixWorld(true);
    }
    requestRender();
  }

  function setScene(next: SceneDocument, catalog: CatalogAsset[]): void {
    if (disposed) return;
    if (drag) { pendingScene = { scene: next, catalog }; return; }
    sceneGeneration++;
    documentState = next;
    const nextKey = JSON.stringify([next.rooms, next.walls]);
    if (structureKey !== nextKey) {
      if (structure) disposeObject(structure.group);
      structure = makeStructure(next); structureKey = nextKey; world.add(structure.group);
      structure.bounds.getCenter(center); structure.bounds.getSize(size);
      const shadowRadius = Math.max(size.x, size.z) * 0.72 + 2;
      sunlight.target.position.copy(center);
      sunlight.position.copy(center).add(new THREE.Vector3(-5, 13, 9));
      Object.assign(sunlight.shadow.camera, { left: -shadowRadius, right: shadowRadius, top: shadowRadius, bottom: -shadowRadius });
      sunlight.shadow.camera.updateProjectionMatrix();
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
    if (selectedId && !rendered.has(selectedId)) selectedId = null;
    updateSelection();
    if (!initialized) { initialized = true; focus(); }
    requestRender();
  }

  function setTool(next: ToolMode): void {
    if (drag) finishDrag(true);
    tool = next;
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
    const chosen = id ? rendered.get(id)?.group : undefined;
    if (chosen) box.setFromObject(chosen);
    else if (structure) box.copy(structure.bounds);
    else box.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 1, 3));
    box.getCenter(center); box.getSize(size);
    if (!chosen) center.y = 0.4;
    const radius = Math.max(size.x, size.y, size.z, 1.2);
    orbit.target.copy(center);
    if (view === 'top') {
      camera.position.set(center.x, 25, center.z + 0.001);
      const span = Math.max(size.z, size.x / Math.max(width / height, 0.1), 2) * 1.25;
      orthographic.zoom = 16 / span;
      orthographic.updateProjectionMatrix();
    } else {
      // Fit all eight corners in the actual camera basis, including the diagonal footprint.
      const direction = new THREE.Vector3(0.88, 1.15, 1.32).normalize();
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
      distance *= 1.3;
      orbit.maxDistance = Math.max(65, distance * 2);
      perspective.far = Math.max(250, distance * 4); perspective.updateProjectionMatrix();
      camera.position.copy(center).addScaledVector(direction, distance);
    }
    camera.lookAt(center); orbit.update(); requestRender();
  }

  function resize(): void {
    width = Math.max(container.clientWidth, 1); height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    perspective.aspect = width / height; perspective.updateProjectionMatrix();
    const aspect = width / height;
    orthographic.left = -8 * aspect; orthographic.right = 8 * aspect; orthographic.top = 8; orthographic.bottom = -8;
    orthographic.updateProjectionMatrix(); requestRender();
  }

  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  function onPointerDown(event: PointerEvent): void {
    pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, button: event.button };
    if (!drag) suppressPick = false;
  }
  function onPointerUp(event: PointerEvent): void {
    const start = pointerStart; pointerStart = null;
    if (!start || event.pointerId !== start.pointerId || start.button !== 0 || suppressPick || drag) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(furniture.children, true);
    const occluders: THREE.Object3D[] = [];
    structure?.group.traverseVisible(object => {
      if (object instanceof THREE.Mesh && !(Array.isArray(object.material) ? object.material : [object.material]).every(material => material.transparent)) occluders.push(object);
    });
    const wallHit = raycaster.intersectObjects(occluders, false)[0];
    let id: string | null = null;
    for (const intersection of intersections) {
      if (wallHit && intersection.distance > wallHit.distance + 0.005) break;
      let parent: THREE.Object3D | null = intersection.object;
      while (parent && !parent.userData.objectId) parent = parent.parent;
      if (parent?.userData.objectId) { id = parent.userData.objectId as string; break; }
    }
    callbacks.onSelect(id);
  }
  function onPointerCancel(): void {
    pointerStart = null; finishDrag(true);
    if (orbitWasActive) { orbitWasActive = false; callbacks.onInteraction(false); }
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
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);
  renderer.domElement.addEventListener('webglcontextlost', onContextLoss);
  window.addEventListener('blur', onPointerCancel);
  resize(); setTool('select');

  return {
    setScene,
    setSelection(id) { if (drag && id !== selectedId) finishDrag(true); selectedId = id; updateSelection(); },
    setTool,
    setView(next) {
      if (next === view) return;
      finishDrag(true); view = next;
      camera = next === 'top' ? orthographic : perspective;
      orbit.object = camera; transform.camera = camera;
      orbit.enableRotate = next !== 'top';
      orbit.minPolarAngle = next === 'top' ? 0 : 0.05;
      orbit.mouseButtons.LEFT = next === 'top' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      focus(); updateSelection();
    },
    setSnap(enabled) { transform.setTranslationSnap(enabled ? 0.25 : null); transform.setRotationSnap(enabled ? Math.PI / 12 : null); transform.setScaleSnap(enabled ? 0.1 : null); requestRender(); },
    setWalls(mode) { walls = mode; requestRender(); },
    setQuality(mode) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, mode === 'high' ? 2 : 1.5));
      const resolution = mode === 'high' ? 4096 : 2048;
      if (sunlight.shadow.mapSize.x !== resolution) {
        sunlight.shadow.mapSize.set(resolution, resolution);
        sunlight.shadow.map?.dispose(); sunlight.shadow.map = null; sunlight.shadow.needsUpdate = true;
      }
      resize();
    },
    focus,
    cancelInteraction() { onPointerCancel(); },
    dispose() {
      if (disposed) return;
      finishDrag(true); disposed = true;
      cancelAnimationFrame(frame); resizeObserver.disconnect();
      window.removeEventListener('blur', onPointerCancel);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLoss);
      transform.removeEventListener('mouseDown', startDrag); transform.removeEventListener('mouseUp', endDrag);
      transform.removeEventListener('objectChange', changedTransform); transform.removeEventListener('change', requestRender);
      orbit.removeEventListener('change', requestRender); orbit.removeEventListener('start', onOrbitStart); orbit.removeEventListener('end', onOrbitEnd);
      transform.dispose(); orbit.dispose();
      if (selection) disposeObject(selection);
      rendered.forEach(record => disposeObject(record.group)); rendered.clear();
      pendingModels.forEach(pending => disposeObject(pending.model)); pendingModels.clear();
      if (structure) disposeObject(structure.group);
      disposeObject(ground); loader.dispose(); sunlight.shadow.dispose();
      environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
