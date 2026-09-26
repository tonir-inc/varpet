import * as THREE from 'three';
import type { CatalogAsset, SceneDocument, Vec2, Wall, WallMode } from '../contracts';
import { applyRenovationOperation } from '../core/renovation';
import { validateScene } from '../core/validation';
import type { SceneNormalizer } from '../core/store';
import { snapWallDistance } from '../core/wall-snapping';
import { disposeObject } from './assets';
import { makeStructure, type StructureProjection } from './structure';
import { makeServices, type ServiceProjection } from './services';

interface WallMoveOptions {
  normalizeScene?: SceneNormalizer;
  world: THREE.Scene;
  canvas: HTMLCanvasElement;
  getCamera(): THREE.Camera;
  getScene(): SceneDocument | null;
  getCatalog(): CatalogAsset[];
  getWall(): Wall | undefined;
  enabled(): boolean;
  snap(): boolean;
  wallMode(): WallMode;
  topView(): boolean;
  onStart(): void;
  onFinish(id: string, patch: { start: Vec2; end: Vec2 } | null): void;
  onPreview(shell: StructureProjection | null, services: ServiceProjection | null): void;
  requestRender(): void;
}

/** Temporary drag projection; only the host's checked command can change the document. */
export function createWallMove(options: WallMoveOptions) {
  const handles = new THREE.Group(); options.world.add(handles);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const up = new THREE.Vector3(0, 1, 0);
  const material = new THREE.MeshBasicMaterial({ color: '#a78bea', depthTest: false, depthWrite: false });
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10), material);
  handles.add(center);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), material);
  shaft.rotation.z = Math.PI / 2; handles.add(shaft);
  for (const sign of [-1, 1]) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.20, 12), material);
    arrow.position.x = sign * 0.5; arrow.rotation.z = -sign * Math.PI / 2; handles.add(arrow);
  }
  handles.traverse(child => { child.renderOrder = 960; });
  const status = document.createElement('div');
  status.setAttribute('role', 'status'); status.hidden = true;
  status.style.cssText = 'position:absolute;left:50%;top:80px;transform:translateX(-50%);max-width:min(520px,85%);padding:10px 16px;border-radius:10px;background:#292731;color:#eee8ff;font:500 13px/1.5 system-ui;pointer-events:none;z-index:4;box-shadow:0 4px 18px #0003';
  options.canvas.parentElement?.append(status);
  let previewShell: StructureProjection | null = null;
  let previewServices: ServiceProjection | null = null;
  let previewFrame = 0;
  let gesture: {
    source: SceneDocument; wall: Wall; normal: THREE.Vector3; origin: THREE.Vector3;
    plane: THREE.Plane; pointerId: number; distance: number; x: number; y: number;
    moved: boolean;
  } | null = null;

  function pointerRay(event: PointerEvent): void {
    const rect = options.canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, options.getCamera());
  }
  function patchFor(wall: Wall, normal: THREE.Vector3, distance: number): { start: Vec2; end: Vec2 } {
    const coordinate = (value: number) => options.snap() ? Number(value.toFixed(8)) : value;
    const shift = (point: Vec2): Vec2 => [coordinate(point[0] + normal.x * distance), coordinate(point[1] + normal.z * distance)];
    return { start: shift(wall.start), end: shift(wall.end) };
  }
  function refresh(): void {
    const wall = options.getWall();
    handles.visible = Boolean(wall && options.enabled());
    if (!wall) return;
    const elevation = options.getScene()?.project?.metadata[wall.id]?.elevation ?? 0;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1];
    handles.position.set((wall.start[0] + wall.end[0]) / 2, elevation + 0.2, (wall.start[1] + wall.end[1]) / 2);
    handles.rotation.y = -Math.atan2(dx, -dz);
    if (gesture) handles.position.addScaledVector(gesture.normal, gesture.distance);
    handles.updateMatrixWorld(true);
  }
  function clearProjection(): void {
    if (previewShell) { disposeObject(previewShell.group); disposeObject(previewShell.ceilings); disposeObject(previewShell.dimensions); previewShell = null; }
    if (previewServices) { disposeObject(previewServices.group); previewServices = null; }
  }
  function updatePreview(): void {
    previewFrame = 0;
    if (!gesture) return;
    const { source, wall, normal, distance } = gesture;
    try {
      let proposed = applyRenovationOperation(structuredClone(source), { type: 'update-wall', id: wall.id, patch: patchFor(wall, normal, distance) });
      const draftValidation = validateScene(proposed, options.getCatalog());
      if (!draftValidation.ok) throw new Error(draftValidation.errors[0]);
      if (options.normalizeScene) {
        proposed = options.normalizeScene(proposed, source);
        const validation = validateScene(proposed, options.getCatalog());
        if (!validation.ok) throw new Error(validation.errors[0]);
      }
      clearProjection();
      previewShell = makeStructure(proposed); previewServices = makeServices(proposed);
      options.world.add(previewShell.group, previewShell.ceilings, previewShell.dimensions, previewServices.group);
      options.onPreview(previewShell, previewServices);
      material.color.set('#a78bea');
      status.textContent = `Move wall ${distance >= 0 ? '+' : ''}${distance.toFixed(2)} m · Release to apply · Esc to cancel`;
    } catch (error) {
      material.color.set('#e47777');
      status.textContent = `Cannot move wall: ${error instanceof Error ? error.message : 'Invalid connected geometry.'}`;
    }
    refresh(); options.requestRender();
  }
  function pointerDown(event: PointerEvent, pickedId?: string | null, pickedPoint?: THREE.Vector3): boolean {
    if (gesture || event.button !== 0 || !options.enabled()) return false;
    const wall = options.getWall(), source = options.getScene();
    if (!wall || !source) return false;
    pointerRay(event);
    const hit = raycaster.intersectObjects(handles.children, false)[0];
    if (!hit && pickedId !== wall.id) return false;
    const plane = new THREE.Plane(up, -(hit ? handles.position.y : pickedPoint?.y ?? handles.position.y));
    const origin = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!origin) return false;
    const normal = new THREE.Vector3(wall.start[1] - wall.end[1], 0, wall.end[0] - wall.start[0]).normalize();
    gesture = { source, wall, normal, origin, plane, pointerId: event.pointerId, distance: 0, x: event.clientX, y: event.clientY, moved: false };
    options.onStart(); options.canvas.setPointerCapture(event.pointerId);
    status.textContent = 'Drag back or forth to move the wall · Connected walls follow · Esc to cancel'; status.hidden = false;
    event.stopImmediatePropagation(); return true;
  }
  function pointerMove(event: PointerEvent): boolean {
    if (!gesture || event.pointerId !== gesture.pointerId) return false;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 3) return true;
    pointerRay(event);
    const point = raycaster.ray.intersectPlane(gesture.plane, new THREE.Vector3());
    if (!point) return true;
    const distance = snapWallDistance(gesture.source, gesture.wall, point.sub(gesture.origin).dot(gesture.normal), options.snap());
    gesture.moved = true;
    if (Math.abs(gesture.distance - distance) < 1e-8) return true;
    gesture.distance = distance;
    if (!previewFrame) previewFrame = requestAnimationFrame(updatePreview);
    return true;
  }
  function finish(cancel: boolean, event?: PointerEvent): boolean {
    if (!gesture || (event && gesture.pointerId !== event.pointerId)) return false;
    if (event && !cancel) pointerMove(event);
    const previous = gesture; gesture = null;
    if (previewFrame) { cancelAnimationFrame(previewFrame); previewFrame = 0; }
    if (options.canvas.hasPointerCapture(previous.pointerId)) options.canvas.releasePointerCapture(previous.pointerId);
    clearProjection(); options.onPreview(null, null); status.hidden = true; material.color.set('#a78bea');
    const patch = !cancel && previous.moved && Math.abs(previous.distance) > 1e-8 ? patchFor(previous.wall, previous.normal, previous.distance) : null;
    options.onFinish(previous.wall.id, patch); refresh(); options.requestRender(); return true;
  }
  return {
    get active() { return gesture !== null; },
    refresh, pointerDown, pointerMove, finish,
    render() { previewShell?.updateWalls(options.getCamera(), options.wallMode(), options.topView()); },
    dispose() { finish(true); clearProjection(); disposeObject(handles); status.remove(); },
  };
}
