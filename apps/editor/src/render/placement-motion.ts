import * as THREE from 'three';

type MotionKind = 'enter' | 'lift' | 'land';
type Pulse = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
interface Motion {
  visual: THREE.Group;
  root: THREE.Object3D;
  kind: MotionKind;
  started: number;
  duration: number;
  fromY: number;
  targetY: number;
  rebound: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  held: boolean;
  pulse?: Pulse;
  pulseX: number;
  pulseZ: number;
}

const floorRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const clamp = THREE.MathUtils.clamp;

/** Disposable presentation offsets; the visual's authoritative parent is never animated. */
export class PlacementMotion {
  private readonly motions = new Map<string, Motion>();
  // Geometry is shared by pulses; each pulse exclusively owns its material.
  private readonly pulseGeometry = new THREE.RingGeometry(0.972, 1, 64);
  private readonly relativeMatrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly worldScale = new THREE.Vector3();
  private readonly parentScale = new THREE.Vector3();
  private readonly media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  private disposed = false;
  private readonly onMotionPreference = (): void => {
    if (this.media?.matches) this.clear();
  };

  constructor(private readonly parent: THREE.Group, private readonly requestRender: () => void,
    private readonly now: () => number = () => performance.now()) {
    this.media?.addEventListener('change', this.onMotionPreference);
  }

  enter(id: string, visual: THREE.Group, dimensions: [number, number, number]): void {
    this.start(id, visual, dimensions, 'enter');
  }

  lift(id: string, visual: THREE.Group, dimensions: [number, number, number]): void {
    this.start(id, visual, dimensions, 'lift');
  }

  land(id: string, visual: THREE.Group, dimensions: [number, number, number]): void {
    this.start(id, visual, dimensions, 'land');
  }

  private reset(visual: THREE.Group): void {
    visual.position.set(0, 0, 0);
    visual.scale.set(1, 1, 1);
    visual.updateMatrix();
  }

  private release(id: string, restore: boolean): void {
    const motion = this.motions.get(id);
    if (!motion) return;
    if (restore) this.reset(motion.visual);
    if (motion.pulse) {
      motion.pulse.removeFromParent();
      motion.pulse.material.dispose();
    }
    this.motions.delete(id);
  }

  private start(id: string, visual: THREE.Group, dimensions: [number, number, number], kind: MotionKind): void {
    if (this.disposed) return;
    const now = this.now();
    const previous = this.motions.get(id);
    // Sample an interrupted animation so picking up and releasing stays continuous.
    if (previous?.visual === visual) this.advance(previous, now);
    this.release(id, previous?.visual !== visual);
    const root = visual.parent;
    if (this.media?.matches || !root) {
      this.reset(visual);
      this.requestRender();
      return;
    }

    root.getWorldScale(this.worldScale);
    const scaleY = Math.max(Math.abs(this.worldScale.y), 0.0001);
    const height = Math.abs(dimensions[1]) * scaleY;
    if (kind === 'enter') {
      visual.position.y = clamp(height * 0.24, 0.2, 0.45) / scaleY;
      visual.scale.setScalar(0.94);
    }
    const motion: Motion = {
      visual, root, kind, started: now,
      duration: kind === 'enter' ? 520 : kind === 'lift' ? 100 : 180,
      fromY: visual.position.y,
      targetY: kind === 'lift' ? clamp(height * 0.025, 0.02, 0.04) / scaleY : 0,
      rebound: (kind === 'enter' ? 0.032 : 0.018) / scaleY,
      scaleX: visual.scale.x, scaleY: visual.scale.y, scaleZ: visual.scale.z,
      held: false, pulseX: 0, pulseZ: 0,
    };
    if (kind !== 'lift') this.makePulse(motion, dimensions);
    this.motions.set(id, motion);
    this.advance(motion, now);
    this.requestRender();
  }

  private makePulse(motion: Motion, dimensions: [number, number, number]): void {
    this.parent.updateWorldMatrix(true, false);
    motion.root.updateWorldMatrix(true, false);
    this.relativeMatrix.copy(this.parent.matrixWorld).invert().multiply(motion.root.matrixWorld);
    this.relativeMatrix.decompose(this.position, this.rotation, this.scale);
    this.parent.getWorldScale(this.parentScale);
    const material = new THREE.MeshBasicMaterial({
      color: '#b6a0d6', transparent: true, opacity: 0,
      depthTest: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    const pulse = new THREE.Mesh(this.pulseGeometry, material);
    pulse.name = 'Placement contact';
    pulse.position.copy(this.position);
    pulse.position.y += 0.012 / Math.max(Math.abs(this.parentScale.y), 0.0001);
    pulse.quaternion.copy(this.rotation).multiply(floorRotation);
    pulse.raycast = () => {};
    motion.pulseX = Math.abs(dimensions[0] * this.scale.x) / 2 + 0.065;
    motion.pulseZ = Math.abs(dimensions[2] * this.scale.z) / 2 + 0.065;
    pulse.scale.set(motion.pulseX, motion.pulseZ, 1);
    motion.pulse = pulse;
    this.parent.add(pulse);
  }

  /** Returns whether another frame is needed. A held lift does not run a render loop. */
  private advance(motion: Motion, now: number): boolean {
    if (motion.held) return false;
    const t = clamp((now - motion.started) / motion.duration, 0, 1);
    const eased = 1 - (1 - t) ** 3;
    let squash = 0;
    if (motion.kind === 'lift') {
      const smooth = t * t * (3 - 2 * t);
      motion.visual.position.y = motion.fromY + (motion.targetY - motion.fromY) * smooth;
    } else if (motion.kind === 'land') {
      // Precision edits settle once, without elastic rebound or changing size.
      // New catalog arrivals retain their separate entrance choreography.
      motion.visual.position.y = motion.fromY * (1 - eased);
      if (motion.pulse) {
        motion.pulse.scale.set(motion.pulseX * (1 + t * 0.08), motion.pulseZ * (1 + t * 0.08), 1);
        motion.pulse.material.opacity = Math.sin(Math.PI * t) * (1 - t) * 0.2;
        motion.pulse.visible = t > 0 && t < 1;
      }
    } else {
      const impact = motion.kind === 'enter' ? 0.6 : 0.46;
      if (t < impact) {
        const falling = t / impact;
        motion.visual.position.y = motion.fromY * (1 - falling * falling);
      } else {
        const settling = (t - impact) / (1 - impact);
        motion.visual.position.y = motion.rebound * Math.sin(settling * Math.PI) * (1 - settling);
        squash = Math.sin(Math.min(settling * 2, 1) * Math.PI) * 0.009;
      }
      if (motion.pulse) {
        const progress = clamp((t - impact) / (1 - impact), 0, 1);
        const expansion = 1 + progress * 0.16;
        motion.pulse.scale.set(motion.pulseX * expansion, motion.pulseZ * expansion, 1);
        motion.pulse.material.opacity = Math.sin(Math.PI * progress) * (1 - progress) * 0.34;
        motion.pulse.visible = progress > 0 && progress < 1;
      }
    }
    motion.visual.scale.set(
      motion.scaleX + (1 - motion.scaleX) * eased + squash * 0.35,
      motion.scaleY + (1 - motion.scaleY) * eased - squash,
      motion.scaleZ + (1 - motion.scaleZ) * eased + squash * 0.35,
    );
    if (t === 1) {
      this.reset(motion.visual);
      if (motion.kind === 'lift') {
        motion.visual.position.y = motion.targetY;
        motion.visual.updateMatrix();
        motion.held = true;
      }
    } else motion.visual.updateMatrix();
    return t < 1;
  }

  stop(id: string): void {
    if (!this.motions.has(id)) return;
    this.release(id, true);
    this.requestRender();
  }

  clear(): void {
    if (!this.motions.size) return;
    for (const id of this.motions.keys()) this.release(id, true);
    this.requestRender();
  }

  update(now: number): boolean {
    if (this.disposed) return false;
    let animating = false;
    for (const [id, motion] of this.motions) {
      if (motion.visual.parent !== motion.root || !motion.root.parent) {
        this.release(id, true);
      } else if (this.advance(motion, now)) animating = true;
      else if (!motion.held) this.release(id, true);
    }
    return animating;
  }

  dispose(): void {
    if (this.disposed) return;
    this.media?.removeEventListener('change', this.onMotionPreference);
    this.clear();
    this.disposed = true;
    this.pulseGeometry.dispose();
  }
}
