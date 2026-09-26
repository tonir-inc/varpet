import * as THREE from 'three';
import type { SceneDocument, Vec3 } from '../contracts';
import { FINISH_DRAG_TYPE, getFinishPreset } from '../core/finish-presets';
import { resolveWallFinishTargets, type WallFinishTarget } from '../core/wall-finish-targets';

export interface FinishTarget {
  entityId: string;
  surface: 'floor' | 'wall-front' | 'wall-back';
  point: Vec3;
}

interface FinishInteractionOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  world: THREE.Scene;
  camera(): THREE.Camera;
  scene(): SceneDocument | null;
  roots(): (THREE.Object3D | undefined)[];
  render(): void;
  onStart?(): void;
  apply(presetId: string, target: FinishTarget): void;
  error(message: string): void;
}

/** Surface picking and hover are transient; only the host's checked command can commit a finish. */
export function createFinishInteraction(options: FinishInteractionOptions) {
  const { canvas } = options;
  let brushId: string | null = null;
  let press: { x: number; y: number; id: number } | null = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const normalMatrix = new THREE.Matrix3();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.105, 0.12, 64), new THREE.MeshBasicMaterial({
    color: '#d8ccff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  }));
  ring.visible = false; ring.renderOrder = 800; options.world.add(ring);
  const faceHover = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: '#d8ccff', transparent: true, opacity: 0.22, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  faceHover.visible = false; faceHover.renderOrder = 790; options.world.add(faceHover);
  // Feedback must never intercept a ray used by the host's structural selection.
  faceHover.raycast = () => {};
  const hint = document.createElement('div');
  hint.className = 'finish-drop-hint'; hint.hidden = true; hint.setAttribute('role', 'status');
  hint.style.cssText = 'position:absolute;z-index:12;pointer-events:none;padding:8px 12px;border:1px solid #81709f;border-radius:9px;background:#25222eeF;color:#f0eaff;font-size:11px;box-shadow:0 6px 24px #0004;max-width:220px;';
  options.container.append(hint);

  function clearHover() {
    if (ring.visible || faceHover.visible) { ring.visible = false; faceHover.visible = false; options.render(); }
    hint.hidden = true;
    canvas.style.cursor = brushId ? 'crosshair' : '';
  }

  function pick(event: { clientX: number; clientY: number }, id = brushId) {
    const preset = id && getFinishPreset(id); const scene = options.scene();
    if (!preset || !scene) return null;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    options.camera().updateMatrixWorld(); raycaster.setFromCamera(pointer, options.camera());
    const meshes: THREE.Object3D[] = [];
    for (const root of options.roots()) root?.traverseVisible(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    // The visible foreground surface owns the drop, including furniture and opening frames.
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit?.face) return null;
    const entityId = hit.object.userData.finishEntityId as string | undefined;
    const surface = (hit.object.userData.finishSurface ?? hit.object.userData.finishSurfaces?.[hit.face.materialIndex]) as FinishTarget['surface'] | undefined;
    if (!entityId || !surface || (preset.category === 'floor') !== (surface === 'floor')) return null;
    const normal = hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
    if (surface === 'floor' && normal.y < 0.7) return null;
    const metadata = scene.project?.metadata[entityId];
    if (metadata?.locked || metadata?.phase === 'remove') return null;
    const wallTargets = surface === 'floor' ? [] : resolveWallFinishTargets(scene, entityId, surface);
    if (wallTargets.some(target => {
      const member = scene.project?.metadata[target.entityId];
      return member?.locked || member?.phase === 'remove';
    })) return null;
    return { target: { entityId, surface, point: hit.point.toArray() as Vec3 }, normal, point: hit.point, wallTargets };
  }

  function highlightFace(targets: WallFinishTarget[]) {
    faceHover.visible = false;
    if (!targets.length) return;
    const surfaces = new Map(targets.map(target => [target.entityId, target.surface]));
    const positions: number[] = []; const point = new THREE.Vector3();
    for (const root of options.roots()) root?.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const surface = surfaces.get(object.userData.finishEntityId);
      if (!surface) return;
      // Copy only the actual painted triangles. Box edges, the opposite side,
      // opening frames and skirting retain their original appearance.
      const geometry = object.geometry; const position = geometry.getAttribute('position');
      for (const group of geometry.groups) {
        if (object.userData.finishSurfaces?.[group.materialIndex ?? 0] !== surface) continue;
        for (let i = group.start; i < group.start + group.count; i++) {
          point.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i) : i).applyMatrix4(object.matrixWorld);
          positions.push(point.x, point.y, point.z);
        }
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    faceHover.geometry.dispose(); faceHover.geometry = geometry;
    faceHover.visible = positions.length > 0;
  }

  function hover(event: { clientX: number; clientY: number }, dropping = false) {
    if (!brushId) return null;
    const hit = pick(event); const preset = getFinishPreset(brushId)!;
    const rect = options.container.getBoundingClientRect();
    hint.hidden = false;
    hint.style.left = `${Math.max(8, Math.min(rect.width - 225, event.clientX - rect.left + 18))}px`;
    hint.style.top = `${Math.max(8, Math.min(rect.height - 48, event.clientY - rect.top + 18))}px`;
    hint.textContent = hit ? `${dropping ? 'Drop' : 'Click'} to apply ${preset.name}${hit.wallTargets.length > 1 ? ' across this wall face' : ''}` : `Choose an unlocked ${preset.category === 'floor' ? 'floor' : 'room-facing wall surface'}`;
    canvas.style.cursor = hit ? 'crosshair' : 'not-allowed';
    ring.visible = !!hit;
    highlightFace(hit?.wallTargets ?? []);
    if (hit) {
      ring.position.copy(hit.point).addScaledVector(hit.normal, 0.009);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    }
    options.render(); return hit;
  }

  function apply(event: { clientX: number; clientY: number }, id: string) {
    const hit = pick(event, id); clearHover();
    if (hit) options.apply(id, hit.target);
    else options.error(`Drop ${getFinishPreset(id)?.category === 'floor' ? 'floor materials on an exposed floor' : 'paint on a room-facing wall surface'}. Exterior surfaces stay neutral gray; locked or removed surfaces cannot be changed.`);
  }
  function down(event: PointerEvent) {
    if (!brushId || event.button !== 0) return;
    event.preventDefault(); event.stopImmediatePropagation();
    options.onStart?.();
    press = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId); hover(event);
  }
  function move(event: PointerEvent) { if (brushId) hover(event); }
  function up(event: PointerEvent) {
    if (!press || press.id !== event.pointerId) return;
    const start = press; press = null;
    event.stopImmediatePropagation();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (brushId && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 6) apply(event, brushId);
  }
  function cancel() {
    const previous = press; press = null;
    if (previous && canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
    clearHover();
  }
  function isFinishDrag(event: DragEvent) { return !!brushId && !!event.dataTransfer?.types.includes(FINISH_DRAG_TYPE); }
  function dragover(event: DragEvent) {
    if (!isFinishDrag(event)) return;
    event.preventDefault();
    const hit = hover(event, true);
    if (event.dataTransfer) event.dataTransfer.dropEffect = hit ? 'copy' : 'none';
  }
  function drop(event: DragEvent) {
    if (!isFinishDrag(event)) return;
    event.preventDefault(); event.stopPropagation();
    const id = event.dataTransfer!.getData(FINISH_DRAG_TYPE);
    if (id === brushId && getFinishPreset(id)) apply(event, id);
  }
  function leave() { clearHover(); }
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('dragover', dragover);
  canvas.addEventListener('drop', drop);
  canvas.addEventListener('dragleave', leave);
  window.addEventListener('blur', cancel);
  return {
    get active() { return press !== null; },
    setBrush(id: string | null) { cancel(); brushId = id && getFinishPreset(id) ? id : null; clearHover(); },
    dispose() {
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('dragover', dragover);
      canvas.removeEventListener('drop', drop); canvas.removeEventListener('dragleave', leave);
      window.removeEventListener('blur', cancel); cancel(); hint.remove();
      ring.removeFromParent(); ring.geometry.dispose(); ring.material.dispose();
      faceHover.removeFromParent(); faceHover.geometry.dispose(); faceHover.material.dispose();
    },
  };
}
