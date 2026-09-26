import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/** Reduce costly AO sampling during gestures; keep geometry guides sharp for enlargement. */
export class AdaptiveOcclusionPass extends GTAOPass {
  // This existing r186 member is omitted from @types/three's GTAOPass declaration.
  declare readonly normalRenderTarget: THREE.WebGLRenderTarget;
  private fullWidth = 1;
  private fullHeight = 1;
  private interacting = false;
  private quality: 'balanced' | 'high' = 'balanced';

  constructor(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    super(scene, camera, width, height);
    Object.assign(this.blendMaterial.uniforms, {
      tStudioDepth: { value: this.depthTexture },
      tStudioNormal: { value: this.normalTexture },
      studioAOSize: { value: new THREE.Vector2(width, height) },
      studioCameraNearFar: { value: new THREE.Vector2() },
      studioPerspective: { value: true },
      studioHalfResolution: { value: false },
    });
    this.blendMaterial.fragmentShader = `
      #include <packing>
      uniform float intensity;
      uniform sampler2D tDiffuse;
      uniform sampler2D tStudioDepth;
      uniform sampler2D tStudioNormal;
      uniform vec2 studioAOSize;
      uniform vec2 studioCameraNearFar;
      uniform bool studioPerspective;
      uniform bool studioHalfResolution;
      varying vec2 vUv;

      float viewZ(float depth) {
        return studioPerspective
          ? perspectiveDepthToViewZ(depth, studioCameraNearFar.x, studioCameraNearFar.y)
          : orthographicDepthToViewZ(depth, studioCameraNearFar.x, studioCameraNearFar.y);
      }

      void main() {
        float depth = texture2D(tStudioDepth, vUv).r;
        // Excluded scenery and the sky have no AO surface, even at a silhouette.
        if (depth >= 0.999999) { gl_FragColor = vec4(1.0); return; }
        vec4 occlusion = texture2D(tDiffuse, vUv);
        if (studioHalfResolution) {
          float centerZ = viewZ(depth);
          vec3 centerNormal = unpackRGBToNormal(texture2D(tStudioNormal, vUv).rgb);
          vec2 pixel = vUv * studioAOSize - 0.5;
          vec2 base = floor(pixel), fraction = fract(pixel);
          float total = 0.0;
          vec3 sum = vec3(0.0);
          for (int y = 0; y < 2; y++) {
            for (int x = 0; x < 2; x++) {
              vec2 offset = vec2(float(x), float(y));
              vec2 uv = clamp((base + offset + 0.5) / studioAOSize, 0.5 / studioAOSize, 1.0 - 0.5 / studioAOSize);
              float sampleDepth = texture2D(tStudioDepth, uv).r;
              vec3 sampleNormal = unpackRGBToNormal(texture2D(tStudioNormal, uv).rgb);
              vec2 linearWeight = mix(1.0 - fraction, fraction, offset);
              float depthWeight = exp(-abs(viewZ(sampleDepth) - centerZ) / (0.02 + abs(centerZ) * 0.001));
              float normalWeight = pow(max(dot(centerNormal, sampleNormal), 0.0), 32.0);
              float weight = linearWeight.x * linearWeight.y * depthWeight * normalWeight;
              if (sampleDepth >= 0.999999) weight = 0.0;
              sum += texture2D(tDiffuse, uv).rgb * weight;
              total += weight;
            }
          }
          // Thin foreground geometry may have no matching coarse sample. Keeping
          // it unoccluded is preferable to pulling a dark halo across its edge.
          occlusion = vec4(total > 0.0001 ? sum / total : vec3(1.0), 1.0);
        }
        gl_FragColor = vec4(mix(vec3(1.0), occlusion.rgb, intensity), occlusion.a);
      }
    `;
    this.setSize(width, height);
  }

  setInteracting(active: boolean): void {
    if (active === this.interacting) return;
    this.interacting = active;
    this.setSize(this.fullWidth, this.fullHeight);
  }

  setQuality(quality: 'balanced' | 'high'): void {
    this.quality = quality;
    const samples = quality === 'high' ? 32 : 16;
    this.updateGtaoMaterial({ samples });
    this.updatePdMaterial({ samples, radius: (quality === 'high' ? 8 : 5) * (this.interacting ? 0.5 : 1) });
  }

  override setSize(width: number, height: number): void {
    this.fullWidth = Math.max(1, Math.floor(width));
    this.fullHeight = Math.max(1, Math.floor(height));
    this.width = this.interacting ? Math.ceil(this.fullWidth / 2) : this.fullWidth;
    this.height = this.interacting ? Math.ceil(this.fullHeight / 2) : this.fullHeight;
    // GTAOPass.setSize resizes all three targets together. Size these separately
    // so switching interaction never reallocates the full-resolution G-buffer.
    this.normalRenderTarget.setSize(this.fullWidth, this.fullHeight);
    this.gtaoRenderTarget.setSize(this.width, this.height);
    this.pdRenderTarget.setSize(this.width, this.height);
    this.gtaoMaterial.uniforms.resolution!.value.set(this.width, this.height);
    this.gtaoMaterial.uniforms.cameraProjectionMatrix!.value.copy(this.camera.projectionMatrix);
    this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse!.value.copy(this.camera.projectionMatrixInverse);
    this.pdMaterial.uniforms.resolution!.value.set(this.width, this.height);
    this.pdMaterial.uniforms.cameraProjectionMatrixInverse!.value.copy(this.camera.projectionMatrixInverse);
    this.blendMaterial.uniforms.studioAOSize!.value.set(this.width, this.height);
    this.blendMaterial.uniforms.studioHalfResolution!.value = this.interacting;
    this.updatePdMaterial({ radius: (this.quality === 'high' ? 8 : 5) * (this.interacting ? 0.5 : 1) });
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const camera = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    this.blendMaterial.uniforms.studioCameraNearFar!.value.set(camera.near, camera.far);
    this.blendMaterial.uniforms.studioPerspective!.value = camera instanceof THREE.PerspectiveCamera;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
