import * as THREE from 'three';
import type { Vec2, Vec3 } from '../contracts';

const WALK_SPEED = 2.8;
const ACCELERATION_TIME = 0.095, STOP_TIME = 0.025, STOP_SPEED = 0.008;
const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/** Grounded, drag-to-look navigation. Shares the viewport's demand-driven frame loop. */
export class WalkthroughControls {
  private active = false;
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  private angles = new THREE.Euler(0, 0, 0, 'YXZ');
  private lastTime: number | null = null;
  private velocity: Vec2 = [0, 0];
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement,
    private move: (position: Vec3, delta: Vec2) => Vec3, private render: () => void, private tap?: (event: PointerEvent) => void) {
    canvas.addEventListener('pointerdown', this.down, true);
    canvas.addEventListener('pointermove', this.look, true);
    canvas.addEventListener('pointerup', this.up, true);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.cancel);
    canvas.addEventListener('contextmenu', this.context);
    window.addEventListener('keydown', this.keyDown, true);
    window.addEventListener('keyup', this.keyUp, true);
    window.addEventListener('blur', this.cancel);
    document.addEventListener('visibilitychange', this.cancel);
    document.addEventListener('focusin', this.focusChanged);
    this.reducedMotion.addEventListener('change', this.preferenceChanged);
  }
  setEnabled(enabled: boolean): void {
    this.cancel(); this.active = enabled;
    this.canvas.style.cursor = enabled ? 'grab' : '';
    if (enabled) { this.angles.setFromQuaternion(this.camera.quaternion, 'YXZ'); this.canvas.focus({ preventScroll: true }); }
  }
  orient(): void { this.cancel(); this.angles.setFromQuaternion(this.camera.quaternion, 'YXZ'); }
  private blocked(): boolean {
    return document.activeElement !== this.canvas || !!document.querySelector('dialog[open]') || document.hidden;
  }
  private keyDown = (event: KeyboardEvent): void => {
    if (!this.active || !movementKeys.has(event.key.toLowerCase())) return;
    if (this.blocked() || event.metaKey || event.ctrlKey || event.altKey) { this.cancel(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (this.lastTime === null) this.lastTime = performance.now();
    this.keys.add(event.key.toLowerCase()); this.render();
  };
  private keyUp = (event: KeyboardEvent): void => {
    if (!this.keys.delete(event.key.toLowerCase())) return;
    if (this.lastTime === null) this.lastTime = performance.now();
    this.render();
  };
  private preferenceChanged = (): void => { if (this.active) this.render(); };
  private focusChanged = (): void => { if (document.activeElement !== this.canvas) this.cancel(); };
  private down = (event: PointerEvent): void => {
    if (!this.active || event.button !== 0 || document.hidden || document.querySelector('dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    this.canvas.focus({ preventScroll: true });
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    this.canvas.setPointerCapture(event.pointerId); this.canvas.style.cursor = 'grabbing';
  };
  private look = (event: PointerEvent): void => {
    if (!this.active || !this.pointer || this.pointer.id !== event.pointerId) return;
    if (this.blocked()) { this.cancel(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY) > 5) this.pointer.moved = true;
    this.angles.y -= (event.clientX - this.pointer.x) * 0.003;
    this.angles.x = THREE.MathUtils.clamp(this.angles.x - (event.clientY - this.pointer.y) * 0.003, -Math.PI * 0.45, Math.PI * 0.45);
    this.camera.quaternion.setFromEuler(this.angles);
    this.pointer.x = event.clientX; this.pointer.y = event.clientY; this.render();
  };
  private up = (event: PointerEvent): void => {
    if (!this.active) return;
    const pointer = this.pointer;
    const tapped = pointer && pointer.id === event.pointerId && event.button === 0 && !pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) <= 5 && !this.blocked();
    event.stopImmediatePropagation(); this.releasePointer();
    if (tapped) this.tap?.(event);
  };
  private context = (event: Event): void => { if (this.active) event.preventDefault(); };
  private releasePointer(): void {
    const id = this.pointer?.id; this.pointer = null;
    if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    if (this.active) this.canvas.style.cursor = 'grab';
  }
  cancel = (): void => { this.keys.clear(); this.velocity = [0, 0]; this.lastTime = null; this.releasePointer(); };
  update(now: number): boolean {
    if (!this.active) return false;
    if (this.blocked()) { this.cancel(); return false; }
    const held = (...keys: string[]) => keys.some(key => this.keys.has(key)) ? 1 : 0;
    const forward = held('w', 'arrowup') - held('s', 'arrowdown');
    const right = held('d', 'arrowright') - held('a', 'arrowleft');
    const magnitude = Math.hypot(forward, right), scale = WALK_SPEED / (magnitude || 1);
    const sin = Math.sin(this.angles.y), cos = Math.cos(this.angles.y);
    const target: Vec2 = [(right * cos - forward * sin) * scale, (-right * sin - forward * cos) * scale];
    const elapsed = Math.max(0, (now - (this.lastTime ?? now)) / 1000);
    // Keep real-time speed on slow frames. Only discard time after a substantial
    // stall, so resuming a suspended frame cannot jump across the apartment.
    const dt = elapsed > 0.25 ? 0.05 : elapsed;
    this.lastTime = now;
    const delta: Vec2 = [0, 0];
    // Exact integration of an exponential response keeps travel consistent across frame rates.
    // A shorter stop response limits full-speed key-release drift to about seven centimetres.
    const response = magnitude ? ACCELERATION_TIME : STOP_TIME, decay = Math.exp(-dt / response);
    for (const axis of [0, 1] as const) {
      if (this.reducedMotion.matches) {
        this.velocity[axis] = target[axis]; delta[axis] = target[axis] * dt;
      } else {
        const difference = this.velocity[axis] - target[axis];
        delta[axis] = target[axis] * dt + difference * response * (1 - decay);
        this.velocity[axis] = target[axis] + difference * decay;
      }
    }
    if (Math.hypot(...delta) > 0) {
      const before = this.camera.position.toArray(), after = this.move(before, delta);
      this.camera.position.fromArray(after);
      // A movement adapter may constrain travel; never retain momentum against its limit.
      if (Math.abs(after[0] - before[0] - delta[0]) > 1e-5) this.velocity[0] = 0;
      if (Math.abs(after[2] - before[2] - delta[1]) > 1e-5) this.velocity[1] = 0;
    }
    if (!magnitude && Math.hypot(...this.velocity) < STOP_SPEED) this.velocity = [0, 0];
    const moving = magnitude > 0 || Math.hypot(...this.velocity) > 0;
    if (!moving) this.lastTime = null;
    return moving;
  }
  dispose(): void {
    this.setEnabled(false);
    this.canvas.removeEventListener('pointerdown', this.down, true);
    this.canvas.removeEventListener('pointermove', this.look, true);
    this.canvas.removeEventListener('pointerup', this.up, true);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('lostpointercapture', this.cancel);
    this.canvas.removeEventListener('contextmenu', this.context);
    window.removeEventListener('keydown', this.keyDown, true);
    window.removeEventListener('keyup', this.keyUp, true);
    window.removeEventListener('blur', this.cancel);
    document.removeEventListener('visibilitychange', this.cancel);
    document.removeEventListener('focusin', this.focusChanged);
    this.reducedMotion.removeEventListener('change', this.preferenceChanged);
  }
}
