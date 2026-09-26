import type * as THREE from 'three';

/** Shared timings in milliseconds for disposable presentation changes. */
export const MOTION = { feedback: 140, surface: 220, transform: 280, camera: 420, wall: 280 } as const;

type MotionKey = object | string;
interface MotionJob {
  started: number;
  duration: number;
  apply: (eased: number) => void;
  complete?: () => void;
}

/** Advances only on the viewport's existing frame loop; never owns a second RAF. */
export class MotionTimeline {
  private readonly jobs = new Map<MotionKey, MotionJob>();
  private readonly media: MediaQueryList | null;
  private disposed = false;
  private readonly onPreference = (): void => {
    if (this.reduced) this.finishAll();
  };

  constructor(
    private readonly requestRender: () => void,
    private readonly reducedMotion?: () => boolean,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.media = !reducedMotion && typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.media?.addEventListener('change', this.onPreference);
  }

  get reduced(): boolean { return this.reducedMotion?.() ?? this.media?.matches ?? false; }

  /** Call sample(key) before capturing the current pose for an interruptible replacement. */
  animate(key: MotionKey, duration: number, apply: (eased: number) => void, complete?: () => void): void {
    if (this.disposed) return;
    this.cancel(key);
    if (this.reduced || duration <= 0 || !Number.isFinite(duration)) {
      apply(1);
      complete?.();
    } else {
      this.jobs.set(key, { started: this.now(), duration, apply, complete });
      apply(0);
    }
    this.requestRender();
  }

  private advance(key: MotionKey, job: MotionJob, now: number): void {
    const elapsed = Math.max(0, Math.min(1, (now - job.started) / job.duration));
    if (elapsed === 1) {
      // Remove first: a completion may schedule another animation with this key.
      this.jobs.delete(key);
      job.apply(1);
      job.complete?.();
    } else job.apply(1 - (1 - elapsed) ** 3);
  }

  /** Returns true only while the host needs another animation frame. */
  update(now = this.now()): boolean {
    if (this.disposed) return false;
    if (this.reduced) this.finishAll();
    else for (const [key, job] of [...this.jobs]) {
      // Completion callbacks may enqueue or cancel work; only sample this frame's jobs.
      if (this.jobs.get(key) === job) this.advance(key, job, now);
    }
    return this.jobs.size > 0;
  }

  sample(key: MotionKey): void {
    if (this.disposed) return;
    const job = this.jobs.get(key);
    if (!job) return;
    if (this.reduced) this.finish(key);
    else {
      this.advance(key, job, this.now());
      this.requestRender();
    }
  }

  finish(key: MotionKey): void {
    if (this.disposed) return;
    const job = this.jobs.get(key);
    if (!job) return;
    this.jobs.delete(key);
    job.apply(1);
    job.complete?.();
    this.requestRender();
  }

  /** Freezes the current displayed pose without firing an obsolete completion. */
  cancel(key: MotionKey): void { this.jobs.delete(key); }

  finishAll(): void {
    if (this.disposed || !this.jobs.size) return;
    const jobs = [...this.jobs.values()];
    this.jobs.clear();
    for (const job of jobs) {
      job.apply(1);
      job.complete?.();
    }
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.jobs.clear();
    this.media?.removeEventListener('change', this.onPreference);
  }
}

interface MaterialState { opacity: number; transparent: boolean; depthWrite: boolean }
const materialStates = new WeakMap<THREE.Material, MaterialState>();
const shadowStates = new WeakMap<THREE.Object3D, boolean>();

/**
 * Fade projection-owned materials without replacing finish shader hooks/uniforms.
 * Do not overlap fades on groups sharing the same materials. A complete fade-in
 * restores material flags and shadows; callers dispose removed projections as usual.
 */
export function setProjectionOpacity(group: THREE.Object3D, amount: number): void {
  const opacity = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 1;
  group.visible = opacity > 0;
  group.traverse(object => {
    if (!('material' in object)) return;
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      let original = materialStates.get(item);
      if (!original) {
        original = { opacity: item.opacity, transparent: item.transparent, depthWrite: item.depthWrite };
        materialStates.set(item, original);
      }
      const transparent = opacity < 1 || original.transparent;
      if (item.transparent !== transparent) item.needsUpdate = true;
      item.opacity = original.opacity * opacity;
      item.transparent = transparent;
      item.depthWrite = opacity === 1 ? original.depthWrite : false;
      if (opacity === 1) materialStates.delete(item);
    }
    if (!shadowStates.has(object)) shadowStates.set(object, object.castShadow);
    object.castShadow = opacity === 1 ? shadowStates.get(object)! : false;
    if (opacity === 1) shadowStates.delete(object);
  });
}
