import * as THREE from 'three';
import type { CatalogAsset, SceneDocument, SceneObject, Vec3 } from '../contracts';
import { floorSupported, validateScene } from '../core/validation';
import { placementConflicts } from '../core/placement-conflicts';
import { FURNITURE_DRAG_TYPE } from '../ui/furniture-drag';
import { PlacementFeedback } from './placement-feedback';

export interface FurnitureDropOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  world: THREE.Scene;
  camera(): THREE.Camera;
  scene(): SceneDocument | null;
  catalog(): CatalogAsset[];
  snap(): boolean;
  enabled(): boolean;
  render(): void;
  interaction(active: boolean): void;
  apply(assetId: string, position: Vec3): void;
  error(message: string): void;
}

/** Disposable bounds follow the pointer. Only the checked host callback adds furniture. */
export function createFurnitureDrop(options: FurnitureDropOptions) {
  const { canvas } = options;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const bounds = new THREE.Group(); bounds.name = 'Furniture drop preview'; bounds.visible = false;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#b6b3c2', transparent: true, opacity: .16, depthWrite: false, toneMapped: false }));
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#65d6ad', transparent: true, opacity: .95, depthTest: false, depthWrite: false, toneMapped: false }));
  fill.renderOrder = 870; outline.renderOrder = 871;
  fill.raycast = () => {}; outline.raycast = () => {};
  bounds.add(fill, outline); options.world.add(bounds);
  const feedback = new PlacementFeedback(options.container); options.world.add(feedback.group);
  const hint = document.createElement('div');
  hint.className = 'furniture-drop-hint'; hint.hidden = true; hint.setAttribute('role', 'status');
  hint.style.cssText = 'position:absolute;z-index:12;pointer-events:none;padding:8px 12px;border:1px solid #65d6ad;border-radius:9px;background:#25222eef;color:#f0eaff;font-size:12px;box-shadow:0 6px 24px #0004;max-width:270px;';
  options.container.append(hint);
  let asset: CatalogAsset | null = null;
  let candidateId = '';
  let disposed = false;
  let last: { scene: SceneDocument; asset: CatalogAsset; x: number; z: number; valid: boolean; error?: string; warnings: boolean } | null = null;

  function clearPreview(): void {
    bounds.visible = false; hint.hidden = true; feedback.clear(); last = null;
    options.render();
  }
  function cancel(): void {
    const wasActive = asset !== null;
    asset = null; clearPreview();
    if (wasActive) options.interaction(false);
  }
  function setAsset(next: CatalogAsset | null): void {
    cancel();
    if (disposed || !next || !options.enabled()) return;
    asset = next; candidateId = `furniture-preview-${crypto.randomUUID()}`;
    bounds.scale.set(next.dimensions[0], next.dimensions[1], next.dimensions[2]);
    options.interaction(true);
  }
  function matches(event: DragEvent): boolean {
    return !!asset && !!event.dataTransfer?.types.includes(FURNITURE_DRAG_TYPE);
  }
  function hover(event: Pick<DragEvent, 'clientX' | 'clientY'>) {
    const scene = options.scene();
    if (!asset || !scene || !options.enabled()) { clearPreview(); return null; }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { clearPreview(); return null; }
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    const camera = options.camera(); camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
    const point = raycaster.ray.intersectPlane(floor, new THREE.Vector3());
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) { clearPreview(); return null; }
    const x = options.snap() ? Math.round(point.x * 4) / 4 : point.x;
    const z = options.snap() ? Math.round(point.z * 4) / 4 : point.z;
    if (!last || last.scene !== scene || last.asset !== asset || last.x !== x || last.z !== z) {
      const object: SceneObject = { id: candidateId, name: asset.name, assetId: asset.id, position: [x, 0, z], rotation: 0, scale: [1, 1, 1] };
      const catalog = options.catalog();
      const supported = floorSupported(object, asset, scene);
      const validation = validateScene({ ...scene, objects: [...scene.objects, object] }, catalog);
      const conflicts = placementConflicts(scene, catalog, object);
      const valid = supported && validation.ok;
      const error = !supported ? 'Place the whole piece on the apartment floor.' : validation.errors[0];
      last = { scene, asset, x, z, valid, error, warnings: conflicts.length > 0 };
      feedback.update(conflicts);
      outline.material.color.set(valid && !conflicts.length ? '#65d6ad' : '#ff5660');
      hint.style.borderColor = valid && !conflicts.length ? '#65d6ad' : '#ff5660';
    }
    bounds.visible = true; bounds.position.set(x, asset.dimensions[1] / 2, z);
    const host = options.container.getBoundingClientRect();
    hint.hidden = false;
    hint.style.left = `${Math.max(8, Math.min(host.width - 285, event.clientX - host.left + 18))}px`;
    hint.style.top = `${Math.max(8, Math.min(host.height - 65, event.clientY - host.top + 18))}px`;
    hint.textContent = last.valid ? `Drop to add ${asset.name}${last.warnings ? ' · placement needs review' : ''}` : last.error ?? 'Furniture cannot be placed here.';
    options.render();
    return last;
  }
  function over(event: DragEvent): void {
    if (!matches(event)) return;
    event.preventDefault();
    const target = hover(event);
    if (event.dataTransfer) event.dataTransfer.dropEffect = target?.valid ? 'copy' : 'none';
  }
  function drop(event: DragEvent): void {
    if (!matches(event)) return;
    event.preventDefault(); event.stopPropagation();
    const current = asset;
    const id = event.dataTransfer!.getData(FURNITURE_DRAG_TYPE);
    const target = id === current?.id ? hover(event) : null;
    // Release the host's interaction gate before submitting one revisioned add.
    cancel();
    if (target?.valid && current) options.apply(current.id, [target.x, 0, target.z]);
    else options.error(target?.error ?? 'Drop furniture onto the apartment floor.');
  }
  function key(event: KeyboardEvent): void { if (event.key === 'Escape') cancel(); }
  canvas.addEventListener('dragover', over);
  canvas.addEventListener('drop', drop);
  canvas.addEventListener('dragleave', clearPreview);
  window.addEventListener('dragend', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', key);
  return {
    get active() { return asset !== null; },
    setAsset,
    cancel,
    dispose(): void {
      if (disposed) return;
      disposed = true; cancel();
      canvas.removeEventListener('dragover', over); canvas.removeEventListener('drop', drop); canvas.removeEventListener('dragleave', clearPreview);
      window.removeEventListener('dragend', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key);
      bounds.removeFromParent(); geometry.dispose(); fill.material.dispose(); outline.geometry.dispose(); outline.material.dispose();
      feedback.dispose(); hint.remove();
    },
  };
}
