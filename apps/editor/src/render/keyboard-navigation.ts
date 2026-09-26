import * as THREE from 'three';

const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const MOVE_SPEED = 5;

interface NavigationOptions {
  camera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera;
  target: THREE.Vector3;
  enabled: () => boolean;
  start: () => void;
  stop: () => void;
  change: () => void;
  render: () => void;
}

/** Direct ground-plane navigation for the exterior cameras; no scene edits or inertia. */
export class KeyboardNavigationControls {
  private keys = new Set<string>();
  private lastTime: number | null = null;
  private right = new THREE.Vector3();
  private delta = new THREE.Vector3();
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, private options: NavigationOptions) {
    window.addEventListener('keydown', this.keyDown, true);
    window.addEventListener('keyup', this.keyUp, true);
    window.addEventListener('blur', this.cancel);
    document.addEventListener('visibilitychange', this.cancel);
    document.addEventListener('focusin', this.focusChanged);
    canvas.addEventListener('pointerdown', this.pointerDown, true);
  }

  get active(): boolean { return this.keys.size > 0; }

  private blocked(): boolean {
    return this.disposed || !this.options.enabled() || document.activeElement !== this.canvas
      || document.hidden || !this.canvas.getClientRects().length || !!document.querySelector('dialog[open]');
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) { this.cancel(); return; }
    const key = event.key.toLowerCase();
    if (!movementKeys.has(key)) return;
    if (this.blocked()) { this.cancel(); return; }
    // A held key must not restart travel after focus, a gesture, or a view switch cancels it.
    if (event.repeat && !this.keys.has(key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (this.keys.has(key)) return;
    const now = performance.now();
    if (this.active) this.update(now);
    const starting = !this.active;
    this.keys.add(key); this.lastTime = now;
    if (starting) this.options.start();
    this.options.render();
  };

  private keyUp = (event: KeyboardEvent): void => {
    if (!this.keys.has(event.key.toLowerCase())) return;
    // Include travel up to release even when the next render frame has not arrived yet.
    this.update(performance.now());
    if (!this.active) return;
    this.keys.delete(event.key.toLowerCase());
    if (!this.active) { this.lastTime = null; this.options.stop(); }
    else this.lastTime = performance.now();
    this.options.render();
  };

  private focusChanged = (): void => { if (document.activeElement !== this.canvas) this.cancel(); };
  private pointerDown = (): void => {
    if (!this.disposed && !document.hidden && !document.querySelector('dialog[open]')) this.canvas.focus({ preventScroll: true });
  };

  cancel = (): void => {
    const wasActive = this.active;
    this.keys.clear(); this.lastTime = null;
    if (wasActive) this.options.stop();
  };

  update(now: number): boolean {
    if (!this.active) return false;
    if (this.blocked()) { this.cancel(); return false; }
    const held = (...keys: string[]) => keys.some(key => this.keys.has(key)) ? 1 : 0;
    const forward = held('w', 'arrowup') - held('s', 'arrowdown');
    const sideways = held('d', 'arrowright') - held('a', 'arrowleft');
    const magnitude = Math.hypot(forward, sideways);
    const elapsed = Math.max(0, (now - (this.lastTime ?? now)) / 1000);
    this.lastTime = now;
    if (!magnitude) return false;
    // Preserve ordinary slow-frame speed, while bounding travel after a suspended frame.
    const dt = elapsed > 0.25 ? 0.05 : elapsed;
    const camera = this.options.camera();
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.right.y = 0; this.right.normalize();
    this.delta.set(this.right.x * sideways + this.right.z * forward, 0,
      this.right.z * sideways - this.right.x * forward).multiplyScalar(MOVE_SPEED * dt / magnitude);
    camera.position.add(this.delta);
    this.options.target.add(this.delta);
    this.options.change();
    return true;
  }

  dispose(): void {
    this.cancel(); this.disposed = true;
    window.removeEventListener('keydown', this.keyDown, true);
    window.removeEventListener('keyup', this.keyUp, true);
    window.removeEventListener('blur', this.cancel);
    document.removeEventListener('visibilitychange', this.cancel);
    document.removeEventListener('focusin', this.focusChanged);
    this.canvas.removeEventListener('pointerdown', this.pointerDown, true);
  }
}
