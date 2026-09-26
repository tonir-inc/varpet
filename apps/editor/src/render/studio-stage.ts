import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ignoreRaycast: THREE.Object3D['raycast'] = () => {};

/** Presentation furniture only: never part of the apartment or its selectable entities. */
export class StudioStage {
  readonly group = new THREE.Group();
  /** Pedestal bounds for camera framing; deliberately excludes the studio floor. */
  readonly bounds = new THREE.Box3();

  private readonly limestone = new THREE.MeshStandardMaterial({ color: '#d9cbb7', roughness: 0.71, metalness: 0.04 });
  private readonly charcoal = new THREE.MeshStandardMaterial({ color: '#161b20', roughness: 0.43, metalness: 0.24 });
  private readonly recess = new THREE.MeshStandardMaterial({ color: '#090c10', roughness: 0.78 });
  private readonly brass = new THREE.MeshStandardMaterial({ color: '#a88754', roughness: 0.36, metalness: 0.72 });
  private readonly groundMaterial = new THREE.MeshStandardMaterial({ color: '#272d34', roughness: 0.87, metalness: 0.1 });
  private readonly cap = this.makeSlab(this.limestone);
  private readonly reveal = this.makeSlab(this.recess);
  private readonly body = this.makeSlab(this.charcoal);
  private readonly trim = this.makeSlab(this.brass);
  private readonly foot = this.makeSlab(this.recess);
  private readonly ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundMaterial);
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
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.24 * soft + 0.16 * contact);
      }
    `,
  });
  private readonly shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMaterial);
  private readonly previousBounds = new THREE.Box3();
  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private disposed = false;

  constructor() {
    this.group.name = 'Apartment presentation stage';
    this.group.visible = false;
    this.ground.name = 'Charcoal studio floor';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.shadow.name = 'Soft pedestal contact shadow';
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.ground, this.shadow, this.foot, this.body, this.trim, this.reveal, this.cap);
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

    const width = Math.max(1, this.size.x) + 0.7;
    const depth = Math.max(1, this.size.z) + 0.7;
    // The scene's extruded floor slab extends 14 cm below its room elevation.
    const top = modelBounds.min.y - 0.14;
    const groundY = top - 0.805;
    this.resizeSlab(this.cap, width, 0.12, depth, top - 0.06, 0.025);
    this.resizeSlab(this.reveal, width - 0.1, 0.035, depth - 0.1, top - 0.1375, 0.009);
    this.resizeSlab(this.body, width - 0.12, 0.53, depth - 0.12, top - 0.42, 0.028);
    this.resizeSlab(this.trim, width - 0.105, 0.018, depth - 0.105, top - 0.642, 0.005);
    this.resizeSlab(this.foot, width - 0.38, 0.11, depth - 0.38, top - 0.74, 0.012);

    const groundSize = Math.max(180, width * 12, depth * 12);
    this.ground.scale.set(groundSize, groundSize, 1);
    this.ground.position.set(this.center.x, groundY, this.center.z);
    const feather = Math.max(0.85, Math.min(width, depth) * 0.13);
    const shadowWidth = width + feather * 2;
    const shadowDepth = depth + feather * 2;
    this.shadow.scale.set(shadowWidth, shadowDepth, 1);
    this.shadow.position.set(this.center.x, groundY + 0.006, this.center.z);
    (this.shadowMaterial.uniforms.halfSize!.value as THREE.Vector2).set(width / 2 - 0.12, depth / 2 - 0.12);
    (this.shadowMaterial.uniforms.planeSize!.value as THREE.Vector2).set(shadowWidth, shadowDepth);
    this.shadowMaterial.uniforms.feather!.value = feather;

    this.bounds.min.set(this.center.x - width / 2, top - 0.795, this.center.z - depth / 2);
    this.bounds.max.set(this.center.x + width / 2, top, this.center.z + depth / 2);
    this.group.updateMatrixWorld(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of [this.cap, this.reveal, this.body, this.trim, this.foot, this.ground, this.shadow]) mesh.geometry.dispose();
    for (const material of [this.limestone, this.charcoal, this.recess, this.brass, this.groundMaterial, this.shadowMaterial]) material.dispose();
    this.group.removeFromParent();
    this.group.clear();
    this.bounds.makeEmpty();
  }
}
