import type * as THREE from 'three';

/** Opt-in (`?perf`) handle for the Playwright frame-time harness; absent in normal use. */
export interface PerfProbe {
  viewport: unknown;
  renderer: THREE.WebGLRenderer;
  world: THREE.Scene;
  /** One entry per rendered frame, oldest first: CPU submit ms, draw calls and triangles over all passes. The harness drains it. */
  submits: Array<{ at: number; ms: number; calls: number; triangles: number }>;
}

export function installPerfProbe(target: Omit<PerfProbe, 'submits'>): PerfProbe | undefined {
  if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('perf')) return undefined;
  const probe: PerfProbe = { ...target, submits: [] };
  (globalThis as { __varpetPerf?: PerfProbe }).__varpetPerf = probe;
  return probe;
}
