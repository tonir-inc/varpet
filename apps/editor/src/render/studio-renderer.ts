import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SelectionOutline } from './selection-outline';

type StudioCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/** Glass, cutaway ghosts and editor handles must never become solid AO occluders. */
class ContactOcclusionPass extends GTAOPass {
  private readonly hidden: THREE.Object3D[] = [];
  private readonly clearColor = new THREE.Color();

  constructor(scene: THREE.Scene, camera: StudioCamera, width: number, height: number) {
    super(scene, camera, width, height);
    // At grazing angles, floating point dot products can marginally exceed
    // [-1, 1]. The stock r186 horizon integration feeds them into sqrt/acos,
    // creating sparse non-finite pixels even across a perfectly flat floor.
    this.gtaoMaterial.fragmentShader = this.gtaoMaterial.fragmentShader
      .replace('vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);', `
        cosHorizons = clamp(cosHorizons, vec2(-1.0), vec2(1.0));
        vec2 sinHorizons = sqrt(max(vec2(0.0), 1.0 - cosHorizons * cosHorizons));
      `)
      .replace('ao = clamp(ao / float(DIRECTIONS), 0., 1.);', `
        ao = ao / float(DIRECTIONS);
        ao = isnan(ao) || isinf(ao) ? 1.0 : clamp(ao, 0.0, 1.0);
      `);
    // Excluded scenery has no surface in the G-buffer. Explicitly keep its
    // blend factor white rather than relying on denoiser discard precision.
    this.blendMaterial.uniforms.tStudioDepth = { value: this.depthTexture };
    this.blendMaterial.fragmentShader = this.blendMaterial.fragmentShader
      .replace('uniform float intensity;', 'uniform float intensity;\nuniform sampler2D tStudioDepth;')
      .replace('vec4 texel = texture2D( tDiffuse, vUv );', `
        float surfaceDepth = texture2D(tStudioDepth, vUv).r;
        if (surfaceDepth >= 0.999999) { gl_FragColor = vec4(1.0); return; }
        vec4 texel = texture2D(tDiffuse, vUv);
      `);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const originalOverride = this.scene.overrideMaterial;
    const originalAutoClear = renderer.autoClear;
    const originalShadowEnabled = renderer.shadowMap.enabled;
    const originalClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    this.scene.traverseVisible(object => {
      if (object.userData.studioAO === false) {
        this.hidden.push(object); object.visible = false;
      } else if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(material => !material.depthTest || !material.depthWrite || material.transparent || material.alphaTest > 0)) {
          this.hidden.push(object); object.visible = false;
        }
      } else if (object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points) {
        this.hidden.push(object); object.visible = false;
      }
    });
    // The beauty pass already updated the shadows. An override-material render
    // should neither update those maps nor spend another scene pass on them.
    renderer.shadowMap.enabled = false;
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      for (const object of this.hidden) object.visible = true;
      this.hidden.length = 0;
      this.scene.overrideMaterial = originalOverride;
      renderer.shadowMap.enabled = originalShadowEnabled;
      renderer.autoClear = originalAutoClear;
      renderer.setClearColor(this.clearColor, originalClearAlpha);
    }
  }

  override dispose(): void {
    super.dispose();
    // Three r186's GTAOPass.dispose omits these two owned shader materials.
    this.gtaoMaterial.dispose();
    this.blendMaterial.dispose();
  }
}

/** HDR studio rendering; tone mapping and the sRGB transfer happen once, at output. */
export class StudioRenderer {
  private readonly composer: EffectComposer;
  private readonly beauty: RenderPass;
  private readonly occlusion: ContactOcclusionPass;
  private readonly grade: ShaderPass;
  private readonly output = new OutputPass();
  private readonly selection: SelectionOutline;
  private disposed = false;
  private interior = false;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: StudioCamera) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
    target.texture.name = 'Studio linear HDR';
    this.composer = new EffectComposer(renderer, target);
    this.beauty = new RenderPass(scene, camera);
    this.selection = new SelectionOutline(scene, camera);
    this.occlusion = new ContactOcclusionPass(scene, camera, 1, 1);
    this.occlusion.blendIntensity = 0.82;
    // Metres, not screen pixels: nearby floor/wall junctions stay grounded as
    // the camera moves, without a broad dirty halo around the apartment.
    this.occlusion.updateGtaoMaterial({
      radius: 0.42, thickness: 0.45, distanceExponent: 1.5,
      distanceFallOff: 1, scale: 1, screenSpaceRadius: false,
    });
    this.occlusion.updatePdMaterial({ radius: 5, lumaPhi: 8, depthPhi: 3, normalPhi: 4 });
    this.grade = new ShaderPass({
      name: 'StudioGrade',
      uniforms: { tDiffuse: { value: null }, strength: { value: 1 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float strength;
        varying vec2 vUv;
        void main() {
          vec4 source = texture2D(tDiffuse, vUv);
          vec3 color = max(source.rgb, vec3(0.0));
          float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
          // A slight warm highlight/cool shadow split supports the lighting;
          // real finish colors and selection feedback remain recognizable.
          vec3 balance = mix(vec3(0.98, 1.005, 1.025), vec3(1.015, 1.0, 0.98), smoothstep(0.04, 0.8, luminance));
          vec2 centered = (vUv - 0.5) * 1.41421356;
          float vignette = 1.0 - 0.13 * smoothstep(0.18, 0.9, dot(centered, centered));
          gl_FragColor = vec4(mix(color, color * balance * vignette, strength), source.a);
        }
      `,
    });
    this.composer.addPass(this.beauty);
    this.composer.addPass(this.occlusion);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);
    this.composer.addPass(this.selection);
    this.setQuality('balanced');
    const size = renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
  }

  render(camera: StudioCamera): void {
    if (this.disposed) return;
    this.beauty.camera = camera;
    this.occlusion.camera = camera;
    this.selection.renderCamera = camera;
    // Top mode is a measurement-oriented orthographic view. Keep its fills
    // even and its overlays clear rather than carrying perspective AO into it.
    this.occlusion.enabled = camera instanceof THREE.PerspectiveCamera;
    this.grade.uniforms.strength!.value = this.occlusion.enabled ? (this.interior ? 0.2 : 1) : 0;
    this.composer.render();
  }

  /** Width/height are CSS pixels; the renderer remains owned by the viewport. */
  setSize(width: number, height: number, pixelRatio = this.renderer.getPixelRatio()): void {
    if (this.disposed) return;
    // The edge buffers stay at CSS resolution across quality/retina changes.
    this.selection.downSampleRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(Math.max(1, width), Math.max(1, height));
  }

  setSelection(objects: THREE.Object3D[]): void {
    if (!this.disposed) this.selection.setSelection(objects);
  }

  /** Keep an eye-level room view neutral; the dollhouse keeps its studio grade. */
  setInterior(inside: boolean): void {
    this.interior = inside;
    this.occlusion.blendIntensity = inside ? 0.65 : 0.82;
  }

  setQuality(quality: 'balanced' | 'high'): void {
    if (this.disposed) return;
    const high = quality === 'high';
    this.occlusion.updateGtaoMaterial({ samples: high ? 32 : 16 });
    this.occlusion.updatePdMaterial({ samples: high ? 32 : 16, radius: high ? 8 : 5 });
    const samples = Math.min(high ? 4 : 2, this.renderer.capabilities.maxSamples);
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (target.samples !== samples) {
        target.samples = samples;
        target.dispose();
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.beauty.dispose();
    this.occlusion.dispose();
    this.grade.dispose();
    this.output.dispose();
    this.selection.dispose();
    this.composer.dispose();
  }
}
