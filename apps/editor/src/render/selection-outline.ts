import * as THREE from 'three';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

/** Display-space white silhouette and violet halo, independent of scene lighting. */
export class SelectionOutline extends OutlinePass {
  private readonly visibility = new Map<THREE.Object3D, boolean>();
  private readonly clearColor = new THREE.Color();

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super(new THREE.Vector2(1, 1), scene, camera);
    this.enabled = false;
    this.edgeStrength = 5;
    this.edgeThickness = 1.4;
    this.edgeGlow = 1.1;
    this.pulsePeriod = 0;
    this.visibleEdgeColor.setRGB(0.08, 0.08, 0.08);
    this.hiddenEdgeColor.setRGB(0.55, 0.55, 0.52);

    // OutlinePass bakes the initial projection into its depth comparison.
    // Keep both projections correct without recompiling when Top is toggled.
    this.prepareMaskMaterial.uniforms.selectionOrthographic = { value: false };
    this.prepareMaskMaterial.fragmentShader = this.prepareMaskMaterial.fragmentShader
      .replace('uniform vec2 cameraNearFar;', 'uniform vec2 cameraNearFar;\nuniform bool selectionOrthographic;')
      .replace(/(?:perspective|orthographic)DepthToViewZ\( depth, cameraNearFar.x, cameraNearFar.y \)/,
        '(selectionOrthographic ? orthographicDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y) : perspectiveDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y))');

    // Normal alpha blending keeps the halo visible against pale floors too.
    // This pass runs after OutputPass, so these are display RGB values.
    this.overlayMaterial.blending = THREE.NormalBlending;
    this.overlayMaterial.fragmentShader = `
      varying vec2 vUv;
      uniform sampler2D maskTexture;
      uniform sampler2D edgeTexture1;
      uniform sampler2D edgeTexture2;
      uniform float edgeStrength;
      uniform float edgeGlow;
      void main() {
        float outside = texture2D(maskTexture, vUv).r;
        float edge = clamp(texture2D(edgeTexture1, vUv).r * edgeStrength, 0.0, 1.0) * outside;
        float halo = clamp(texture2D(edgeTexture2, vUv).r * edgeStrength * edgeGlow, 0.0, 0.65) * outside;
        float alpha = edge + halo * (1.0 - edge);
        // Folio selection: an ink line inside a highlighter-yellow halo.
        vec3 color = mix(vec3(0.98, 0.89, 0.42), vec3(0.08, 0.08, 0.08), edge / max(alpha, 0.0001));
        gl_FragColor = vec4(color, alpha);
      }
    `;
  }

  setSelection(objects: THREE.Object3D[]): void {
    this.selectedObjects = objects;
    this.enabled = objects.length > 0;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const scene = this.renderScene;
    const background = scene.background, override = scene.overrideMaterial;
    const autoClear = renderer.autoClear, shadows = renderer.shadowMap.enabled;
    const clearAlpha = renderer.getClearAlpha(), target = renderer.getRenderTarget();
    renderer.getClearColor(this.clearColor);
    const selectedMeshes = new Set<THREE.Object3D>();
    for (const root of this.selectedObjects) root.traverse(object => selectedMeshes.add(object));
    // Save exact visibility because the stock pass changes it during both masks.
    scene.traverse(object => this.visibility.set(object, object.visible));
    scene.traverseVisible(object => {
      if (object instanceof THREE.Line || object instanceof THREE.Sprite || object instanceof THREE.Points) {
        object.visible = false;
      } else if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.every(material => !material.visible || material.opacity <= 0)
          || materials.some(material => !material.depthTest)
          || (!selectedMeshes.has(object) && materials.some(material => material.transparent || !material.depthWrite))) {
          object.visible = false;
        }
      }
    });
    renderer.shadowMap.enabled = false;
    this.prepareMaskMaterial.uniforms.selectionOrthographic!.value = this.renderCamera instanceof THREE.OrthographicCamera;
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      for (const [object, visible] of this.visibility) object.visible = visible;
      this.visibility.clear();
      scene.background = background; scene.overrideMaterial = override;
      renderer.shadowMap.enabled = shadows; renderer.autoClear = autoClear;
      renderer.setClearColor(this.clearColor, clearAlpha); renderer.setRenderTarget(target);
    }
  }
}
