import * as THREE from 'three';

/**
 * The drafting ground an apartment built from a blueprint stands on: blueprint paper, a light grid
 * and a soft shadow, instead of the studio pedestal. While the architect works it also carries the
 * traced plan itself, so the walls rise out of the person's own drawing.
 * Presentation only: nothing here is part of the scene document or pickable.
 */
export interface BlueprintBackdrop { paper: string }
/** The traced plan on the ground: centre and size in metres, on the floor plane. */
export interface SheetRect { x: number; z: number; width: number; depth: number }

const INK = new THREE.Color('#e6f3f2');
const ignoreRaycast: THREE.Object3D['raycast'] = () => {};

export class BlueprintGround {
  readonly group = new THREE.Group();
  /** Linear background colour that reaches the screen as the page's paper after grading and tone mapping. */
  readonly background = new THREE.Color();
  private readonly gridUniforms = { uOpacity: { value: 1 }, uColor: { value: INK.clone() }, uCenter: { value: new THREE.Vector2() }, uReach: { value: new THREE.Vector2(8, 40) } };
  private readonly sheetUniforms = {
    uMap: { value: null as THREE.Texture | null }, uOpacity: { value: 0 }, uTrace: { value: -1 }, uTraceOn: { value: 0 },
    uErase: { value: -0.1 }, uAccent: { value: INK.clone() },
  };
  private readonly grid: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly sheet: THREE.Mesh;
  private rect: SheetRect = { x: 0, z: 0, width: 10, depth: 10 };
  private floor = 0;

  constructor(backdrop: BlueprintBackdrop, exposure: number) {
    this.group.name = 'Blueprint ground';
    this.group.userData.studioAO = false;
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShaderMaterial({
      uniforms: this.gridUniforms, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vPos; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float uOpacity; uniform vec3 uColor; uniform vec2 uCenter; uniform vec2 uReach; varying vec3 vPos;
        float gridLine(vec2 p, float size, float width) {
          vec2 q = p / size; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          return 1.0 - min(min(g.x, g.y) / width, 1.0);
        }
        void main() {
          float minor = gridLine(vPos.xz, 1.0, 1.1);
          float major = gridLine(vPos.xz, 5.0, 1.6);
          float fade = 1.0 - smoothstep(uReach.x, uReach.y, distance(vPos.xz, uCenter));
          gl_FragColor = vec4(uColor, (minor * 0.06 + major * 0.13) * fade * uOpacity);
        }`,
    }));
    // Shadows only: the paper itself is the background, so the ground never shows a horizon seam.
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ color: '#04232a', opacity: 0.3, depthWrite: false }));
    this.shadow.receiveShadow = true;
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.sheetUniforms, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform float uOpacity; uniform float uTrace; uniform float uTraceOn; uniform float uErase; uniform vec3 uAccent;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          // Working trace: a bright head follows the pen order along the lines, with a fading tail.
          float t = tex.r - uTrace;
          float glow = (exp(-(t * t) / (0.024 * 0.024)) + 0.7 * step(t, 0.0) * exp(t / 0.12)) * uTraceOn;
          // A soft drafting sweep lifts the source off the ground once the model stands on it.
          float remaining = smoothstep(uErase - 0.035, uErase + 0.035, 1.0 - vUv.y);
          float alpha = tex.a * (0.9 - 0.45 * uTraceOn + min(1.0, glow) * 0.55);
          gl_FragColor = vec4(mix(uAccent, vec3(1.0), min(1.0, glow)) * 1.15, min(1.0, alpha) * uOpacity * remaining);
        }`,
    }));
    this.grid.renderOrder = -3; this.shadow.renderOrder = -2; this.sheet.renderOrder = -1;
    for (const mesh of [this.grid, this.shadow, this.sheet]) {
      mesh.rotation.x = -Math.PI / 2; mesh.raycast = ignoreRaycast; mesh.userData.studioAO = false;
    }
    this.sheet.visible = false;
    this.group.add(this.grid, this.shadow, this.sheet);
    this.setPaper(backdrop.paper, exposure);
    this.layout();
  }

  setPaper(paper: string, exposure: number): void { paperBackground(paper, exposure, this.background); }

  /** Follow the apartment: the grid stays centred under it and the ground sits just below its floor. */
  update(bounds: THREE.Box3): void {
    if (bounds.isEmpty()) return;
    const centre = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    this.floor = bounds.min.y;
    this.gridUniforms.uCenter.value.set(centre.x, centre.z);
    const reach = Math.max(size.x, size.z, 6);
    this.gridUniforms.uReach.value.set(reach * 0.7, reach * 3.2);
    this.layout();
  }

  setSheet(ink: HTMLCanvasElement | null): void {
    const previous = this.sheetUniforms.uMap.value;
    if (ink) {
      const texture = new THREE.CanvasTexture(ink);
      texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 8;
      this.sheetUniforms.uMap.value = texture;
    } else this.sheetUniforms.uMap.value = null;
    previous?.dispose();
    this.sheet.visible = Boolean(ink);
  }

  get sheetRect(): SheetRect { return { ...this.rect }; }
  set sheetRect(rect: SheetRect) { this.rect = { ...rect }; this.layout(); }
  get sheetObject(): THREE.Object3D { return this.sheet; }
  get floorLevel(): number { return this.floor; }
  set sheetOpacity(value: number) { this.sheetUniforms.uOpacity.value = value; }
  get sheetOpacity(): number { return this.sheetUniforms.uOpacity.value; }
  /** Pen position along the traced order (0..1); `null` stops the working trace. */
  set trace(value: number | null) { this.sheetUniforms.uTraceOn.value = value == null ? 0 : 1; this.sheetUniforms.uTrace.value = value ?? -1; }
  /** 0 leaves the whole sheet, 1 has swept it away from the top down. */
  set erase(value: number) { this.sheetUniforms.uErase.value = -0.1 + value * 1.2; }

  private layout(): void {
    this.grid.position.set(0, this.floor - 0.012, 0);
    this.shadow.position.set(0, this.floor - 0.008, 0);
    this.sheet.position.set(this.rect.x, this.floor - 0.004, this.rect.z);
    this.sheet.scale.set(this.rect.width, this.rect.depth, 1);
    this.group.updateMatrixWorld(true);
  }

  dispose(): void {
    this.sheetUniforms.uMap.value?.dispose();
    for (const mesh of [this.grid, this.shadow, this.sheet]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.group.removeFromParent();
  }
}

/* The studio pipeline grades (a slight luminance-dependent balance) and then applies ACES filmic tone
   mapping before the sRGB transfer. Solve for the linear colour that comes out as the page's paper, so
   the 3D ground meets the HTML page behind it without a visible edge. */
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]] as const;
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]] as const;
const mul = (m: readonly (readonly number[])[], v: number[]) => m.map(row => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);
const rrt = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Linear scene colour to the linear display colour the studio pipeline writes (before the sRGB transfer). */
export function studioDisplayColor(linear: number[], exposure: number): number[] {
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  const k = smoothstep(0.04, 0.8, luminance);
  const balance = [0.98 + (1.015 - 0.98) * k, 1.005 + (1 - 1.005) * k, 1.025 + (0.98 - 1.025) * k];
  const graded = linear.map((c, i) => Math.max(0, c) * balance[i]! * exposure / 0.6);
  return mul(ACES_OUT, mul(ACES_IN, graded).map(rrt)).map(c => Math.min(1, Math.max(0, c)));
}

/** The linear background colour that the studio pipeline shows as `paper`. */
export function paperBackground(paper: string, exposure: number, target = new THREE.Color()): THREE.Color {
  const goal = new THREE.Color(paper); // linear working space
  const want = [goal.r, goal.g, goal.b];
  let guess = [...want];
  for (let i = 0; i < 40; i++) {
    const got = studioDisplayColor(guess, exposure);
    guess = guess.map((c, k) => Math.max(0, c * (want[k]! + 1e-4) / (got[k]! + 1e-4)));
  }
  return target.setRGB(guess[0]!, guess[1]!, guess[2]!, THREE.LinearSRGBColorSpace);
}
