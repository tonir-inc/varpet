// @ts-expect-error three ships this WASM helper without type declarations.
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

interface Request { id: number; indices: Uint32Array; positions: Float32Array; target: number }

/** Mesh simplification off the main thread: returns a reduced index buffer over the same vertices. */
self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, indices, positions, target } = event.data;
  try {
    await MeshoptSimplifier.ready;
    const [result] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.01, []) as [Uint32Array, number];
    (self as unknown as Worker).postMessage({ id, indices: result }, [result.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: String(error) });
  }
};
