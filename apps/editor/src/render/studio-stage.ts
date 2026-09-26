import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ignoreRaycast: THREE.Object3D['raycast'] = () => {};
export const STUDIO_BACKGROUND = '#a6ada1';

/** Presentation furniture only: never part of the apartment or its selectable entities. */
export class StudioStage {
  readonly group = new THREE.Group();
  /** Pedestal bounds for camera framing; deliberately excludes studio scenery. */
  readonly bounds = new THREE.Box3();

  private readonly border = new THREE.MeshStandardMaterial({ color: '#777777', roughness: 0.9, metalness: 0 });
  private readonly charcoal = new THREE.MeshStandardMaterial({ color: '#454b45', roughness: 0.86, metalness: 0.02 });
  private readonly recess = new THREE.MeshStandardMaterial({ color: '#282e29', roughness: 0.78 });
  private readonly brass = new THREE.MeshStandardMaterial({ color: '#968064', roughness: 0.48, metalness: 0.55 });
  private readonly groundMaterial = new THREE.MeshStandardMaterial({
    color: '#898b7c', roughness: 0.94, metalness: 0,
    emissive: '#a6ada1', emissiveIntensity: 0.04,
  });
  private readonly groundPoolScale = { value: new THREE.Vector2(1, 1) };
  private readonly cap = this.makeSlab(this.border);
  private readonly reveal = this.makeSlab(this.recess);
  private readonly body = this.makeSlab(this.charcoal);
  private readonly trim = this.makeSlab(this.brass);
  private readonly foot = this.makeSlab(this.recess);
  private readonly ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundMaterial);
  // Preserve the scenery lookup/visibility contract without drawing floor lines.
  private readonly inlays = new THREE.Group();
  private readonly backdropMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      daylight: { value: 1 },
      galleryLower: { value: new THREE.Color('#858b7c') },
      galleryUpper: { value: new THREE.Color(STUDIO_BACKGROUND) },
      galleryLight: { value: new THREE.Color('#dfc9a3') },
      galleryStone: { value: new THREE.Color('#a79b87') },
      galleryGreen: { value: new THREE.Color('#546d5d') },
    },
    vertexShader: `
      varying vec2 galleryUv;
      void main() {
        galleryUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float daylight;
      uniform vec3 galleryLower;
      uniform vec3 galleryUpper;
      uniform vec3 galleryLight;
      uniform vec3 galleryStone;
      uniform vec3 galleryGreen;
      varying vec2 galleryUv;
      // Broad signed-distance falloffs suggest an out-of-focus courtyard.
      // They have no repeating seams and never blur the editable apartment.
      float softBox(vec2 point, vec2 center, vec2 halfSize, float blur) {
        vec2 edge = abs(point - center) - halfSize;
        float distance = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0);
        return 1.0 - smoothstep(-blur, blur, distance);
      }
      float softCanopy(vec2 point, vec2 center, vec2 radius) {
        vec2 offset = (point - center) / radius;
        return exp(-dot(offset, offset) * 1.6);
      }
      void main() {
        vec2 point = vec2((galleryUv.x - 0.5) * 7.0, galleryUv.y * 3.5);
        vec3 color = mix(galleryLower, galleryUpper, smoothstep(0.0, 2.6, point.y));
        float architecture = softBox(point, vec2(-1.15, 1.0), vec2(0.72, 0.55), 0.24);
        architecture += softBox(point, vec2(1.7, 0.75), vec2(0.58, 0.32), 0.22) * 0.65;
        color = mix(color, galleryStone, clamp(architecture, 0.0, 1.0) * 0.65);
        float daylightOpening = softBox(point, vec2(0.35, 1.35), vec2(0.57, 0.68), 0.3);
        color = mix(color, galleryLight, daylightOpening * 0.56);
        float foliage = softCanopy(point, vec2(-1.85, 0.9), vec2(0.62, 0.8));
        foliage += softCanopy(point, vec2(1.25, 1.1), vec2(0.57, 0.68));
        foliage += softCanopy(point, vec2(2.1, 0.6), vec2(0.85, 0.45)) * 0.65;
        color = mix(color, galleryGreen, clamp(foliage, 0.0, 1.0) * 0.65);
        // Fade the distant environment into the real floor without a horizon line.
        float floorBlend = smoothstep(0.0, 0.5, point.y);
        gl_FragColor = vec4(color * daylight, floorBlend);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: false,
  });
  private readonly backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.backdropMaterial);
  private readonly shadowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      halfSize: { value: new THREE.Vector2() },
      planeSize: { value: new THREE.Vector2() },
      feather: { value: 1.2 },
    },
    vertexShader: `
      varying vec2 shadowUv;
      void main() {
        shadowUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 halfSize;
      uniform vec2 planeSize;
      uniform float feather;
      varying vec2 shadowUv;
      void main() {
        vec2 point = (shadowUv - 0.5) * planeSize;
        vec2 edge = abs(point) - halfSize + 0.12;
        float distanceToBase = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - 0.12;
        float soft = 1.0 - smoothstep(-0.08, feather, distanceToBase);
        float contact = 1.0 - smoothstep(-0.05, 0.26, distanceToBase);
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.30 * soft + 0.20 * contact);
      }
    `,
  });
  private readonly shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMaterial);
  private readonly previousBounds = new THREE.Box3();
  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly viewDirection = new THREE.Vector3(0, 0, 1);
  private readonly viewPosition = new THREE.Vector3();
  private studioSpan = 10;
  private groundY = -1.39;
  private disposed = false;
  private sceneryVisible = true;
  private topView = false;

  constructor() {
    this.group.name = 'Apartment presentation stage';
    this.group.visible = false;
    this.ground.name = 'Charcoal studio floor';
    this.ground.userData.studioAO = false;
    this.ground.rotation.x = -Math.PI / 2;
    // The separate soft contact shadow anchors the exhibit without projecting
    // a distracting hard silhouette of the apartment across the studio floor.
    this.ground.receiveShadow = false;
    // A wide continuous albedo falloff keeps the stage in a pool of light while
    // retaining StandardMaterial's lighting, tone mapping and fog.
    this.groundMaterial.onBeforeCompile = shader => {
      shader.uniforms.studioPoolScale = this.groundPoolScale;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vStudioFloorUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudioFloorUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 studioPoolScale;\nvarying vec2 vStudioFloorUv;')
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          vec2 studioRadius = (vStudioFloorUv - 0.5) * studioPoolScale;
          float studioPool = exp(-dot(studioRadius, studioRadius));
          diffuseColor.rgb *= mix(0.78, 1.12, studioPool);
        `)
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          totalEmissiveRadiance *= mix(0.4, 1.0, studioPool);
        `);
    };
    this.groundMaterial.customProgramCacheKey = () => 'studio-floor-courtyard-v3';
    // Retain this lookup name for existing skybox integrations.
    this.backdrop.name = 'Softly lit gallery curtains';
    this.backdrop.userData.studioAO = false;
    this.backdrop.frustumCulled = false;
    this.inlays.name = 'Subtle brass floor inlay';
    this.shadow.name = 'Soft pedestal contact shadow';
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.backdrop, this.ground, this.inlays, this.shadow, this.foot, this.body, this.trim, this.reveal, this.cap);
    this.group.traverse(object => { object.raycast = ignoreRaycast; });
  }

  private makeSlab(material: THREE.MeshStandardMaterial): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private resizeSlab(mesh: THREE.Mesh, width: number, height: number, depth: number, y: number, radius: number): void {
    mesh.geometry.dispose();
    mesh.geometry = new RoundedBoxGeometry(width, height, depth, 2, radius);
    mesh.position.set(this.center.x, y, this.center.z);
  }

  /** Accept structural bounds, whose minimum Y is the room's finished floor elevation. */
  update(modelBounds: THREE.Box3): void {
    if (this.disposed) return;
    if (modelBounds.isEmpty() || ![...modelBounds.min, ...modelBounds.max].every(Number.isFinite)) {
      this.group.visible = false;
      this.bounds.makeEmpty();
      this.previousBounds.makeEmpty();
      return;
    }
    this.group.visible = true;
    if (this.previousBounds.equals(modelBounds)) return;
    this.previousBounds.copy(modelBounds);
    modelBounds.getCenter(this.center);
    modelBounds.getSize(this.size);

    const width = Math.max(1, this.size.x) + 0.96;
    const depth = Math.max(1, this.size.z) + 0.96;
    // The scene's extruded floor slab extends 14 cm below its room elevation.
    const top = modelBounds.min.y - 0.14;
    // A tall exhibit plinth scales with the flat, while staying usable for small shells.
    const pedestalHeight = THREE.MathUtils.clamp(Math.max(width, depth) * 0.32, 2.8, 5.5);
    const groundY = top - pedestalHeight;
    this.groundY = groundY;
    this.studioSpan = Math.max(width, depth);
    this.resizeSlab(this.cap, width, 0.13, depth, top - 0.065, 0.023);
    this.resizeSlab(this.reveal, width - 0.1, 0.032, depth - 0.1, top - 0.146, 0.008);
    const bodyTop = top - 0.162;
    const bodyBottom = groundY + 0.12;
    this.resizeSlab(this.body, width - 0.12, bodyTop - bodyBottom, depth - 0.12, (bodyTop + bodyBottom) / 2, 0.032);
    this.resizeSlab(this.trim, width - 0.105, 0.023, depth - 0.105, groundY + 0.15, 0.006);
    this.resizeSlab(this.foot, width - 0.38, 0.12, depth - 0.38, groundY + 0.06, 0.012);

    const groundSize = Math.max(180, width * 12, depth * 12);
    this.ground.scale.set(groundSize, groundSize, 1);
    this.ground.position.set(this.center.x, groundY, this.center.z);
    this.groundPoolScale.value.set(groundSize / (width * 0.95), groundSize / (depth * 0.95));
    this.placeBackdrop();
    const feather = Math.max(0.85, Math.min(width, depth) * 0.13);
    const shadowWidth = width + feather * 2;
    const shadowDepth = depth + feather * 2;
    this.shadow.scale.set(shadowWidth, shadowDepth, 1);
    this.shadow.position.set(this.center.x, groundY + 0.006, this.center.z);
    (this.shadowMaterial.uniforms.halfSize!.value as THREE.Vector2).set(width / 2 - 0.12, depth / 2 - 0.12);
    (this.shadowMaterial.uniforms.planeSize!.value as THREE.Vector2).set(shadowWidth, shadowDepth);
    this.shadowMaterial.uniforms.feather!.value = feather;

    this.bounds.min.set(this.center.x - width / 2, groundY, this.center.z - depth / 2);
    this.bounds.max.set(this.center.x + width / 2, top, this.center.z + depth / 2);
    this.group.updateMatrixWorld(true);
  }

  /** The gallery backdrop and floor emission follow the same daily cycle. */
  setDaylight(level: number): void {
    const daylight = THREE.MathUtils.lerp(0.015, 1, THREE.MathUtils.clamp(level, 0, 1));
    this.backdropMaterial.uniforms.daylight!.value = daylight;
    this.groundMaterial.emissiveIntensity = 0.08 * daylight;
  }

  /** Keep the pedestal while letting a skybox replace the surrounding gallery. */
  setSceneryVisible(visible: boolean): void {
    this.sceneryVisible = visible;
    this.ground.visible = visible;
    this.shadow.visible = visible;
    this.backdrop.visible = visible && !this.topView;
    this.inlays.visible = visible && !this.topView;
  }

  /** Keep distant scenery behind the exhibit while allowing unrestricted orbit. */
  updateView(camera: THREE.Camera, topView: boolean): void {
    if (this.disposed) return;
    this.topView = topView;
    this.setSceneryVisible(this.sceneryVisible);
    if (topView) return;
    camera.getWorldPosition(this.viewPosition);
    this.viewPosition.sub(this.center).setY(0);
    if (this.viewPosition.lengthSq() > 0.0001) this.viewDirection.copy(this.viewPosition).normalize();
    this.placeBackdrop();
  }

  private placeBackdrop(): void {
    const distance = this.studioSpan * 1.05;
    const height = this.studioSpan * 3.5;
    this.backdrop.scale.set(this.studioSpan * 7, height, 1);
    this.backdrop.position.set(this.center.x - this.viewDirection.x * distance, this.groundY + height / 2,
      this.center.z - this.viewDirection.z * distance);
    this.backdrop.rotation.y = Math.atan2(this.viewDirection.x, this.viewDirection.z);
    this.backdrop.updateMatrixWorld(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    for (const material of [this.border, this.charcoal, this.recess, this.brass, this.groundMaterial, this.shadowMaterial, this.backdropMaterial]) material.dispose();
    this.group.removeFromParent();
    this.group.clear();
    this.bounds.makeEmpty();
  }
}
