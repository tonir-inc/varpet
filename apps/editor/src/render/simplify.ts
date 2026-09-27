import * as THREE from 'three';

/** Catalog GLBs can carry 160k-triangle chairs; above this a mesh is simplified once, at load, off the main thread. */
export const MESH_TRIANGLE_BUDGET = 40_000;

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, (indices: Uint32Array | null) => void>();

function simplifier(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./simplify-worker.ts', import.meta.url), { type: 'module' });
    worker?.addEventListener('message', (event: MessageEvent<{ id: number; indices?: Uint32Array }>) => {
      pending.get(event.data.id)?.(event.data.indices ?? null); pending.delete(event.data.id);
    });
    worker?.addEventListener('error', () => { for (const resolve of pending.values()) resolve(null); pending.clear(); worker = null; });
  } catch { worker = null; }
  return worker;
}

/** Reduce every indexed mesh over the budget in place; any failure keeps the original detail. */
export async function simplifyHeavyMeshes(root: THREE.Object3D, budget = MESH_TRIANGLE_BUDGET): Promise<void> {
  const jobs: Promise<void>[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry, index = geometry.index, position = geometry.getAttribute('position');
    if (!index || !position || index.count / 3 <= budget || geometry.groups.length > 1) return;
    const target = simplifier(); if (!target) return;
    const positions = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex++) {
      positions[vertex * 3] = position.getX(vertex); positions[vertex * 3 + 1] = position.getY(vertex); positions[vertex * 3 + 2] = position.getZ(vertex);
    }
    const indices = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) indices[i] = index.getX(i);
    const id = nextId++;
    jobs.push(new Promise<void>(resolve => {
      pending.set(id, result => {
        if (result && result.length >= 3) geometry.setIndex(new THREE.BufferAttribute(result, 1));
        resolve();
      });
      target.postMessage({ id, indices, positions, target: budget * 3 }, [indices.buffer, positions.buffer]);
    }));
  });
  await Promise.all(jobs);
}
