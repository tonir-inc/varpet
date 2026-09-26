import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KeyboardNavigationControls } from '../render/keyboard-navigation';
import { HandPanControls } from '../render/hand-pan';
import { disposeObject, normalizeAsset } from '../render/assets';
import { makeOpening, type OpeningProjection } from '../render/structure';
import { OpeningAssetLoader } from '../render/opening-assets';
import { registerPlan } from './plan-registration';
import type { EntityMetadata, Wall } from '../contracts';
import './architect-stage.css';

/**
 * The construction view: what people watch while the architect builds their flat.
 * Everything drawn comes from the run's own events (plan, photos, shell, built pieces,
 * placements, activity lines); timing is driven by a serial work queue so a slow live
 * run and an 8x replay both read well.
 */

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Source = File | Blob | string;

export interface StageRoom { id: string; name: string; polygon: Vec2[]; color?: string }
export interface StageOpening { id?: string; kind: 'door' | 'window'; offset: number; width: number; height: number; sill: number }
export interface StageWall { id: string; start: Vec2; end: Vec2; height: number; thickness: number; color?: string; openings?: StageOpening[] }
export interface StageComponent {
  id: string; name?: string; kind: string; position: Vec3; dimensions: Vec3; rotation?: number; color?: string;
  host?: { wallId: string; offset: number; elevation: number; side: number };
}
export interface StageAsset { id: string; name: string; kind?: string; dimensions: Vec3; color?: string; source: { type: string; url: string } }
export interface StagePlacement { id: string; name?: string; assetId: string; position: Vec3; rotation?: number }

export type StageEvent =
  | { type: 'activity'; who?: string; kind: 'command' | 'file' | 'thought'; text: string; t?: number }
  | { type: 'shell'; rooms: StageRoom[]; walls: StageWall[]; components?: StageComponent[]; metadata?: Record<string, EntityMetadata>; t?: number }
  | { type: 'pieces'; pieces: { id: string; size: Vec3; count: number }[]; t?: number }
  | { type: 'piece'; piece: string; count?: number; asset: StageAsset; t?: number }
  | { type: 'placements'; objects: StagePlacement[]; lights?: StageComponent[]; t?: number }
  | { type: 'project'; project: unknown; t?: number }
  | { type: 'progress'; message: string; t?: number };

export interface ArchitectStage {
  /** Follow the phase the stage is currently showing; returns an unsubscribe function. */
  onPhase(cb: (phase: StagePhase) => void): () => void;
  start(plan: Source, photos: Source[]): void;
  /** Load a fresh stage's recorded checkpoint without replaying earlier animation or phase holds. */
  hydrate(events: StageEvent[], phase: StagePhase): Promise<void>;
  event(e: StageEvent): void;
  progress(message: string): void;
  finish(): Promise<void>;
  dispose(): void;
  /** Blueprint theme: where the plan sheet sits on screen (viewport pixels), for a 2D handoff. */
  planRect(): { left: number; top: number; width: number; height: number } | undefined;
  /** Blueprint theme: tilt from the flat sheet into the 3D construction view. */
  enter(): void;
  /**
   * Glide camera, lens and backdrop into another 3D view's live pose, framed as that view's
   * rectangle on screen, so the other view can replace this one without a visible cut.
   */
  settle(view: () => HandoverView | null, duration?: number): Promise<void>;
}

/** Where the receiving editor's camera is, and the screen rectangle it renders into. */
export interface HandoverView {
  position: Vec3; target: Vec3; fov: number; background: string | null;
  rect: { left: number; top: number; width: number; height: number };
}

export type StagePhase = 'reading' | 'walls' | 'building' | 'placing' | 'checking' | 'done';
const PHASES: StagePhase[] = ['reading', 'walls', 'building', 'placing', 'checking'];
export interface ArchitectStageOptions { onPhase?: (phase: StagePhase) => void; holdOnFinish?: boolean; blueprint?: BlueprintTheme }
/**
 * A drafting-sheet presentation: light ink on blueprint paper. The stage opens looking straight
 * down at the traced plan so a flat 2D sheet can hand over to it, then tilts on `enter()`.
 */
export interface BlueprintTheme {
  /** The traced plan: ink coverage in alpha, and optionally the pen order (0..1) in red for the working trace. */
  ink: HTMLCanvasElement;
  /** Paper colour, shared with the page behind the stage. */
  paper: string;
  /** Screen space kept clear of overlaid text, in CSS pixels. */
  insets?: () => { top: number; bottom: number };
}
const ACCENT = new THREE.Color('#0c6a55');
const BLUEPRINT_INK = new THREE.Color('#e6f3f2');
/** Looking straight down, with enough tilt for a stable up vector. */
const TOP_DOWN = Math.PI / 2 - 0.002;
const PHASE_HOLD = 3.2;
const NOMINAL_PLAN_WIDTH = 10;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const humanise = (id: string) => { const s = id.replace(/[-_]+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
const partGroup = (name: string) => name.replace(/@.*$/, '').replace(/[-_]?\d+$/, '') || name;

interface Box2 { minX: number; maxX: number; minZ: number; maxZ: number }
/** A door or window waiting for its walls: where it is, and how to bring it in. */
interface Install { point: THREE.Vector2; install(at: number): void }
interface Tween { start: number; dur: number; fn: (k: number) => void; resolve: () => void; shell?: number }
interface Photo { group: THREE.Group; aspect: number; feature: number; fade: number; index: number }
interface Slot {
  id: string; name: string; footprint: Vec2; center: THREE.Vector3; count: number;
  outline: LineSegments2; outlineMat: LineMaterial; model?: THREE.Group; built: boolean; lamp?: LampInfo; placed: number;
}
interface LampInfo { glow: THREE.MeshStandardMaterial[] }
interface Rig { target: THREE.Vector3; radius: number; el: number; az: number; orbit: number; sway: number }

/** Snapshot hydration also waits for the stock opening models to replace their procedural previews. */
class StageOpeningAssets extends OpeningAssetLoader {
  readonly pending = new Set<Promise<unknown>>();

  override load(...args: Parameters<OpeningAssetLoader['load']>): ReturnType<OpeningAssetLoader['load']> {
    const loading = super.load(...args);
    this.pending.add(loading);
    void loading.then(() => this.pending.delete(loading), () => this.pending.delete(loading));
    return loading;
  }
}

class Stage implements ArchitectStage {
  private readonly root = document.createElement('div');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  private readonly controls: OrbitControls;
  private readonly keyboard: KeyboardNavigationControls;
  private readonly handPan: HandPanControls;
  private readonly navigation: HTMLElement;
  private manualCamera = false;
  private orbitActive = false;
  private layoutInsets = { top: -1, bottom: -1 };
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envTexture: THREE.Texture;
  private readonly motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  private reduced = this.motionQuery?.matches ?? false;
  private readonly loader = new GLTFLoader();
  private readonly openingAssets = new StageOpeningAssets();
  private readonly assets = new Set<Promise<unknown>>();
  private readonly resize: ResizeObserver;
  private readonly lineMats = new Set<LineMaterial>();
  private readonly urls: string[] = [];
  private readonly tweens: Tween[] = [];
  private cameraToken = 0;
  private raf = 0;
  private inFrame = false;
  private now = 0;
  private last = performance.now();
  private disposed = false;
  private started = false;
  private hydrating = false;
  private cancelHydration: (() => void) | undefined;
  private finishing: Promise<void> | undefined;
  private shellRevision = 0;
  private shellReady: Promise<void> = Promise.resolve();
  private readonly openings = new Map<string, { projection: OpeningProjection; ready: boolean; token: number; button: HTMLButtonElement }>();
  private readonly raycaster = new THREE.Raycaster();
  private pointerStart: { x: number; y: number; id: number } | undefined;
  private readonly pointers = new Set<number>();

  private readonly rig: Rig = { target: new THREE.Vector3(), radius: 24, el: 0.95, az: -0.2, orbit: 0, sway: 0 };
  /** Drafting colour: the designer's green on paper, light ink on a blueprint. */
  private readonly accent = ACCENT.clone();
  private entered = false;
  /** Set by settle(): the camera follows the handover, not the orbit rig. */
  private pinned = false;
  private readonly hemi = new THREE.HemisphereLight('#cfd6ff', '#1d2130', 0.55);
  private readonly sun = new THREE.DirectionalLight('#e9ecff', 1.4);

  // Plan sheet and blueprint ground.
  private readonly sheetUniforms = {
    uMap: { value: null as THREE.Texture | null }, uHasMap: { value: 0 }, uScan: { value: -1 }, uBand: { value: 1 },
    uReveal: { value: 0 }, uDim: { value: 1 }, uOpacity: { value: 0 }, uErase: { value: -0.1 }, uAccent: { value: ACCENT.clone() },
    uBlueprint: { value: 0 }, uTrace: { value: -1 }, uTraceOn: { value: 0 },
  };
  private readonly gridUniforms = { uOpacity: { value: 1 }, uColor: { value: ACCENT.clone() }, uCenter: { value: new THREE.Vector2() } };
  private readonly sheet: THREE.Mesh;
  private planAspect = 1.4;
  private scanning = false;
  /** Blueprint theme: the traced plan's ink, kept to register the returned walls against it. */
  private inkAlpha: { alpha: Uint8ClampedArray; width: number; height: number } | undefined;
  /** While the architect works and no shell has arrived, light keeps running along the plan's lines. */
  private tracing = false;
  private scanClock = 0;
  private photos: Photo[] = [];
  private photosOut = false;

  // Flat.
  private readonly flat = new THREE.Group();
  private readonly shell = new THREE.Group();
  private readonly bench = new THREE.Group();
  private readonly fx = new THREE.Group();
  private flatBox: Box2 | undefined;
  private readonly draftMats = new Set<LineMaterial>();
  private floorUniforms: { uFloodRadius: { value: number } }[] = [];
  private wallMats = new Map<string, THREE.MeshStandardMaterial>();

  // Workbench.
  private slots = new Map<string, Slot>();
  private benchX0 = 0;
  private benchZ: [number, number] = [0, 0];
  private benchZ0 = 0;
  private frameFn: (() => Partial<Rig>) | undefined;
  private refitTimer = 0;
  private benchPlate: THREE.Mesh | undefined;
  private benchLabel: CSS2DObject | undefined;
  private building = 0;
  private waiting: (() => void)[] = [];
  private assemblies = new Set<Promise<void>>();
  private placing: Promise<void> | undefined;
  /** Set once placements arrive or finish() starts: unbuilt pieces skip straight to assembled. */
  private rush = false;
  /** Stage-time multiplier; finish() fast-forwards whatever is still running. */
  private timeScale = 1;
  private placed: THREE.Object3D[] = [];
  private lamps: THREE.PointLight[] = [];

  // Overlay.
  private readonly veil: HTMLElement;
  private currentPhase: StagePhase = 'reading';
  private readonly phaseListeners = new Set<(phase: StagePhase) => void>();
  private phase = 0;
  private wantPhase = 0;
  private phaseAt = 0;
  private partLabel: CSS2DObject;
  private pieceLabel: CSS2DObject;

  constructor(private readonly host: HTMLElement, private readonly options: ArchitectStageOptions = {}) {
    if (options.onPhase) this.phaseListeners.add(options.onPhase);
    if (options.blueprint) {
      this.accent.copy(BLUEPRINT_INK);
      this.sheetUniforms.uAccent.value.copy(BLUEPRINT_INK);
      this.sheetUniforms.uBlueprint.value = 1;
      this.gridUniforms.uColor.value.copy(BLUEPRINT_INK);
    }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    this.root.className = 'as-stage';
    this.root.innerHTML = `<div class="as-labels"></div><div class="as-veil"></div><div class="as-opening-hint" hidden>Tap a door or window to try it</div><div class="as-opening-actions" aria-label="Preview doors and windows"></div>`;
    this.root.classList.toggle('is-blueprint', !!options.blueprint);
    this.navigation = document.createElement('div');
    this.navigation.className = 'as-navigation';
    this.navigation.hidden = !!options.blueprint;
    // A drawing legend: each gesture is a key, each action its meaning.
    const legend = (rows: [string, string][]) => rows.map(([key, action]) => `<div><dt>${key}</dt><dd>${action}</dd></div>`).join('');
    this.navigation.setAttribute('role', 'group');
    this.navigation.setAttribute('aria-label', 'Explore your space');
    this.navigation.innerHTML = `<dl class="as-mouse-help">${legend([['Drag', 'orbit'], ['Scroll', 'zoom'], ['Space + drag', 'pan'], ['WASD', 'move']])}</dl>
      <dl class="as-touch-help">${legend([['Drag', 'orbit'], ['Pinch', 'zoom'], ['Two fingers', 'pan']])}</dl>
      <button type="button" title="Frame your space and follow the build"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.5 2v3.2h3.2"/></svg>Reset view</button>`;
    this.navigation.querySelector('button')!.onclick = this.resetView;
    this.root.append(this.navigation);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.veil = q('.as-veil');
    if (this.reduced) this.root.classList.add('is-reduced');
    host.appendChild(this.root);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'as-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D apartment. Drag to orbit, scroll or pinch to zoom, right-drag or hold Space and drag to pan. Focus this view and use WASD or arrow keys to move. Tap doors and windows to open or close them.');
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.addEventListener('lostpointercapture', this.onPointerCancel);
    window.addEventListener('pointerup', this.onPointerCancel);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('blur', this.onInputBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.motionQuery?.addEventListener('change', this.onMotionChange);
    this.root.insertBefore(this.renderer.domElement, this.root.firstChild);
    const labelHost = q('.as-labels');
    labelHost.appendChild(this.labels.domElement);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTexture = this.pmrem.fromScene(room, 0.04).texture;
    room.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color(options.blueprint?.paper ?? (options.holdOnFinish ? '#e6e5df' : '#e3e6df'));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.flat, this.bench, this.fx, this.camera);
    this.shell.name = 'architect-shell';
    this.flat.add(this.shell);

    // Blueprint ground.
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
      uniforms: this.gridUniforms, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vPos; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float uOpacity; uniform vec3 uColor; uniform vec2 uCenter; varying vec3 vPos;
        float gridLine(vec2 p, float size, float width) {
          vec2 q = p / size; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          return 1.0 - min(min(g.x, g.y) / width, 1.0);
        }
        void main() {
          float minor = gridLine(vPos.xz, 1.0, 1.2);
          float major = gridLine(vPos.xz, 5.0, 1.8);
          float fade = 1.0 - smoothstep(6.0, 34.0, distance(vPos.xz, uCenter));
          float a = (minor * 0.07 + major * 0.16) * fade * uOpacity;
          gl_FragColor = vec4(uColor, a);
        }`,
    }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -0.02;
    grid.renderOrder = -2;
    this.scene.add(grid);

    // The uploaded source stays recognizable while the new geometry is traced above it.
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.sheetUniforms, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform float uHasMap; uniform float uScan; uniform float uBand; uniform float uReveal;
        uniform float uDim; uniform float uOpacity; uniform float uErase; uniform vec3 uAccent; uniform float uBlueprint;
        uniform float uTrace; uniform float uTraceOn; varying vec2 vUv;
        void main() {
          if (uBlueprint > 0.5) {
            // Traced ink only: the paper is the ground itself, as on the landing sheet.
            float y = 1.0 - vUv.y, d = y - uScan;
            float band = exp(-(d * d) / (0.03 * 0.03)) * uBand;
            vec4 tex = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(0.0);
            float ink = tex.a;
            // Working trace: a bright head follows the pen order along the lines, with a fading tail.
            float t = tex.r - uTrace;
            float glow = (exp(-(t * t) / (0.024 * 0.024)) + 0.7 * step(t, 0.0) * exp(t / 0.12)) * uTraceOn;
            float remaining = smoothstep(uErase - 0.035, uErase + 0.035, y);
            float alpha = ink * (0.94 - 0.5 * uTraceOn + min(1.0, glow) * 0.56 + band * 0.06) + band * 0.07;
            gl_FragColor = vec4(mix(uAccent, vec3(1.0), max(band * 0.7, min(1.0, glow))), min(1.0, alpha) * uOpacity * remaining);
            return;
          }
          float lum = uHasMap > 0.5 ? dot(texture2D(uMap, vUv).rgb, vec3(0.299, 0.587, 0.114)) : 1.0;
          float ink = 1.0 - smoothstep(0.42, 0.86, lum);
          float y = 1.0 - vUv.y;
          float d = y - uScan;
          float band = exp(-(d * d) / (0.028 * 0.028)) * uBand;
          float trail = uBand * step(d, 0.0) * exp(d / 0.10);
          float revealed = max(uReveal, step(y, uScan));
          vec3 col = vec3(0.94, 0.945, 0.90);
          vec3 lineCol = mix(vec3(0.18, 0.24, 0.22), uAccent, 0.35 * revealed);
          col = mix(col, lineCol, ink * (0.52 + 0.4 * revealed) * uDim);
          col = mix(col, uAccent, band * 0.16 + trail * ink * 0.2);
          vec2 e = min(vUv, 1.0 - vUv);
          float border = 1.0 - smoothstep(0.0, 0.004, min(e.x, e.y * 0.6));
          col = mix(col, uAccent, border * 0.85);
          // A soft drafting sweep removes the original source, never the traced model.
          float remaining = smoothstep(uErase - 0.035, uErase + 0.035, y);
          gl_FragColor = vec4(col, uOpacity * remaining);
        }`,
    }));
    this.sheet.rotation.x = -Math.PI / 2;
    this.sheet.name = 'source-blueprint';
    this.sheet.renderOrder = -1;
    this.setSheet(0, 0, NOMINAL_PLAN_WIDTH, NOMINAL_PLAN_WIDTH * this.planAspect);
    this.scene.add(this.sheet);

    this.partLabel = this.label('as-part-label', '');
    this.pieceLabel = this.label('as-piece-label', '');
    this.partLabel.visible = false;
    this.pieceLabel.visible = false;
    this.scene.add(this.partLabel, this.pieceLabel);

    this.rig.target.set(0, 0, 0);
    this.rig.radius = this.fitRadius({ minX: -5, maxX: 5, minZ: -7, maxZ: 7 }, this.rig.el, this.rig.az);
    this.rig.orbit = 0;
    this.setPhase(0);

    this.updateCamera(0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // Connecting controls clears their old cursor inline; let our gesture/focus styles own it.
    this.renderer.domElement.style.cursor = '';
    this.controls.enabled = !options.blueprint;
    this.controls.enableDamping = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 150;
    this.controls.minPolarAngle = 0.002;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.screenSpacePanning = true;
    this.controls.target.copy(this.rig.target);
    this.controls.addEventListener('start', this.onOrbitStart);
    this.controls.addEventListener('change', this.onCameraChange);
    this.controls.addEventListener('end', this.onOrbitEnd);
    this.keyboard = new KeyboardNavigationControls(this.renderer.domElement, {
      camera: () => this.camera, target: this.controls.target,
      enabled: () => this.controls.enabled && !this.disposed,
      start: () => { this.pointerStart = undefined; this.takeCamera(); },
      stop: this.onNavigationEnd,
      change: () => { this.controls.update(); this.onCameraChange(); },
      render: this.invalidate,
    });
    this.handPan = new HandPanControls(this.renderer.domElement, {
      enabled: () => this.controls.enabled && !this.pointers.size && !this.disposed,
      start: () => { this.pointerStart = undefined; this.takeCamera(); },
      move: (dx, dy) => this.controls.pan(dx * this.controls.panSpeed, dy * this.controls.panSpeed),
      stop: this.onNavigationEnd,
    });
    this.resize = new ResizeObserver(() => this.onResize());
    this.resize.observe(host);
    this.onResize();
    this.invalidate();
  }

  // ---------- public API ----------

  start(plan: Source, photos: Source[]): void {
    if (this.disposed || this.started) return;
    this.started = true;
    if (this.options.blueprint) { this.startBlueprint(this.options.blueprint.ink); this.loadPhotos(photos); return; }
    this.scanning = !this.reduced;
    this.sheetUniforms.uOpacity.value = 1;
    this.sheetUniforms.uReveal.value = this.reduced ? 1 : 0;
    if (!this.reduced) void this.shellTween(1.2, k => {
      const e = easeOut(k);
      this.sheet.position.y = 1.4 * (1 - e);
      this.sheet.rotation.set(-Math.PI / 2 + 0.12 * (1 - e), 0, -0.06 * (1 - e));
      this.sheetUniforms.uOpacity.value = e;
    });
    this.invalidate();
    const textures = new THREE.TextureLoader();
    void this.trackAsset(textures.loadAsync(this.url(plan))).then(tex => {
      if (this.disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 8;
      const img = tex.image as { width: number; height: number };
      this.planAspect = img.height / img.width || this.planAspect;
      this.sheetUniforms.uMap.value = tex;
      this.sheetUniforms.uHasMap.value = 1;
      if (!this.flatBox) {
        const w = NOMINAL_PLAN_WIDTH, d = w * this.planAspect;
        this.setSheet(0, 0, w, d);
        void this.fit(() => ({ target: new THREE.Vector3(0, 0, 0), radius: this.fitRadius({ minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 }, 0.95, this.rig.az, 1.1), el: 0.95 }), 1.6);
      }
      this.invalidate();
    }, error => { console.warn('[architect-stage] plan failed', error); });
    this.loadPhotos(photos);
  }

  private loadPhotos(photos: Source[]): void {
    const textures = new THREE.TextureLoader();
    photos.forEach((p, index) => {
      void this.trackAsset(textures.loadAsync(this.url(p))).then(tex => {
        if (this.disposed || this.photosOut) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        const img = tex.image as { width: number; height: number };
        this.addPhoto(tex, img.width / img.height || 1.5, index);
      }, error => { console.warn('[architect-stage] photo failed', error); });
    });
  }

  /** The traced sheet is already drawn: show it flat and still, exactly where the page left it. */
  private startBlueprint(ink: HTMLCanvasElement): void {
    const pixels = ink.getContext('2d')?.getImageData(0, 0, ink.width, ink.height).data;
    if (pixels) {
      const alpha = new Uint8ClampedArray(ink.width * ink.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]!;
      this.inkAlpha = { alpha, width: ink.width, height: ink.height };
    }
    const tex = new THREE.CanvasTexture(ink);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    this.planAspect = ink.height / ink.width || this.planAspect;
    this.sheetUniforms.uMap.value = tex;
    this.sheetUniforms.uHasMap.value = 1;
    this.sheetUniforms.uOpacity.value = 1;
    this.sheetUniforms.uReveal.value = 1;
    const w = NOMINAL_PLAN_WIDTH, d = w * this.planAspect;
    this.setSheet(0, 0, w, d);
    const box = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
    this.frameFn = () => ({ target: new THREE.Vector3(), radius: this.fitRadius(box, TOP_DOWN, 0, 1.04), el: TOP_DOWN, az: 0 });
    Object.assign(this.rig, this.frameFn(), { orbit: 0, sway: 0 });
    this.invalidate();
  }

  planRect(): { left: number; top: number; width: number; height: number } | undefined {
    if (this.disposed || !this.options.blueprint) return undefined;
    this.updateCamera(0);
    this.camera.updateMatrixWorld();
    this.sheet.updateMatrixWorld();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const xs: number[] = [], ys: number[] = [];
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as Vec2[]) {
      const p = new THREE.Vector3(x, y, 0).applyMatrix4(this.sheet.matrixWorld).project(this.camera);
      xs.push(rect.left + (p.x + 1) / 2 * rect.width); ys.push(rect.top + (1 - p.y) / 2 * rect.height);
    }
    const left = Math.min(...xs), top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  settle(view: () => HandoverView | null, duration = 1.7): Promise<void> {
    const first = this.disposed ? null : view();
    if (!first) return Promise.resolve();
    this.updateCamera(0);
    this.pinned = true; this.frameFn = undefined; this.cameraToken++; clearTimeout(this.refitTimer);
    this.controls.enabled = false; this.keyboard.cancel(); this.handPan.cancel();
    this.navigation.hidden = true; this.pointerStart = undefined; this.pointers.clear();
    const canvas = this.renderer.domElement.getBoundingClientRect(), insets = this.insets();
    const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height), y0 = -(insets.top - insets.bottom) / 2;
    const fromPosition = this.camera.position.clone(), fromTarget = this.rig.target.clone(), fromFov = this.camera.fov;
    const background = this.scene.background as THREE.Color, bgFrom = background.clone(), bgTo = new THREE.Color();
    const gridFrom = this.gridUniforms.uOpacity.value, sheetFrom = this.sheetUniforms.uOpacity.value;
    // Orbit rather than cut across: radius, height and bearing ease around a moving target.
    const fromOrbit = new THREE.Spherical().setFromVector3(fromPosition.clone().sub(fromTarget));
    const target = new THREE.Vector3(), goal = new THREE.Vector3(), toTarget = new THREE.Vector3(), orbit = new THREE.Spherical();
    return this.tween(duration, k => {
      // Re-read every frame: the editor may still be easing its own first framing.
      const e = easeInOut(k), to = view() ?? first;
      toTarget.fromArray(to.target);
      const toOrbit = new THREE.Spherical().setFromVector3(goal.fromArray(to.position).sub(toTarget));
      const turn = Math.atan2(Math.sin(toOrbit.theta - fromOrbit.theta), Math.cos(toOrbit.theta - fromOrbit.theta));
      orbit.set(lerp(fromOrbit.radius, toOrbit.radius, e), lerp(fromOrbit.phi, toOrbit.phi, e), fromOrbit.theta + turn * e);
      target.lerpVectors(fromTarget, toTarget, e);
      this.camera.position.setFromSpherical(orbit).add(target); this.camera.lookAt(target);
      this.camera.fov = lerp(fromFov, to.fov, e);
      // Render the whole canvas as if it were the editor's viewport, wherever that sits on screen.
      const fw = lerp(w, to.rect.width, e), fh = lerp(h, to.rect.height, e);
      this.camera.aspect = fw / fh;
      this.camera.setViewOffset(fw, fh, lerp(0, canvas.left - to.rect.left, e), lerp(y0, canvas.top - to.rect.top, e), w, h);
      this.camera.updateProjectionMatrix();
      background.lerpColors(bgFrom, bgTo.set(to.background ?? '#a6ada1'), e);
      this.gridUniforms.uOpacity.value = gridFrom * (1 - e);
      this.sheetUniforms.uOpacity.value = sheetFrom * (1 - e);
    });
  }

  enter(): void {
    if (this.disposed || !this.options.blueprint || this.entered) return;
    this.entered = true;
    this.controls.enabled = true;
    this.navigation.hidden = false;
    this.onResize();
    this.scanning = !this.reduced;
    this.tracing = !this.reduced && !this.flatBox;
    this.sheetUniforms.uTrace.value = -0.4;
    this.scanClock = 0;
    this.sheetUniforms.uReveal.value = 0;
    // The sheet tips back onto the ground plane; a shell that already arrived keeps its framing.
    if (this.flatBox) return;
    const w = NOMINAL_PLAN_WIDTH, d = w * this.planAspect;
    const box = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
    // A slow drift keeps the waiting view alive; the shell's own framing, or the person's hand, stops it.
    void this.fit(() => ({ ...this.framing(box, 0.98, -0.26, 1.02), target: new THREE.Vector3(0, 0, 0) }), 2.6, { orbit: 0.025, sway: 0 });
  }

  event(e: StageEvent): void {
    if (this.disposed) return;
    switch (e.type) {
      case 'activity': break; // accepted; the side panel shows the log
      case 'progress': this.progress(e.message); break;
      case 'shell': this.onShell(e.rooms ?? [], e.walls ?? [], e.components ?? [], e.metadata ?? {}); break;
      case 'pieces': this.onPieces(e.pieces ?? []); break;
      case 'piece': this.onPiece(e.piece, e.asset); break;
      case 'placements': this.onPlacements(e.objects ?? [], e.lights ?? []); break;
      case 'project': this.requestPhase(4); break;
    }
  }

  async hydrate(events: StageEvent[], phase: StagePhase): Promise<void> {
    if (this.disposed) return;
    if (this.hydrating) throw new Error('A checkpoint is already loading into this stage.');
    this.hydrating = true;
    const navigationEnabled = this.controls.enabled, visibility = this.root.style.visibility;
    this.controls.enabled = false; this.keyboard.cancel(); this.handPan.cancel();
    this.root.style.visibility = 'hidden';
    clearTimeout(this.refitTimer);
    const cancelled = new Promise<void>(resolve => { this.cancelHydration = resolve; });
    try {
      // start()/enter() may already have queued their sheet and camera entrances.
      this.settleTweens();
      for (const event of events) this.event(event);
      // Assemblies and placements chain asynchronous work; take another snapshot if a
      // replacement shell or event arrives while its model is still loading.
      while (!this.disposed) {
        const shellReady = this.shellReady, placing = this.placing;
        await Promise.race([
          Promise.allSettled([shellReady, placing, ...this.assets, ...this.openingAssets.pending, ...this.assemblies]),
          cancelled,
        ]);
        if (this.disposed) return;
        if (shellReady === this.shellReady && placing === this.placing && !this.assets.size && !this.openingAssets.pending.size && !this.assemblies.size) break;
      }
      // Store the finished presentation too, so the caller's usual finish() is idempotent.
      if (phase === 'done') await Promise.race([this.finish(), cancelled]);
      if (this.disposed) return;
      clearTimeout(this.refitTimer);
      if (this.frameFn && !this.manualCamera) await this.moveCamera(this.frameFn(), 0);
      if (this.disposed) return;
      this.phase = phase === 'done' ? PHASES.length : PHASES.indexOf(phase);
      this.wantPhase = this.phase;
      this.phaseAt = this.now;
    } finally {
      this.hydrating = false;
      this.cancelHydration = undefined;
      if (!this.disposed) {
        this.controls.enabled = navigationEnabled && !this.pinned;
        this.root.style.visibility = visibility;
        this.invalidate();
      }
    }
    if (!this.disposed) this.emitPhase(phase);
  }

  progress(message: string): void {
    if (this.disposed || !message) return;
    const text = message.trim();
    if (/^checking\b/i.test(text)) this.requestPhase(4);
    // "Building dining chair": light up that piece's slot on the workbench before it arrives.
    const building = /^building\s+(.+)$/i.exec(text)?.[1]?.toLowerCase();
    if (building) for (const slot of this.slots.values()) {
      if (!slot.built && slot.name.toLowerCase() === building) { slot.outlineMat.dashed = false; slot.outlineMat.opacity = 0.95; slot.outlineMat.needsUpdate = true; }
    }
  }

  finish(): Promise<void> {
    this.finishing ??= this.runFinish();
    return this.finishing;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelHydration?.();
    cancelAnimationFrame(this.raf);
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.keyboard.dispose(); this.handPan.dispose(); this.controls.dispose();
    this.controls.removeEventListener('start', this.onOrbitStart);
    this.controls.removeEventListener('change', this.onCameraChange);
    this.controls.removeEventListener('end', this.onOrbitEnd);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.onPointerCancel);
    window.removeEventListener('pointerup', this.onPointerCancel);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('blur', this.onInputBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.openingAssets.dispose();
    clearTimeout(this.refitTimer);
    this.resize.disconnect();
    for (const t of this.tweens.splice(0)) t.resolve();
    this.waiting.splice(0).forEach(resolve => resolve());
    this.phaseListeners.clear();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const takeTextures = (values: Iterable<unknown>) => { for (const v of values) if (v instanceof THREE.Texture) textures.add(v); };
    this.scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry instanceof THREE.BufferGeometry) geometries.add(mesh.geometry);
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) {
        materials.add(m);
        takeTextures(Object.values(m));
        if (m instanceof THREE.ShaderMaterial) takeTextures(Object.values(m.uniforms).map(u => u.value));
      }
    });
    this.lineMats.forEach(m => materials.add(m));
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    textures.forEach(t => t.dispose());
    this.lamps.forEach(l => l.dispose());
    this.sun.shadow.map?.dispose();
    this.envTexture.dispose();
    this.pmrem.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.urls.forEach(u => URL.revokeObjectURL(u));
    this.root.remove();
  }

  // ---------- frame loop and tweens ----------

  private frame = (ms: number) => {
    if (this.disposed) return;
    this.raf = 0;
    this.inFrame = true;
    // Phase copy and completion controls change the clear area without resizing the host.
    const insets = this.insets();
    if (!this.pinned && (insets.top !== this.layoutInsets.top || insets.bottom !== this.layoutInsets.bottom)) this.onResize();
    const dt = Math.min(0.1, (ms - this.last) / 1000);
    this.last = ms;
    this.now += dt * this.timeScale;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i]!;
      if (this.now < t.start) continue;
      const k = t.dur <= 0 ? 1 : clamp01((this.now - t.start) / t.dur);
      t.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); t.resolve(); }
    }
    if (!this.hydrating && this.wantPhase > this.phase && (this.reduced || this.now - this.phaseAt >= PHASE_HOLD)) this.setPhase(this.wantPhase);
    this.updateScan(dt);
    this.updateTrace(dt);
    this.keyboard.update(ms);
    this.updateCamera(dt);
    this.updatePhotos();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.inFrame = false;
    // Keep the last RAF timestamp while a sequence is active. Resetting it after
    // each render would subtract GPU/label work and slow the construction clock.
    const drifting = this.rig.orbit !== 0 && !this.manualCamera && !this.pinned;
    if (this.tweens.length || this.scanning || this.tracing || this.sheetUniforms.uTraceOn.value > 0 || drifting || this.wantPhase > this.phase || this.keyboard.active) this.raf = requestAnimationFrame(this.frame);
  };

  private invalidate = (): void => {
    if (this.disposed || this.raf || this.inFrame) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private onMotionChange = (event: MediaQueryListEvent): void => {
    this.reduced = event.matches;
    this.root.classList.toggle('is-reduced', this.reduced);
    if (this.reduced) {
      this.scanning = false; this.tracing = false; this.sheetUniforms.uTraceOn.value = 0;
      this.sheetUniforms.uReveal.value = 1;
      this.sheetUniforms.uBand.value = 0;
      this.rig.orbit = 0; this.rig.sway = 0;
      this.settleTweens();
    }
    this.invalidate();
  };

  private settleTweens(): void {
    // Settle in scheduling order: a later fade must win over an earlier entrance.
    const pending = this.tweens.splice(0).sort((a, b) => a.start - b.start);
    for (const tween of pending) { tween.fn(1); tween.resolve(); }
  }

  /** Runs fn(k) for k in 0..1 over `dur` seconds (shortened under reduced motion). */
  private tween(dur: number, fn: (k: number) => void, delay = 0, shell?: number): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.reduced || this.hydrating) { fn(1); this.invalidate(); return Promise.resolve(); }
    return new Promise(resolve => { this.tweens.push({ start: this.now + delay, dur, fn, resolve, shell }); this.invalidate(); });
  }
  private shellTween(dur: number, fn: (k: number) => void, delay = 0): Promise<void> { return this.tween(dur, fn, delay, this.shellRevision); }
  private wait(s: number): Promise<void> { return this.tween(s, () => undefined); }

  private onResize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    // Keep the scene clear of the title and log on the left of wide screens.
    const insets = this.insets();
    this.layoutInsets = { ...insets };
    this.navigation.style.bottom = `${insets.bottom + 12}px`;
    if (this.pinned) { this.invalidate(); return; }
    this.camera.aspect = w / h;
    if (insets.top || insets.bottom) this.camera.setViewOffset(w, h, 0, -(insets.top - insets.bottom) / 2, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (this.frameFn && !this.manualCamera) {
      clearTimeout(this.refitTimer);
      this.refitTimer = window.setTimeout(() => { if (!this.disposed && this.frameFn) void this.moveCamera(this.frameFn(), 1.5); }, 150);
    }
    const px = this.renderer.getPixelRatio();
    this.lineMats.forEach(m => m.resolution.set(w * px, h * px));
    this.invalidate();
  }

  // ---------- camera ----------

  /** Direct navigation owns the camera until the person explicitly resets the view. */
  private takeCamera = (): void => {
    if (this.pinned || this.disposed) return;
    this.manualCamera = true;
    this.cameraToken++;
    clearTimeout(this.refitTimer);
    this.rig.orbit = 0; this.rig.sway = 0;
    this.renderer.domElement.classList.add('is-navigating');
  };

  private onOrbitStart = (): void => { this.orbitActive = true; this.takeCamera(); };
  private onOrbitEnd = (): void => { this.orbitActive = false; this.onNavigationEnd(); };
  private onNavigationEnd = (): void => {
    this.renderer.domElement.classList.toggle('is-navigating', this.orbitActive || !!this.keyboard?.active || !!this.handPan?.active);
  };
  private onInputBlur = (): void => {
    if (this.disposed) return;
    this.pointerStart = undefined; this.orbitActive = false;
    this.keyboard.cancel(); this.handPan.cancel();
    // A release outside the window never reaches OrbitControls. Clear its input session too.
    const canvas = this.renderer.domElement;
    this.controls.disconnect();
    for (const id of this.pointers) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    this.pointers.clear();
    this.controls.connect(canvas); canvas.style.cursor = '';
    this.onNavigationEnd();
  };
  private onVisibilityChange = (): void => { if (document.hidden) this.onInputBlur(); };

  private onCameraChange = (): void => {
    if (!this.manualCamera || this.pinned || this.disposed) return;
    const orbit = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    this.rig.target.copy(this.controls.target);
    this.rig.radius = orbit.radius; this.rig.el = Math.PI / 2 - orbit.phi; this.rig.az = orbit.theta;
    this.invalidate();
  };

  private resetView = (): void => {
    if (this.pinned || this.disposed || !this.controls.enabled) return;
    this.keyboard.cancel(); this.handPan.cancel(); this.onNavigationEnd();
    this.pointerStart = undefined;
    this.manualCamera = false;
    this.onResize();
    clearTimeout(this.refitTimer);
    if (this.frameFn) void this.moveCamera(this.frameFn(), 1.5);
    this.renderer.domElement.focus({ preventScroll: true });
  };

  private updateCamera(dt: number): void {
    if (this.pinned || this.manualCamera) return;
    const r = this.rig;
    r.az += r.orbit * dt;
    const az = r.az + r.sway * Math.sin(this.now * 0.07);
    const c = Math.cos(r.el);
    this.camera.position.set(r.target.x + r.radius * c * Math.sin(az), r.target.y + r.radius * Math.sin(r.el), r.target.z + r.radius * c * Math.cos(az));
    this.camera.lookAt(r.target);
    this.controls?.target.copy(r.target);
  }

  private moveCamera(to: Partial<Rig>, dur: number): Promise<void> {
    if (this.manualCamera || this.pinned) return Promise.resolve();
    const token = ++this.cameraToken;
    const from = { ...this.rig, target: this.rig.target.clone() };
    let toAz = to.az ?? from.az;
    if (to.az !== undefined) { const d = Math.atan2(Math.sin(toAz - from.az), Math.cos(toAz - from.az)); toAz = from.az + d; }
    const target = to.target?.clone() ?? from.target;
    return this.tween(Math.max(dur, 1.5), k => {
      if (token !== this.cameraToken) return;
      const e = easeInOut(k);
      this.rig.target.lerpVectors(from.target, target, e);
      this.rig.radius = lerp(from.radius, to.radius ?? from.radius, e);
      this.rig.el = lerp(from.el, to.el ?? from.el, e);
      if (to.az !== undefined) this.rig.az = lerp(from.az, toAz, e);
      if (to.orbit !== undefined) this.rig.orbit = lerp(from.orbit, this.reduced ? 0 : to.orbit, e);
      if (to.sway !== undefined) this.rig.sway = lerp(from.sway, this.reduced ? 0 : to.sway, e);
    });
  }

  /** Camera distance that frames a ground box (plus wall height) from the given angles. */
  private fitRadius(b: Box2, el: number, az: number, pad = 1.12): number {
    const right = new THREE.Vector2(Math.cos(az), -Math.sin(az));
    const toward = new THREE.Vector2(Math.sin(az), Math.cos(az));
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ]] as Vec2[]) {
      const p = new THREE.Vector2(x, z);
      sx0 = Math.min(sx0, p.dot(right)); sx1 = Math.max(sx1, p.dot(right));
      sy0 = Math.min(sy0, p.dot(toward)); sy1 = Math.max(sy1, p.dot(toward));
    }
    const width = sx1 - sx0;
    const height = (sy1 - sy0) * Math.sin(el) + 2.8 * Math.cos(el);
    const insets = this.insets(), h = Math.max(1, this.host.clientHeight);
    if (!this.navigation.hidden) insets.bottom += this.navigation.offsetHeight + 24;
    const vf = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * Math.max(0.3, (h - insets.top - insets.bottom) / h));
    const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect);
    return Math.max(width / 2 / Math.tan(hf), height / 2 / Math.tan(vf)) * pad + 1.5;
  }

  private insets(): { top: number; bottom: number } {
    return this.options.blueprint?.insets?.() ?? { top: 0, bottom: 0 };
  }

  private framing(b: Box2, el = 0.9, az = -0.32, pad = 1.1): Partial<Rig> {
    return { target: new THREE.Vector3((b.minX + b.maxX) / 2, 0.4, (b.minZ + b.maxZ) / 2), radius: this.fitRadius(b, el, az, pad), el, az };
  }

  /** Frame what matters now, and keep framing it when the host resizes. */
  private fit(fn: () => Partial<Rig>, dur: number, extra: Partial<Rig> = {}): Promise<void> {
    this.frameFn = () => ({ ...fn(), ...extra });
    return this.moveCamera(this.frameFn(), dur);
  }

  // ---------- plan scan and photos ----------

  private setSheet(cx: number, cz: number, w: number, d: number): void {
    this.sheet.position.set(cx, 0, cz);
    this.sheet.scale.set(w, d, 1);
    this.gridUniforms.uCenter.value.set(cx, cz);
  }

  private updateTrace(dt: number): void {
    const u = this.sheetUniforms, on = this.tracing && !this.reduced;
    u.uTraceOn.value = on ? Math.min(1, u.uTraceOn.value + dt / 1.2) : Math.max(0, u.uTraceOn.value - dt / 0.6);
    if (!on && u.uTraceOn.value === 0) return;
    // One pass over the whole plan every 4.5 s, with a short breath between passes.
    u.uTrace.value += dt / 4.5;
    if (u.uTrace.value > 1.25) u.uTrace.value = -0.12;
  }

  private updateScan(dt: number): void {
    const u = this.sheetUniforms;
    if (this.reduced) { u.uBand.value = 0; return; }
    if (this.scanning && !this.tracing && this.scanClock < 0) { this.scanning = false; }
    if (!this.scanning) { u.uBand.value = 0; return; }
    this.scanClock += dt / (this.tracing ? 3.8 : 6.5);
    if (this.scanClock >= 1) {
      u.uReveal.value = 1;
      // While the architect is still working, the reading band passes again after a short rest.
      if (this.tracing) this.scanClock = -0.45;
      else { this.scanClock = 1; this.scanning = false; u.uBand.value = 0; }
    }
    u.uBand.value = this.scanClock < 0 ? 0 : 1;
    u.uScan.value = -0.1 + 1.25 * Math.max(0, this.scanClock);
  }

  private addPhoto(tex: THREE.Texture, aspect: number, index: number): void {
    const group = new THREE.Group();
    const w = 1, h = 1 / aspect;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.05, h + 0.05), new THREE.MeshBasicMaterial({ color: '#ebe7f7', toneMapped: false, transparent: true }));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
    pic.position.z = 0.004;
    group.add(frame, pic);
    group.renderOrder = 3;
    this.camera.add(group);
    this.photos.push({ group, aspect, feature: 0, fade: 0, index });
    this.photos.sort((a, b) => a.index - b.index);
    const photo = this.photos.find(p => p.group === group)!;
    void this.tween(0.8, k => { photo.fade = easeOut(k); }, 0.15 * this.photos.length);
  }

  /** Photos float in a column at the right edge of the view; one at a time slides forward. */
  private updatePhotos(): void {
    if (!this.photos.length) return;
    const vf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const aspect = this.camera.aspect;
    const off = 0;
    const toX = (frac: number, d: number) => (frac - 0.5 - off) * 2 * d * vf * aspect;
    const toY = (frac: number, d: number) => (0.5 - frac) * 2 * d * vf;
    const width = (frac: number, d: number) => frac * 2 * d * vf * aspect;
    const n = this.photos.length;
    this.photos.forEach((p, i) => {
      const slot = n > 1 ? i / (n - 1) : 0.5;
      const f = easeInOut(p.feature);
      const dr = 14, df = 9;
      const rest = new THREE.Vector3(toX(0.915, dr), toY(0.16 + slot * 0.66, dr), -dr);
      const front = new THREE.Vector3(toX(0.72, df), toY(0.5, df), -df);
      p.group.position.lerpVectors(rest, front, f);
      const size = lerp(width(aspect > 1.25 ? 0.12 : 0.2, dr), width(aspect > 1.25 ? 0.34 : 0.6, df), f) * (0.6 + 0.4 * p.fade);
      p.group.scale.set(size, size, size);
      p.group.rotation.set(0, lerp(-0.38, -0.1, f), lerp(i % 2 ? 0.035 : -0.035, 0, f));
      p.group.visible = p.fade > 0.01;
      p.group.traverse(o => { if (o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).opacity = p.fade * lerp(0.8, 1, f); });
      p.group.renderOrder = f > 0 ? 4 : 3;
      p.group.position.z += f * 0.01;
    });
  }

  private dismissPhotos(): void {
    this.photosOut = true;
    const photos = this.photos.slice();
    void this.tween(1.6, k => {
      for (const p of photos) { p.fade = Math.min(p.fade, 1 - easeInOut(k)); p.feature = Math.min(p.feature, 1 - k); }
    }).then(() => photos.forEach(p => { p.group.visible = false; }));
  }

  // ---------- shell ----------

  private onShell(rooms: StageRoom[], walls: StageWall[], components: StageComponent[], metadata: Record<string, EntityMetadata>): void {
    const box = boundsOf(rooms, walls);
    if (!box) return;
    // A new shell replaces the old projection atomically. Old animation jobs and
    // asynchronous model loads must never resurrect an earlier reconstruction.
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i]!;
      if (tween.shell !== undefined) { this.tweens.splice(i, 1); tween.resolve(); }
    }
    this.shellRevision++;
    this.draftMats.forEach(material => this.lineMats.delete(material)); this.draftMats.clear();
    disposeObject(this.shell); this.shell.clear(); this.flat.add(this.shell);
    this.wallMats.clear(); this.floorUniforms = [];
    this.openings.clear();
    this.root.querySelector('.as-opening-actions')!.replaceChildren();
    (this.root.querySelector('.as-opening-hint') as HTMLElement).hidden = true;
    this.flatBox = box;
    this.scanning = false; this.tracing = false;
    this.sheet.visible = true;
    this.sheet.rotation.set(-Math.PI / 2, 0, 0);
    this.sheetUniforms.uReveal.value = 1;
    this.sheetUniforms.uErase.value = -0.1;
    this.requestPhase(1);
    this.dismissPhotos();

    // Size and place the plan so its own lines sit under the returned walls. Without a
    // confident match, fit it under the rooms, keeping the plan's aspect.
    let { sw, sd, sx, sz } = this.sheetUnderRooms(box);
    const matched = this.inkAlpha && registerPlan(this.inkAlpha.alpha, this.inkAlpha.width, this.inkAlpha.height, walls);
    if (matched && this.inkAlpha) {
      const wx = Math.min(...walls.flatMap(w => [w.start[0], w.end[0]])), wz = Math.min(...walls.flatMap(w => [w.start[1], w.end[1]]));
      sw = this.inkAlpha.width / matched.scale; sd = this.inkAlpha.height / matched.scale;
      sx = wx - matched.x / matched.scale + sw / 2; sz = wz - matched.y / matched.scale + sd / 2;
    }
    const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
    const p0 = this.sheet.position.clone(), s0 = this.sheet.scale.clone();
    const opacityFrom = this.sheetUniforms.uOpacity.value;
    void this.shellTween(1.3, k => {
      const e = easeInOut(k);
      this.setSheet(lerp(p0.x, sx, e), lerp(p0.z, sz, e), lerp(s0.x, sw, e), lerp(s0.y, sd, e));
      this.sheetUniforms.uOpacity.value = lerp(opacityFrom, 1, e);
    });
    void this.fit(() => this.framing(this.sceneBox(), 1.1), 2.0, { orbit: 0, sway: 0 });
    this.fitShadow(this.sceneBox());

    // Trace the returned room geometry directly over the source first. No sketch
    // is invented while the architect is still reading the uploaded plan.
    rooms.forEach((room, i) => {
      if (room.polygon.length < 3) return;
      this.tracePath([...room.polygon, room.polygon[0]!].map(([x, z]) => new THREE.Vector3(x, 0.035, z)), this.shell, 1.4 + i * 0.12, 1.4);
    });

    // Walls: footprints are drafted, then extruded after the trace is readable. The main
    // (outer) walls sweep up around the flat from the entrance, then the partitions between
    // rooms, and only then are the doors and windows installed.
    const entrance = entrancePoint(walls) ?? new THREE.Vector2(cx, box.maxZ);
    const midpoint = (w: StageWall) => new THREE.Vector2((w.start[0] + w.end[0]) / 2, (w.start[1] + w.end[1]) / 2);
    const from = Math.atan2(entrance.y - cz, entrance.x - cx);
    const sweep = (p: THREE.Vector2) => (Math.atan2(p.y - cz, p.x - cx) - from + 4 * Math.PI) % (2 * Math.PI);
    const main = walls.filter(w => isMainWall(w, rooms, box, metadata)).sort((a, b) => sweep(midpoint(a)) - sweep(midpoint(b)));
    const inner = walls.filter(w => !main.includes(w)).sort((a, b) => midpoint(a).distanceTo(entrance) - midpoint(b).distanceTo(entrance));
    const draftAt = 1.5, mainRise = 2.9;
    const mainStep = Math.min(0.12, 1.5 / Math.max(1, main.length));
    const innerStep = Math.min(0.12, 1.4 / Math.max(1, inner.length));
    const installs: Install[] = [];
    main.forEach((w, i) => installs.push(...this.addWall(w, draftAt + i * mainStep * 0.5, mainRise + i * mainStep, metadata)));
    const mainUp = mainRise + main.length * mainStep + 1.1;
    inner.forEach((w, i) => installs.push(...this.addWall(w, draftAt + 0.5 + i * innerStep * 0.5, mainUp - 0.3 + i * innerStep, metadata)));
    const wallsUp = inner.length ? mainUp - 0.3 + inner.length * innerStep + 1.1 : mainUp;
    // Doors and windows arrive in one pass around the walls, as the last partitions top out.
    const openingStep = Math.min(0.08, 1.2 / Math.max(1, installs.length)), openingsAt = wallsUp - 0.4;
    installs.sort((a, b) => sweep(a.point) - sweep(b.point)).forEach((install, i) => install.install(openingsAt + i * openingStep));
    const openingsIn = openingsAt + installs.length * openingStep + 0.75;
    const byId = new Map(walls.map(w => [w.id, w]));
    rooms.forEach((room, i) => this.addFloor(room, mainUp - 0.6 + i * 0.12));
    // The scanned image is gradually erased as the real shell takes its place.
    void this.shellTween(3.1, k => { this.sheetUniforms.uErase.value = lerp(-0.08, 1.08, easeInOut(k)); }, mainRise + 0.4);
    const revision = this.shellRevision;
    void this.shellTween(0, () => { this.sheet.visible = false; }, mainRise + 3.6);
    void this.shellTween(0, () => { void this.fit(() => this.framing(this.sceneBox(), 0.8, -0.38), 2.3, { orbit: 0, sway: 0 }); }, mainRise + 0.6);

    // Fixtures drop in once the walls are up.
    components.filter(c => c.kind !== 'light').forEach((c, i) => this.addFixture(c, byId, wallsUp + i * 0.09));
    this.shellReady = this.shellTween(0, () => undefined, Math.max(7.2, openingsIn, wallsUp + 1.1 + components.length * 0.09)).then(() => {
      if (this.disposed || revision !== this.shellRevision) return;
      (this.root.querySelector('.as-opening-hint') as HTMLElement).hidden = ![...this.openings.values()].some(o => !o.projection.fixed);
    });
  }

  /** The fallback placement: the plan's drawing assumed to fill about 88% of the page, centred. */
  private sheetUnderRooms(box: Box2): { sw: number; sd: number; sx: number; sz: number } {
    const W = (box.maxX - box.minX) * 1.14, D = (box.maxZ - box.minZ) * 1.14;
    const sw = Math.max(W, D / this.planAspect);
    return { sw, sd: sw * this.planAspect, sx: (box.minX + box.maxX) / 2, sz: (box.minZ + box.maxZ) / 2 };
  }

  private tracePath(points: THREE.Vector3[], parent: THREE.Object3D, delay: number, duration: number): void {
    if (points.length < 2) return;
    let length = 0;
    points.slice(1).forEach((point, index) => { length += point.distanceTo(points[index]!); });
    const material = this.lineMat({ linewidth: 2, opacity: 0.9, dashed: true, dashSize: 0.00001, gapSize: length + 1 });
    this.draftMats.add(material);
    const line = new Line2(new LineGeometry().setPositions(points.flatMap(p => p.toArray())), material);
    line.computeLineDistances(); line.visible = false; parent.add(line);
    void this.shellTween(duration, k => { line.visible = true; material.dashSize = Math.max(0.00001, length * easeInOut(k)); }, delay);
    void this.shellTween(0.9, k => { material.opacity = lerp(0.9, 0.2, k); }, delay + duration + 2.5);
  }

  private sceneBox(): Box2 {
    const b = this.flatBox ?? { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    if (!this.slots.size) return b;
    const bx0 = this.benchX0 - 0.2, bx1 = this.benchX0 + 4.6, bz0 = this.benchZ0 - 0.4, bz1 = Math.max(...this.benchZ) + 0.4;
    return { minX: Math.min(b.minX, bx0), maxX: Math.max(b.maxX, bx1), minZ: Math.min(b.minZ, bz0), maxZ: Math.max(b.maxZ, bz1) };
  }

  private fitShadow(b: Box2): void {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const r = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 2;
    this.sun.position.set(cx - 7, 14, cz + 9);
    this.sun.target.position.set(cx, 0, cz);
    const cam = this.sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = 40;
    cam.updateProjectionMatrix();
  }

  private addFloor(room: StageRoom, delay: number): void {
    if (room.polygon.length < 3) return;
    const shape = new THREE.Shape(room.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ShapeGeometry(shape);
    const uniforms = { uFloodCenter: { value: new THREE.Vector2() }, uFloodRadius: { value: 0 }, uFloodEdge: { value: this.accent.clone() } };
    const c = polygonCentroid(room.polygon);
    uniforms.uFloodCenter.value.set(c[0], c[1]);
    const material = new THREE.MeshStandardMaterial({ color: room.color ?? '#b8b2a6', roughness: 0.82, metalness: 0 });
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec2 vFloodPos;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloodPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = 'uniform vec2 uFloodCenter; uniform float uFloodRadius; uniform vec3 uFloodEdge; varying vec2 vFloodPos;\n' + shader.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\nfloat fd = distance(vFloodPos, uFloodCenter);\nif (fd > uFloodRadius) discard;\ngl_FragColor.rgb += uFloodEdge * smoothstep(uFloodRadius - 0.45, uFloodRadius, fd) * 0.55;');
    };
    material.customProgramCacheKey = () => 'architect-stage-flood';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    mesh.receiveShadow = true;
    this.shell.add(mesh);
    this.floorUniforms.push(uniforms);
    const reach = Math.max(...room.polygon.map(([x, z]) => Math.hypot(x - c[0], z - c[1]))) + 0.6;
    void this.shellTween(1.5, k => { uniforms.uFloodRadius.value = easeOut(k) * reach; }, delay);

    const area = Math.abs(polygonArea(room.polygon));
    const label = this.label('as-room-label', `<strong>${escapeHtml(room.name)}</strong><span>${area.toFixed(1)} m²</span>`);
    label.position.set(c[0], 0.05, c[1]);
    label.element.style.opacity = '0';
    this.shell.add(label);
    void this.shellTween(0.8, k => { label.element.style.opacity = String(k); }, delay + 0.8);
  }

  /** Drafts and raises one wall; its doors and windows are returned for the caller to install. */
  private addWall(wall: StageWall, drawAt: number, riseAt: number, metadata: Record<string, EntityMetadata>): Install[] {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1];
    const L = Math.hypot(dx, dz);
    if (L < 1e-3) return [];
    const t = Math.max(0.05, wall.thickness), H = wall.height || 2.7, ext = t / 2;
    const group = new THREE.Group();
    group.position.set(wall.start[0], metadata[wall.id]?.elevation ?? 0, wall.start[1]);
    group.rotation.y = Math.atan2(-dz, dx);
    this.shell.add(group);

    // Footprint outline, drawn along the wall.
    const rect = (y: number) => [-ext, y, -t / 2, L + ext, y, -t / 2, L + ext, y, -t / 2, L + ext, y, t / 2, L + ext, y, t / 2, -ext, y, t / 2, -ext, y, t / 2, -ext, y, -t / 2];
    this.tracePath([[-ext, 0.04, -t / 2], [L + ext, 0.04, -t / 2], [L + ext, 0.04, t / 2], [-ext, 0.04, t / 2], [-ext, 0.04, -t / 2]].map(p => new THREE.Vector3(...p as Vec3)), group, drawAt, 1.15);

    // Body: solid segments between openings, with sills and lintels.
    const body = new THREE.Group();
    body.name = `wall-body:${wall.id}`;
    body.scale.y = 0.0001;
    body.visible = false;
    group.add(body);
    let mat = this.wallMats.get(wall.color ?? '#eeede8');
    if (!mat) { mat = new THREE.MeshStandardMaterial({ color: wall.color ?? '#eeede8', roughness: 0.9 }); this.wallMats.set(wall.color ?? '#eeede8', mat); }
    const blocks: [number, number, number, number][] = [];
    let cursor = 0;
    const openings = [...(wall.openings ?? [])].sort((a, b) => a.offset - b.offset);
    for (const o of openings) {
      const a = Math.max(0, Math.min(L, o.offset)), b = Math.max(a, Math.min(L, o.offset + o.width));
      if (a > cursor) blocks.push([cursor, a, 0, H]);
      if (o.sill > 0) blocks.push([a, b, 0, Math.min(H, o.sill)]);
      const top = o.sill + o.height;
      if (top < H) blocks.push([a, b, top, H]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < L) blocks.push([cursor, L, 0, H]);
    if (blocks.length) { blocks[0]![0] -= blocks[0]![0] <= 0 ? ext : 0; const last = blocks[blocks.length - 1]!; if (last[1] >= L) last[1] += ext; }
    for (const [x0, x1, y0, y1] of blocks) {
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, t), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      m.castShadow = true; m.receiveShadow = true;
      body.add(m);
    }
    // The drafting pen rides the top edge as the wall extrudes into solid plaster.
    const capMat = this.lineMat({ linewidth: 2.6, opacity: 0.95 }); this.draftMats.add(capMat);
    const cap = new LineSegments2(new LineSegmentsGeometry().setPositions(rect(0)), capMat);
    cap.visible = false;
    group.add(cap);
    void this.shellTween(1.1, k => {
      const e = easeOut(k);
      body.visible = true; cap.visible = true;
      body.scale.y = Math.max(0.0001, e);
      cap.position.y = H * e + 0.01;
    }, riseAt);
    void this.shellTween(0.7, k => { capMat.opacity = 0.95 * (1 - k); }, riseAt + 1.1);

    const checkedWall: Wall = { ...wall, color: wall.color ?? '#eeede8', openings: openings.map((opening, index) => ({ ...opening, id: opening.id ?? `${wall.id}-opening-${index}` })) };
    return checkedWall.openings.map(opening => {
      const mount = new THREE.Group(); mount.visible = false; group.add(mount);
      const projection = makeOpening(checkedWall, opening, metadata[opening.id] ?? {}, 0, undefined, { openingAssets: this.openingAssets, onAssetReady: this.invalidate });
      mount.add(projection.group);
      const button = document.createElement('button');
      button.type = 'button'; button.disabled = true;
      button.textContent = `Open ${metadata[opening.id]?.name ?? humanise(opening.id)}`;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.toggleOpening(opening.id));
      this.root.querySelector('.as-opening-actions')!.appendChild(button);
      const entry = { projection, ready: false, token: 0, button };
      this.openings.set(opening.id, entry);
      const along = opening.offset + opening.width / 2;
      return {
        point: new THREE.Vector2(wall.start[0] + dx / L * along, wall.start[1] + dz / L * along),
        install: (at: number) => void this.shellTween(0.75, k => {
          mount.visible = true;
          const remaining = 1 - easeOut(k);
          mount.position.set(0, 0.6 * remaining, 0.2 * remaining);
          if (k === 1) { entry.ready = true; button.disabled = projection.fixed; }
        }, at),
      };
    });
  }

  private addFixture(c: StageComponent, walls: Map<string, StageWall>, at: number): void {
    const [w, h, d] = c.dimensions;
    let [x, y, z] = c.position;
    let rot = c.rotation ?? 0;
    const hostWall = c.host ? walls.get(c.host.wallId) : undefined;
    if (c.host && hostWall) {
      const dx = hostWall.end[0] - hostWall.start[0], dz = hostWall.end[1] - hostWall.start[1];
      const L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux, side = c.host.side >= 0 ? 1 : -1;
      const out = side * (hostWall.thickness / 2 + d / 2);
      x = hostWall.start[0] + ux * c.host.offset + nx * out;
      z = hostWall.start[1] + uz * c.host.offset + nz * out;
      y = c.host.elevation;
      rot = Math.atan2(-dz, dx) + (side > 0 ? 0 : Math.PI);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c.color ?? '#e8e6e0', roughness: 0.6 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = rot;
    mesh.visible = false;
    this.shell.add(mesh);
    const drop = 1.1;
    void this.shellTween(0.75, k => { mesh.visible = true; mesh.position.y = y + h / 2 + drop * (1 - easeOut(k)); }, at);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.controls.enabled) return;
    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1 || event.button !== 0 || this.keyboard.active) { this.pointerStart = undefined; return; }
    this.pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  private onPointerMove = (event: PointerEvent): void => {
    const down = this.pointerStart;
    if (down?.id === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) this.pointerStart = undefined;
  };

  private onPointerCancel = (event: PointerEvent): void => {
    this.pointerStart = undefined; this.pointers.delete(event.pointerId); this.onNavigationEnd();
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    const down = this.pointerStart; this.pointerStart = undefined;
    if (!this.controls.enabled || !down || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), this.camera);
    this.scene.updateMatrixWorld(true);
    for (const hit of this.raycaster.intersectObjects(this.shell.children, true)) {
      if (!(hit.object instanceof THREE.Mesh) || hit.object instanceof LineSegments2 || hit.object instanceof Line2) continue;
      let visible = true, id: string | undefined;
      for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) {
        visible &&= object.visible;
        id ??= object.userData.entityId as string | undefined;
      }
      if (!visible) continue;
      if (id && this.openings.has(id)) this.toggleOpening(id);
      break;
    }
  };

  private toggleOpening(id: string): void {
    const entry = this.openings.get(id);
    if (!entry?.ready || entry.projection.fixed || this.disposed) return;
    const projection = entry.projection, from = projection.angle;
    projection.target = projection.target > 0 ? 0 : Math.PI / 2;
    const target = projection.target, token = ++entry.token;
    entry.button.setAttribute('aria-pressed', String(target > 0));
    entry.button.textContent = entry.button.textContent!.replace(/^(Open|Close) /, target > 0 ? 'Close ' : 'Open ');
    void this.shellTween(0.28, k => { if (entry.token === token) projection.setAngle(lerp(from, target, easeOut(k))); });
  }

  // ---------- workbench ----------

  private ensureBench(): void {
    if (this.benchPlate) return;
    const b = this.flatBox ?? { minX: -NOMINAL_PLAN_WIDTH / 2, maxX: NOMINAL_PLAN_WIDTH / 2, minZ: -5, maxZ: 5 };
    // Wide hosts: workbench beside the flat. Portrait hosts: below it, so the union stays tall.
    const portrait = this.camera.aspect < 1;
    this.benchX0 = portrait ? (b.minX + b.maxX) / 2 - 2.2 : b.maxX + 1.4;
    this.benchZ0 = portrait ? b.maxZ + 1.6 : b.minZ;
    this.benchZ = [this.benchZ0, this.benchZ0];
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#1c2030', roughness: 0.95, transparent: true, opacity: 0.92 }));
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0.004;
    plate.receiveShadow = true;
    this.benchPlate = plate;
    this.bench.add(plate);
    this.benchLabel = this.label('as-bench-label', 'Built from your photos');
    this.bench.add(this.benchLabel);
  }

  private resizeBench(): void {
    if (!this.benchPlate) return;
    const minZ = this.benchZ0 - 0.35, maxZ = Math.max(...this.benchZ) - 0.15;
    const w = 4.8;
    this.benchPlate.scale.set(w, Math.max(1, maxZ - minZ), 1);
    this.benchPlate.position.set(this.benchX0 + 2.2, 0.004, (minZ + maxZ) / 2);
    this.benchLabel?.position.set(this.benchX0 + 2.2, 0, maxZ + 0.2);
  }

  private addSlot(id: string, footprint: Vec2, count: number, name = humanise(id)): Slot {
    this.ensureBench();
    const col = this.benchZ[0] <= this.benchZ[1] ? 0 : 1;
    const [w, d] = footprint;
    const center = new THREE.Vector3(this.benchX0 + col * 2.3 + 1.05, 0, this.benchZ[col] + d / 2);
    this.benchZ[col] += d + 0.55;
    const x = w / 2, z = d / 2, y = 0.03;
    const outlineMat = this.lineMat({ linewidth: 2, opacity: 0.55, dashed: true, dashSize: 0.12, gapSize: 0.08 });
    const outline = new LineSegments2(new LineSegmentsGeometry().setPositions([-x, y, -z, x, y, -z, x, y, -z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, y, -z]), outlineMat);
    outline.computeLineDistances();
    outline.position.copy(center);
    this.bench.add(outline);
    const slot: Slot = { id, name, footprint, center, count, outline, outlineMat, built: false, placed: 0 };
    this.slots.set(id, slot);
    this.resizeBench();
    return slot;
  }

  private onPieces(pieces: { id: string; size: Vec3; count: number }[]): void {
    for (const p of pieces) if (!this.slots.has(p.id)) this.addSlot(p.id, [p.size[0], p.size[1]], p.count);
    if (this.flatBox) void this.fit(() => this.framing(this.sceneBox()), 2.2, { orbit: 0, sway: 0 });
    this.fitShadow(this.sceneBox());
  }

  private onPiece(pieceId: string, asset: StageAsset): void {
    const slot = this.slots.get(pieceId) ?? this.addSlot(pieceId, [asset.dimensions[0], asset.dimensions[2]], 1, asset.name);
    slot.name = asset.name || slot.name;
    const loading = this.trackAsset(this.loadModel(asset));
    const run = this.limited(() => this.assemble(slot, asset, loading));
    this.assemblies.add(run);
    void run.finally(() => this.assemblies.delete(run));
  }

  /** Up to three pieces assemble at once; the rest wait their turn. */
  private async limited(task: () => Promise<void>): Promise<void> {
    if (this.building >= 3) await new Promise<void>(r => this.waiting.push(r));
    this.building++;
    try { if (!this.disposed) await task(); }
    catch (err) { console.error('[architect-stage]', err); }
    finally { this.building--; this.waiting.shift()?.(); }
  }

  /** Animation scale for assembly: shorter when others are waiting, near-instant when rushing. */
  private pace(): number {
    if (this.rush) return 0.12;
    return 1 / (1 + this.waiting.length + Math.max(0, this.building - 1) * 0.5);
  }

  private async loadModel(asset: StageAsset): Promise<{ model: THREE.Group; parts: THREE.Object3D[] }> {
    const gltf = await this.loader.loadAsync(asset.source.url);
    const scene = gltf.scene;
    const root = scene.children.length === 1 ? scene.children[0]! : scene;
    const parts = root.children.length ? [...root.children] : [root];
    const model = normalizeAsset(scene, asset.dimensions);
    return { model, parts };
  }

  private async assemble(slot: Slot, asset: StageAsset, loading: Promise<{ model: THREE.Group; parts: THREE.Object3D[] }>): Promise<void> {
    this.requestPhase(2);
    this.pieceLabel.element.innerHTML = `<span>Building</span><strong>${escapeHtml(slot.name)}</strong>`;
    this.pieceLabel.position.set(slot.center.x, asset.dimensions[1] + 0.9, slot.center.z);
    this.pieceLabel.visible = true;
    void this.tween(0.4, k => { this.pieceLabel.element.style.opacity = String(k); });

    let loaded: { model: THREE.Group; parts: THREE.Object3D[] };
    try { loaded = await loading; }
    catch (err) {
      console.warn('[architect-stage] model failed', asset.source.url, err);
      this.pieceLabel.visible = false;
      return;
    }
    if (this.disposed) { disposeObject(loaded.model); return; }
    const { model, parts } = loaded;
    model.position.copy(slot.center);
    this.bench.add(model);
    model.updateMatrixWorld(true);
    slot.model = model;

    // Wireframe edges per part, and hidden materials.
    const edgeMat = this.lineMat({ linewidth: 2.2, opacity: 0 });
    const materials: THREE.Material[] = [];
    const meshes: THREE.Mesh[] = [];
    model.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
    meshes.forEach(o => {
      const edges = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(o.geometry, 28)), edgeMat);
      edges.name = '__edges';
      o.add(edges);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.push(m);
        m.transparent = true; m.opacity = 0; m.depthWrite = false; m.needsUpdate = true;
      }
    });

    // Explode parts outward from the piece's centre, in real metres.
    const centre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    const size = new THREE.Vector3(...asset.dimensions);
    const reach = Math.min(0.9, 0.25 + size.length() * 0.22);
    const moves = parts.map((part, i) => {
      const home = part.position.clone();
      const c = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
      const dir = new THREE.Vector3(c.x - centre.x, 0, c.z - centre.z);
      if (dir.lengthSq() < 1e-4) { const a = i * 2.39996; dir.set(Math.cos(a), 0, Math.sin(a)); }
      dir.normalize().multiplyScalar(reach).setY(0.25 + reach * 0.6 + (c.y - centre.y) * 0.4);
      const parent = part.parent!;
      const a = parent.worldToLocal(c.clone());
      const bb = parent.worldToLocal(c.clone().add(dir));
      const away = home.clone().add(bb.sub(a));
      if (!this.rush) part.position.copy(away);
      return { part, home, away, name: String((part.userData?.varpet as { part?: string } | undefined)?.part ?? part.name ?? '') };
    });

    // 1. Exploded wireframe fades in.
    if (!this.rush) await this.tween(0.5 * this.pace(), k => { edgeMat.opacity = k; });
    // 2. Parts assemble group by group, with the part's name.
    const groups = new Map<string, typeof moves>();
    for (const m of moves) { const g = partGroup(m.name); groups.set(g, [...(groups.get(g) ?? []), m]); }
    for (const [name, members] of groups) {
      if (this.disposed) return;
      if (this.rush) { for (const m of moves) m.part.position.copy(m.home); break; }
      const per = Math.min(0.55, 3.2 / Math.max(1, groups.size)) * this.pace();
      const first = members[0]!.part;
      const wc = new THREE.Box3().setFromObject(first).getCenter(new THREE.Vector3());
      this.partLabel.position.copy(wc).add(new THREE.Vector3(0, 0.12, 0));
      this.partLabel.element.textContent = humanise(name);
      this.partLabel.visible = per > 0.18 && name.length > 0 && this.building === 1;
      await this.tween(per, k => {
        const e = easeInOut(k);
        for (const m of members) m.part.position.lerpVectors(m.away, m.home, e);
      });
    }
    this.partLabel.visible = false;
    // 3. Real materials fade in, the wireframe fades out.
    await this.tween(this.rush ? 0.3 : 0.9 * this.pace(), k => {
      for (const m of materials) m.opacity = k;
      edgeMat.opacity = 1 - k * 0.85;
    });
    for (const m of materials) { m.transparent = false; m.opacity = 1; m.depthWrite = true; m.needsUpdate = true; }
    meshes.forEach(o => { o.castShadow = true; o.receiveShadow = true; });
    void this.tween(0.6, k => { edgeMat.opacity = 0.15 * (1 - k); }).then(() => {
      const trash: THREE.Object3D[] = [];
      model.traverse(o => { if (o.name === '__edges') trash.push(o); });
      trash.forEach(o => { (o as LineSegments2).geometry.dispose(); o.removeFromParent(); });
      edgeMat.dispose(); this.lineMats.delete(edgeMat);
    });
    slot.outline.visible = false;
    slot.built = true;
    slot.lamp = lampInfo(model);
    void this.tween(0.4, k => { this.pieceLabel.element.style.opacity = String(1 - k); }).then(() => { this.pieceLabel.visible = false; });
  }

  // ---------- placements ----------

  private onPlacements(objects: StagePlacement[], lights: StageComponent[]): void {
    const bySlot = (assetId: string, id: string) => {
      for (const s of this.slots.values()) if (s.model && (assetId.endsWith(`-${s.id}`) || assetId === s.id)) return s;
      return this.slots.get(id.replace(/-\d+$/, ''));
    };
    this.rush = true;
    this.placing = (async () => {
      await Promise.all([...this.assemblies]);
      if (this.disposed) return;
      this.requestPhase(3);
      void this.fit(() => this.framing(this.sceneBox()), 2.0, { orbit: 0, sway: 0 });
      const jobs: Promise<void>[] = [];
      const flights: { slot: Slot; to: Vec3; rotation: number; light: boolean }[] = [];
      for (const o of objects) { const s = bySlot(o.assetId, o.id); if (s?.model) flights.push({ slot: s, to: o.position, rotation: o.rotation ?? 0, light: false }); }
      for (const l of lights) { const s = this.slots.get(l.id.replace(/-\d+$/, '')); if (s?.model) flights.push({ slot: s, to: l.position, rotation: l.rotation ?? 0, light: true }); }
      const gap = Math.min(0.45, 3.5 / Math.max(1, flights.length));
      // The last flight of a piece carries the bench model itself; earlier ones carry copies.
      const lastOf = new Map<Slot, number>();
      flights.forEach((f, i) => lastOf.set(f.slot, i));
      flights.forEach((f, i) => jobs.push(this.fly(f.slot, f.to, f.rotation, i * gap, f.light, lastOf.get(f.slot) === i)));
      await Promise.all(jobs);
      const flat = this.flatBox;
      if (flat) void this.fit(() => this.framing(flat, 0.95, -0.3, 1.1), 2.4, { orbit: 0, sway: 0 });
      // Lamps switch on one by one.
      const lit = flights.filter(f => f.light);
      for (const f of lit) { if (this.disposed) return; await this.switchOn(f.slot, f.to); }
    })();
  }

  private async fly(slot: Slot, to: Vec3, rotation: number, delay: number, light: boolean, original: boolean): Promise<void> {
    const src = slot.model!;
    const obj = original ? src : src.clone(true);
    if (!original) { obj.position.copy(src.position); this.bench.add(obj); }
    slot.placed++;
    const from = obj.position.clone();
    const end = new THREE.Vector3(to[0], to[1], to[2]);
    const lift = 2.4 + from.distanceTo(end) * 0.18;
    const mid = from.clone().lerp(end, 0.5).setY(Math.max(from.y, end.y) + lift);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, end);
    const pts = curve.getPoints(48);
    const trailGeo = new LineGeometry().setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
    const trailMat = this.lineMat({ linewidth: 2.4, opacity: 0.9, dashed: true, dashSize: 0.18, gapSize: 0.12 });
    const trail = new Line2(trailGeo, trailMat);
    trail.computeLineDistances();
    trailGeo.instanceCount = 0;
    this.fx.add(trail);
    const r0 = 0;
    const dr = Math.atan2(Math.sin(rotation - r0), Math.cos(rotation - r0));
    await this.tween(1.7, k => {
      const e = easeInOut(k);
      curve.getPoint(e, obj.position);
      obj.rotation.y = r0 + dr * e;
      trailGeo.instanceCount = Math.floor(e * (pts.length - 1));
    }, delay);
    obj.position.copy(end);
    obj.rotation.y = rotation;
    this.bench.remove(obj);
    this.flat.add(obj);
    this.placed.push(obj);
    if (!light) void this.landingRing(end);
    await this.tween(0.9, k => { trailMat.opacity = 0.9 * (1 - k); });
    trail.removeFromParent();
    trailGeo.dispose(); trailMat.dispose(); this.lineMats.delete(trailMat);
  }

  private async landingRing(at: THREE.Vector3): Promise<void> {
    const mat = new THREE.MeshBasicMaterial({ color: this.accent, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.02, at.z);
    this.fx.add(ring);
    await this.tween(0.8, k => { const s = 0.3 + easeOut(k) * 0.7; ring.scale.set(s, s, s); mat.opacity = 0.7 * (1 - k); });
    ring.removeFromParent(); ring.geometry.dispose(); mat.dispose();
  }

  private async switchOn(slot: Slot, at: Vec3): Promise<void> {
    const light = new THREE.PointLight('#ffcf9c', 0, 6, 2);
    const h = slot.model ? new THREE.Box3().setFromObject(slot.model).getSize(new THREE.Vector3()).y : 0.5;
    const pendant = at[1] > 1.2;
    light.position.set(at[0], at[1] + (pendant ? 0.12 : h * 0.72), at[2]);
    this.flat.add(light);
    this.lamps.push(light);
    const glow = slot.lamp?.glow ?? [];
    glow.forEach(m => { m.emissive.set('#ffc68a'); });
    await this.tween(0.9, k => {
      const e = easeOut(k);
      light.intensity = 3.2 * e;
      glow.forEach(m => { m.emissiveIntensity = 0.9 * e; });
    });
    await this.wait(0.35);
  }

  // ---------- finish ----------

  private async runFinish(): Promise<void> {
    if (this.disposed) return;
    this.tracing = false;
    // Even a fast/cached response gets its complete, truthful construction reveal.
    let shellReady: Promise<void>;
    do { shellReady = this.shellReady; await shellReady; } while (!this.disposed && shellReady !== this.shellReady);
    if (this.disposed) return;
    this.requestPhase(4);
    // Fast-forward whatever is still running (assembly, flights, lamps): ~2 s of real time at most.
    this.rush = true;
    this.timeScale = this.reduced ? 1 : 5;
    let timeout: Tween | undefined;
    const limit = new Promise<void>(resolve => {
      timeout = { start: this.now, dur: this.reduced ? 2 : 10, fn: () => undefined, resolve };
      this.tweens.push(timeout); this.invalidate();
    });
    await Promise.race([Promise.all([...this.assemblies, this.placing]), limit]);
    // A completed load must cancel its losing timeout; otherwise that invisible
    // job keeps rendering long after the completed apartment has settled.
    const timeoutIndex = timeout ? this.tweens.indexOf(timeout) : -1;
    if (timeoutIndex >= 0) { this.tweens.splice(timeoutIndex, 1); timeout!.resolve(); }
    this.timeScale = 1;
    if (this.disposed) return;
    const b = this.flatBox ?? this.sceneBox();
    const skyFrom = this.hemi.color.clone(), sunFrom = this.sun.color.clone(), bgFrom = (this.scene.background as THREE.Color).clone();
    const skyTo = new THREE.Color('#ffe9d2'), sunTo = new THREE.Color('#ffdcb0');
    const bgTo = new THREE.Color(this.options.blueprint?.paper ?? (this.options.holdOnFinish ? '#e6e5df' : '#17140f'));
    // On a blueprint the grid stays as the drafting ground beneath the finished model.
    const gridTo = this.options.blueprint ? 0.45 : 0;
    const sheetFrom = this.sheetUniforms.uOpacity.value;
    const slotMats = [...this.slots.values()].map(sl => [sl.outlineMat, sl.outlineMat.opacity] as const);
    const leftovers: THREE.Material[] = [];
    this.bench.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; leftovers.push(m); } });
    const labelsOut = [this.benchLabel, ...this.shell.children.filter(c => c instanceof CSS2DObject)] as (CSS2DObject | undefined)[];
    const drafts = [...this.draftMats].map(material => [material, material.opacity] as const);
    const finalCamera = this.fit(() => this.framing(b, 0.74, -0.42, 1.18), 3.2, { orbit: 0, sway: 0 });
    await this.tween(2.6, k => {
      const e = easeInOut(k);
      this.gridUniforms.uOpacity.value = lerp(1, gridTo, e);
      this.sheetUniforms.uOpacity.value = sheetFrom * (1 - e);
      drafts.forEach(([material, opacity]) => { material.opacity = opacity * (1 - e); });
      slotMats.forEach(([m, o]) => { m.opacity = o * (1 - e); });
      leftovers.forEach(m => { m.opacity = 1 - e; });
      labelsOut.forEach(l => { if (l) l.element.style.opacity = String(1 - e); });
      this.hemi.color.lerpColors(skyFrom, skyTo, e);
      this.sun.color.lerpColors(sunFrom, sunTo, e);
      this.sun.intensity = lerp(1.4, 1.8, e);
      this.scene.environmentIntensity = lerp(0.55, 0.75, e);
      (this.scene.background as THREE.Color).lerpColors(bgFrom, bgTo, e);
    });
    if (this.disposed) return;
    this.bench.visible = false;
    await finalCamera;
    if (this.disposed) return;
    if (this.options.holdOnFinish) { this.emitPhase('done'); this.invalidate(); return; }
    await this.wait(1.4);
    await this.tween(1.0, k => { this.veil.style.opacity = String(easeInOut(k)); });
    if (this.disposed) return;
    this.emitPhase('done');
  }

  // ---------- overlay ----------

  private requestPhase(i: number): void { this.wantPhase = Math.max(this.wantPhase, Math.min(PHASES.length - 1, i)); this.invalidate(); }

  private setPhase(i: number): void {
    this.phase = i;
    this.phaseAt = this.now;
    this.emitPhase(PHASES[i] ?? 'checking');
  }

  private emitPhase(phase: StagePhase): void {
    if (phase === 'done') { this.phase = PHASES.length; this.wantPhase = PHASES.length; }
    this.currentPhase = phase;
    if (this.hydrating) return;
    for (const cb of this.phaseListeners) { try { cb(phase); } catch (err) { console.error('[architect-stage] onPhase', err); } }
  }

  onPhase(cb: (phase: StagePhase) => void): () => void {
    this.phaseListeners.add(cb);
    cb(this.currentPhase);
    return () => { this.phaseListeners.delete(cb); };
  }

  // ---------- helpers ----------

  private trackAsset<T>(loading: Promise<T>): Promise<T> {
    this.assets.add(loading);
    void loading.then(() => this.assets.delete(loading), () => this.assets.delete(loading));
    return loading;
  }

  private label(className: string, html: string): CSS2DObject {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = html;
    return new CSS2DObject(el);
  }

  private lineMat(opts: { linewidth: number; opacity: number; dashed?: boolean; dashSize?: number; gapSize?: number }): LineMaterial {
    const m = new LineMaterial({ color: this.accent.getHex(), linewidth: opts.linewidth, transparent: true, opacity: opts.opacity, dashed: opts.dashed ?? false, dashSize: opts.dashSize ?? 1, gapSize: opts.gapSize ?? 1, worldUnits: false, toneMapped: false });
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    m.resolution.set(size.x, size.y);
    this.lineMats.add(m);
    return m;
  }

  private url(src: Source): string {
    if (typeof src === 'string') return src;
    const u = URL.createObjectURL(src);
    this.urls.push(u);
    return u;
  }
}

function lampInfo(model: THREE.Object3D): LampInfo {
  const glow: THREE.MeshStandardMaterial[] = [];
  const glowing = /shade|enamel|glass|bulb|diffuser|opal|frosted|paper/i;
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const info = (o.userData?.varpet ?? {}) as { material?: string; part?: string };
    const hit = glowing.test(info.material ?? '') || /bulb|underside|diffuser/i.test(info.part ?? o.name);
    if (!hit) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof THREE.MeshStandardMaterial && !glow.includes(m)) glow.push(m);
  });
  return { glow };
}

function boundsOf(rooms: StageRoom[], walls: StageWall[]): Box2 | undefined {
  const pts: Vec2[] = rooms.flatMap(r => r.polygon);
  if (!pts.length) walls.forEach(w => pts.push(w.start, w.end));
  if (!pts.length) return undefined;
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/**
 * Outer walls: recorded as exterior or shared, otherwise walls with no room on one side.
 * Without rooms, walls lying along the flat's bounding box.
 */
function isMainWall(wall: StageWall, rooms: StageRoom[], box: Box2, metadata: Record<string, EntityMetadata>): boolean {
  const boundary = metadata[wall.id]?.boundary;
  if (boundary) return boundary !== 'interior';
  const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L, nz = dx / L, reach = Math.max(0.05, wall.thickness) / 2 + 0.2;
  const polygons = rooms.filter(r => r.polygon.length >= 3).map(r => r.polygon);
  if (polygons.length) return [0.3, 0.5, 0.7].some(f => [1, -1].some(side => {
    const p: Vec2 = [wall.start[0] + dx * f + nx * reach * side, wall.start[1] + dz * f + nz * reach * side];
    return !polygons.some(poly => insidePolygon(p, poly));
  }));
  const edge = Math.max(0.35, wall.thickness);
  const near = (a: number, b: number) => Math.abs(a - b) <= edge;
  return (near(wall.start[0], box.minX) && near(wall.end[0], box.minX)) || (near(wall.start[0], box.maxX) && near(wall.end[0], box.maxX))
    || (near(wall.start[1], box.minZ) && near(wall.end[1], box.minZ)) || (near(wall.start[1], box.maxZ) && near(wall.end[1], box.maxZ));
}

function insidePolygon([x, z]: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!;
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

function polygonCentroid(poly: Vec2[]): Vec2 {
  const A = polygonArea(poly);
  if (Math.abs(A) < 1e-6) { const n = poly.length || 1; return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]; }
  let cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f;
  }
  return [cx / (6 * A), cz / (6 * A)];
}

function entrancePoint(walls: StageWall[]): THREE.Vector2 | undefined {
  let best: { w: StageWall; o: StageOpening } | undefined;
  for (const w of walls) for (const o of w.openings ?? []) {
    if (o.kind !== 'door') continue;
    if (/entr|front|main/i.test(o.id ?? '')) { best = { w, o }; break; }
    best ??= { w, o };
  }
  if (!best) return undefined;
  const { w, o } = best;
  const dx = w.end[0] - w.start[0], dz = w.end[1] - w.start[1], L = Math.hypot(dx, dz) || 1;
  const s = o.offset + o.width / 2;
  return new THREE.Vector2(w.start[0] + (dx / L) * s, w.start[1] + (dz / L) * s);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export function createArchitectStage(host: HTMLElement, options: ArchitectStageOptions = {}): ArchitectStage {
  const stage = new Stage(host, options);
  return {
    onPhase: cb => stage.onPhase(cb),
    start: (plan, photos) => stage.start(plan, photos),
    hydrate: (events, phase) => stage.hydrate(events, phase),
    planRect: () => stage.planRect(),
    enter: () => stage.enter(),
    settle: (view, duration) => stage.settle(view, duration),
    event: e => stage.event(e),
    progress: m => stage.progress(m),
    finish: () => stage.finish(),
    dispose: () => stage.dispose(),
  };
}
