import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ignoreRaycast: THREE.Object3D['raycast'] = () => {};

/** Presentation furniture only: never part of the apartment or its selectable entities. */
export class StudioStage {
  readonly group = new THREE.Group();
  /** Pedestal bounds for camera framing; deliberately excludes studio scenery. */
  readonly bounds = new THREE.Box3();

  private readonly border = new THREE.MeshStandardMaterial({ color: '#6e6e6e', roughness: 0.9, metalness: 0 });
  private readonly charcoal = new THREE.MeshStandardMaterial({ color: '#161b20', roughness: 0.43, metalness: 0.24 });
  private readonly recess = new THREE.MeshStandardMaterial({ color: '#090c10', roughness: 0.78 });
  private readonly brass = new THREE.MeshStandardMaterial({ color: '#a88754', roughness: 0.36, metalness: 0.72 });
  private readonly groundMaterial = new THREE.MeshStandardMaterial({
    color: '#141c26', roughness: 0.94, metalness: 0,
    emissive: '#263341', emissiveIntensity: 0.16,
  });
  private readonly groundPoolScale = { value: new THREE.Vector2(1, 1) };
  private readonly groundSpan = { value: 180 };
  private readonly cap = this.makeSlab(this.border);
  private readonly reveal = this.makeSlab(this.recess);
  private readonly body = this.makeSlab(this.charcoal);
  private readonly trim = this.makeSlab(this.brass);
  private readonly foot = this.makeSlab(this.recess);
  private readonly ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundMaterial);
  private readonly inlayMaterial = new THREE.MeshStandardMaterial({ color: '#625039', roughness: 0.52, metalness: 0.65 });
  private readonly inlays = new THREE.Group();
  private readonly backdropMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      galleryHeight: { value: 32 },
      daylight: { value: 1 },
      galleryLower: { value: new THREE.Color('#232425') },
      galleryCurtain: { value: new THREE.Color('#80796e') },
      galleryLight: { value: new THREE.Color('#aaa18f') },
    },
    vertexShader: `
      varying vec2 galleryUv;
      void main() {
        galleryUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float galleryHeight;
      uniform float daylight;
      uniform vec3 galleryLower;
      uniform vec3 galleryCurtain;
      uniform vec3 galleryLight;
      varying vec2 galleryUv;
      void main() {
        float height = galleryUv.y * galleryHeight;
        float windowRise = smoothstep(1.8, 6.8, height);
        float panelPhase = (galleryUv.x * 9.0 + 0.17) * 6.2831853;
        float panels = sqrt(max(0.0, 0.5 + 0.5 * cos(panelPhase)));
        float folds = 0.5 + 0.5 * sin(panelPhase * 2.0 + 0.45);
        float mullionDistance = sin(panelPhase * 0.5) * 8.0;
        float mullions = exp(-mullionDistance * mullionDistance);
        float glowDistance = (galleryUv.x - 0.48) * 2.5;
        float centerGlow = exp(-glowDistance * glowDistance);
        vec3 upper = mix(galleryCurtain, galleryLight, panels * 0.55 + folds * 0.05);
        upper *= 0.78 + centerGlow * 0.22;
        upper *= 1.0 - mullions * 0.30;
        vec3 lower = galleryLower * (0.65 + centerGlow * 0.35);
        vec3 color = mix(lower, upper, windowRise);
        // Broad panel edges and folds are analytic gradients, not image scenery.
        color *= 0.92 + 0.08 * smoothstep(0.0, 12.0, height);
        // Let the real floor show through at the base, avoiding a hard horizon
        // where differently lit wall and floor materials meet.
        float floorBlend = smoothstep(0.0, 3.4, height);
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
      shader.uniforms.studioGroundSpan = this.groundSpan;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vStudioFloorUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudioFloorUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 studioPoolScale;\nuniform float studioGroundSpan;\nvarying vec2 vStudioFloorUv;')
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          vec2 studioRadius = (vStudioFloorUv - 0.5) * studioPoolScale;
          float studioPool = exp(-dot(studioRadius, studioRadius));
          diffuseColor.rgb *= mix(0.62, 1.32, studioPool);
          vec2 floorPoint = (vStudioFloorUv - 0.5) * studioGroundSpan;
          vec2 slabEdge = abs(fract((floorPoint + vec2(0.7, 1.1)) / 5.7) - 0.5) * 5.7;
          float edgeDistance = min(slabEdge.x, slabEdge.y);
          float edgeWidth = max(fwidth(edgeDistance), 0.012);
          float slabJoint = 1.0 - smoothstep(0.008, 0.008 + edgeWidth, edgeDistance);
          diffuseColor.rgb *= 1.0 - slabJoint * 0.24;
        `)
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          totalEmissiveRadiance *= mix(0.4, 1.0, studioPool);
        `);
    };
    this.groundMaterial.customProgramCacheKey = () => 'studio-floor-gallery-v2';
    this.backdrop.name = 'Softly lit gallery curtains';
    this.backdrop.userData.studioAO = false;
    this.backdrop.frustumCulled = false;
    this.inlays.name = 'Subtle brass floor inlay';
    for (let i = 0; i < 4; i++) this.inlays.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.inlayMaterial));
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
    const groundY = top - 1.25;
    this.groundY = groundY;
    this.studioSpan = Math.max(width, depth);
    this.resizeSlab(this.cap, width, 0.13, depth, top - 0.065, 0.023);
    this.resizeSlab(this.reveal, width - 0.1, 0.032, depth - 0.1, top - 0.146, 0.008);
    this.resizeSlab(this.body, width - 0.12, 0.968, depth - 0.12, top - 0.646, 0.032);
    this.resizeSlab(this.trim, width - 0.105, 0.023, depth - 0.105, top - 1.086, 0.006);
    this.resizeSlab(this.foot, width - 0.38, 0.11, depth - 0.38, top - 1.185, 0.012);

    const groundSize = Math.max(180, width * 12, depth * 12);
    this.ground.scale.set(groundSize, groundSize, 1);
    this.ground.position.set(this.center.x, groundY, this.center.z);
    this.groundPoolScale.value.set(groundSize / (width * 0.95), groundSize / (depth * 0.95));
    this.groundSpan.value = groundSize;
    const inlayWidth = width + 2.8;
    const inlayDepth = depth + 2.8;
    this.inlays.children.forEach((line, index) => {
      const horizontal = index < 2;
      line.scale.set(horizontal ? inlayWidth : 0.018, 0.007, horizontal ? 0.018 : inlayDepth);
      line.position.set(this.center.x + (horizontal ? 0 : (index === 2 ? -1 : 1) * inlayWidth / 2), groundY + 0.006,
        this.center.z + (horizontal ? (index === 0 ? -1 : 1) * inlayDepth / 2 : 0));
    });
    this.placeBackdrop();
    const feather = Math.max(0.85, Math.min(width, depth) * 0.13);
    const shadowWidth = width + feather * 2;
    const shadowDepth = depth + feather * 2;
    this.shadow.scale.set(shadowWidth, shadowDepth, 1);
    this.shadow.position.set(this.center.x, groundY + 0.006, this.center.z);
    (this.shadowMaterial.uniforms.halfSize!.value as THREE.Vector2).set(width / 2 - 0.12, depth / 2 - 0.12);
    (this.shadowMaterial.uniforms.planeSize!.value as THREE.Vector2).set(shadowWidth, shadowDepth);
    this.shadowMaterial.uniforms.feather!.value = feather;

    this.bounds.min.set(this.center.x - width / 2, top - 1.24, this.center.z - depth / 2);
    this.bounds.max.set(this.center.x + width / 2, top, this.center.z + depth / 2);
    this.group.updateMatrixWorld(true);
  }

  /** The gallery backdrop and floor emission follow the same daily cycle. */
  setDaylight(level: number): void {
    const daylight = THREE.MathUtils.lerp(0.015, 1, THREE.MathUtils.clamp(level, 0, 1));
    this.backdropMaterial.uniforms.daylight!.value = daylight;
    this.groundMaterial.emissiveIntensity = 0.16 * daylight;
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
    this.backdropMaterial.uniforms.galleryHeight!.value = height;
    this.backdrop.updateMatrixWorld(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    for (const material of [this.border, this.charcoal, this.recess, this.brass, this.groundMaterial, this.shadowMaterial, this.inlayMaterial, this.backdropMaterial]) material.dispose();
    this.group.removeFromParent();
    this.group.clear();
    this.bounds.makeEmpty();
  }
}
