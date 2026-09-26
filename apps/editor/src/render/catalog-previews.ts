import * as THREE from 'three';
import type { CatalogAsset } from '../contracts';
import { disposeObject, makeFurniture } from './assets';

interface Preview {
  signature: string;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
}

/**
 * Real, event-driven 3D catalog views sharing one WebGL context. GLTF entries use
 * their procedural kind and dimensions here; browsing never downloads a model.
 * The scrolling container owns `.asset-preview[data-preview="asset-id"]` slots.
 * `.asset-preview.is-3d > svg` may be hidden once its model renders successfully.
 */
export function createCatalogPreviews(container: HTMLElement): {
  setAssets(assets: CatalogAsset[]): void;
  render(): void;
  dispose(): void;
} {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    // Keep the slot's ordinary icon when WebGL is unavailable.
    return { setAssets() {}, render() {}, dispose() {} };
  }

  const canvas = renderer.domElement;
  const overlay = document.createElement('div');
  overlay.className = 'catalog-preview-overlay';
  Object.assign(overlay.style, {
    position: 'sticky', top: '0', height: '0', zIndex: '2', pointerEvents: 'none',
  });
  canvas.className = 'catalog-preview-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', top: '0', left: '0', pointerEvents: 'none',
    display: 'block', background: 'transparent',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  overlay.append(canvas);
  container.prepend(overlay);

  const previews = new Map<string, Preview>();
  let assets = new Map<string, CatalogAsset>();
  let frame = 0;
  let disposed = false;
  let lost = false;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;

  const signature = (asset: CatalogAsset) => `${asset.kind}|${asset.color}|${asset.dimensions.join(',')}`;
  const removeReady = () => container.querySelectorAll('.asset-preview.is-3d').forEach(slot => slot.classList.remove('is-3d'));

  function makePreview(asset: CatalogAsset): Preview {
    const scene = new THREE.Scene();
    scene.add(makeFurniture(asset));
    scene.add(new THREE.HemisphereLight('#ffffff', '#b8bcc7', 2.1));
    const key = new THREE.DirectionalLight('#fff5e8', 3.0);
    key.position.set(-3, 5, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#d8e5ff', 1.3);
    fill.position.set(4, 2, -3);
    scene.add(fill);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    const center = new THREE.Vector3(0, asset.dimensions[1] / 2, 0);
    camera.position.copy(center).add(new THREE.Vector3(4, 3, 5).multiplyScalar(Math.max(...asset.dimensions)));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    // Fit the projected corners, including long beds and almost-flat rugs.
    // Store these extents so a resize only adjusts the camera's aspect ratio.
    const bounds = new THREE.Box3().setFromObject(scene);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
        }
      }
    }
    return { signature: signature(asset), scene, camera, width: (maxX - minX) * 1.23, height: (maxY - minY) * 1.23 };
  }

  function draw(): void {
    frame = 0;
    if (disposed || lost) return;
    const nextWidth = container.clientWidth;
    const nextHeight = container.clientHeight;
    if (!nextWidth || !nextHeight || !container.getClientRects().length) return;

    const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (pixelRatio !== nextRatio) {
      pixelRatio = nextRatio;
      renderer.setPixelRatio(pixelRatio);
    }
    if (width !== nextWidth || height !== nextHeight) {
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height);
    }

    // A zero-height sticky host pins the canvas without translating it into the
    // scrollable overflow. Filtering a long catalog can therefore shrink back
    // to a short list without the overlay retaining the old scroll position.
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.clear(true, true, true);

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const left = canvasRect.left;
    const top = canvasRect.top;
    const containerLeft = containerRect.left + container.clientLeft;
    const containerTop = containerRect.top + container.clientTop;
    const visibleLeft = Math.max(0, containerLeft - left);
    const visibleBottom = Math.max(0, height - (containerTop + height - top));
    const visibleRight = Math.min(width, containerLeft + width - left);
    const visibleTop = Math.min(height, height - (containerTop - top));
    renderer.setScissorTest(true);
    for (const slot of container.querySelectorAll<HTMLElement>('.asset-preview[data-preview]')) {
      const asset = assets.get(slot.dataset.preview ?? '');
      if (!asset) { slot.classList.remove('is-3d'); continue; }
      const rect = slot.getBoundingClientRect();
      const x = rect.left - left;
      const y = height - (rect.bottom - top);
      const clipLeft = Math.max(visibleLeft, x);
      const clipBottom = Math.max(visibleBottom, y);
      const clipRight = Math.min(visibleRight, x + rect.width);
      const clipTop = Math.min(visibleTop, y + rect.height);
      if (clipRight <= clipLeft || clipTop <= clipBottom || !rect.width || !rect.height) continue;

      let preview = previews.get(asset.id);
      try {
        if (!preview) {
          preview = makePreview(asset);
        }
        // Keep recently visible entries at the end for bounded LRU cleanup.
        previews.delete(asset.id);
        previews.set(asset.id, preview);
        const aspect = rect.width / rect.height;
        const halfHeight = Math.max(preview.height, preview.width / aspect) / 2;
        preview.camera.left = -halfHeight * aspect;
        preview.camera.right = halfHeight * aspect;
        preview.camera.top = halfHeight;
        preview.camera.bottom = -halfHeight;
        preview.camera.updateProjectionMatrix();

        // Preserve the full slot's viewport even when its edges are offscreen.
        // Scissor just clips pixels; it must never squash a partially shown model.
        renderer.setViewport(x, y, rect.width, rect.height);
        renderer.setScissor(clipLeft, clipBottom, clipRight - clipLeft, clipTop - clipBottom);
        renderer.clearDepth();
        renderer.render(preview.scene, preview.camera);
        slot.classList.add('is-3d');
      } catch {
        slot.classList.remove('is-3d');
      }
    }
    while (previews.size > 64) {
      const oldest = previews.entries().next().value;
      if (!oldest) break;
      disposeObject(oldest[1].scene);
      previews.delete(oldest[0]);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }

  function render(): void {
    if (!disposed && !lost && !frame) frame = requestAnimationFrame(draw);
  }
  function contextLost(event: Event): void {
    event.preventDefault();
    lost = true;
    removeReady();
  }
  function contextRestored(): void {
    lost = false;
    render();
  }
  const resize = new ResizeObserver(render);
  resize.observe(container);
  // Filtering replaces cards; observe child changes without reacting to canvas
  // transforms or the readiness classes updated by this renderer itself.
  const mutation = new MutationObserver(render);
  mutation.observe(container, { childList: true, subtree: true });
  container.addEventListener('scroll', render, { passive: true });
  window.addEventListener('resize', render);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);

  return {
    setAssets(nextAssets) {
      if (disposed) return;
      assets = new Map(nextAssets.map(asset => [asset.id, asset]));
      for (const [id, preview] of previews) {
        const asset = assets.get(id);
        if (!asset || signature(asset) !== preview.signature) {
          disposeObject(preview.scene);
          previews.delete(id);
        }
      }
      render();
    },
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      container.removeEventListener('scroll', render);
      window.removeEventListener('resize', render);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      removeReady();
      previews.forEach(preview => disposeObject(preview.scene));
      previews.clear();
      assets.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      overlay.remove();
    },
  };
}
