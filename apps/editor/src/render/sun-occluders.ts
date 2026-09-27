import { openingMechanism } from '../core/opening-catalog';
import * as THREE from 'three';
import type { EntityMetadata, Opening, Room, SceneDocument, Wall } from '../contracts';
import { roomCeilingHeight } from '../core/heights';
import { wallFootprint, wallPrismGeometry } from './wall-geometry';
import { makeCeilingGeometry } from './ceiling-geometry';

/** The physical shell stays intact in shadow maps while its editor projection
 * cuts walls and roofs away. This projection owns only cheap, untextured geometry;
 * it is excluded from picking, color, depth and the studio AO pass. */
export class SunOccluders {
  readonly group = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly wallMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
  private readonly roofMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0, shadowSide: THREE.FrontSide });
  private readonly shellGeometries = new Set<THREE.BufferGeometry>();
  private readonly angles = new Map<string, number>();
  private readonly openingPreviews = new Map<string, Opening>();
  private readonly setAngles = new Map<string, (angle: number) => void>();
  private readonly wallGroups = new Map<string, THREE.Group>();
  private scene: SceneDocument | null = null;
  private roofs = true;

  constructor() { this.group.name = 'Sun shadow shell'; this.group.userData.studioAO = false; }

  setScene(scene: SceneDocument): void {
    this.clear(); this.scene = scene; this.openingPreviews.clear();
    const openingIds = new Set(scene.walls.flatMap(wall => wall.openings.map(opening => opening.id)));
    for (const id of this.angles.keys()) if (!openingIds.has(id)) this.angles.delete(id);
    const metadata = scene.project?.metadata ?? {};
    for (const wall of scene.walls) if (metadata[wall.id]?.phase !== 'remove') this.addWall(wall);
    for (const room of scene.rooms) {
      const meta = metadata[room.id] ?? {};
      if (room.polygon.length < 3 || meta.phase === 'remove' || ['balcony', 'terrace'].includes(meta.zone ?? 'interior')) continue;
      this.addRoof(room, meta, roomCeilingHeight(scene, room));
    }
    this.group.updateMatrixWorld(true);
  }

  setDoorAngle(id: string, angle: number): void {
    if (!Number.isFinite(angle)) return;
    this.angles.set(id, THREE.MathUtils.clamp(angle, 0, Math.PI / 2));
    this.setAngles.get(id)?.(this.angles.get(id)!);
  }

  previewOpeningOffset(id: string, offset: number): void { this.previewOpening(id, { offset }); }

  previewOpening(id: string, dimensions: Partial<Pick<Opening, 'offset' | 'sill' | 'width' | 'height'>>): void {
    if (!this.scene) return;
    const wall = this.scene.walls.find(wall => wall.openings.some(opening => opening.id === id));
    if (!wall || !this.wallGroups.has(wall.id)) return;
    const current = this.openingPreviews.get(id) ?? wall.openings.find(opening => opening.id === id)!;
    const next = { ...current };
    for (const key of ['offset', 'sill', 'width', 'height'] as const) {
      const value = dimensions[key];
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value < 0 || (key === 'width' || key === 'height') && value === 0) return;
      next[key] = value;
    }
    if (next.offset === current.offset && next.sill === current.sill && next.width === current.width && next.height === current.height) return;
    this.openingPreviews.set(id, next);
    const previous = this.wallGroups.get(wall.id)!;
    previous.traverse(object => {
      if (object instanceof THREE.Mesh && this.shellGeometries.delete(object.geometry)) object.geometry.dispose();
    });
    previous.removeFromParent();
    for (const opening of wall.openings) this.setAngles.delete(opening.id);
    this.addWall(wall); this.group.updateMatrixWorld(true);
  }

  private mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.raycast = () => {};
    parent.add(mesh); return mesh;
  }

  private block(parent: THREE.Group, dimensions: [number, number, number], position: [number, number, number]): void {
    if (dimensions.some(value => value <= .0001)) return;
    const mesh = this.mesh(parent, this.box, this.wallMaterial);
    mesh.scale.set(...dimensions); mesh.position.set(...position);
  }

  private addRoof(room: Room, metadata: EntityMetadata, height: number): void {
    const geometry = makeCeilingGeometry(this.scene!, room, true); this.shellGeometries.add(geometry);
    const mesh = this.mesh(this.group, geometry, this.roofMaterial);
    mesh.position.y = (metadata.elevation ?? 0) + height;
    mesh.visible = this.roofs; mesh.userData.sunRoof = true;
  }

  /** The dollhouse has no roof: outside views let the sun onto floors and furniture; Inside keeps it. */
  setRoofs(visible: boolean): boolean {
    if (this.roofs === visible) return false;
    this.roofs = visible;
    for (const child of this.group.children) if (child.userData.sunRoof) child.visible = visible;
    return true;
  }

  private addWall(wall: Wall): void {
    const metadata = this.scene!.project?.metadata ?? {};
    const elevation = metadata[wall.id]?.elevation ?? 0;
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if (length < .001) return;
    const group = new THREE.Group();
    group.position.set(wall.start[0], elevation, wall.start[1]);
    group.rotation.y = -Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
    this.group.add(group); this.wallGroups.set(wall.id, group);
    const openings = wall.openings.map(opening => this.openingPreviews.get(opening.id) ?? opening).sort((a, b) => a.offset - b.offset);
    const footprint = wallFootprint(wall, this.scene!.walls, metadata);
    const span = (left: number, right: number, bottom: number, top: number) => {
      if (right - left <= .0001 || top - bottom <= .0001) return;
      const geometry = wallPrismGeometry(footprint, bottom, top,
        left <= 1e-6 ? -Infinity : left, right >= length - 1e-6 ? Infinity : right);
      this.shellGeometries.add(geometry); this.mesh(group, geometry, this.wallMaterial);
    };
    let cursor = 0;
    for (const opening of openings) {
      const left = Math.max(0, opening.offset), right = Math.min(length, opening.offset + opening.width);
      span(cursor, left, 0, wall.height);
      span(left, right, 0, Math.min(opening.sill, wall.height));
      span(left, right, opening.sill + opening.height, wall.height);
      cursor = Math.max(cursor, right);
      // Removing an installed window/door leaves its architectural opening.
      if (metadata[opening.id]?.phase !== 'remove') this.addOpening(group, wall, opening, metadata[opening.id] ?? {});
    }
    span(cursor, length, 0, wall.height);
  }

  private addOpening(wallGroup: THREE.Group, wall: Wall, opening: Opening, metadata: EntityMetadata): void {
    const group = new THREE.Group(); group.position.set(opening.offset, opening.sill, 0); wallGroup.add(group);
    const frame = Math.min(metadata.frameWidth ?? .045, opening.width / 5, opening.height / 5);
    const width = Math.max(.01, opening.width - frame * 2);
    const bottom = opening.kind === 'window' ? frame : Math.min(metadata.threshold ?? 0, opening.height / 4);
    const height = Math.max(.01, opening.height - frame - bottom);
    const thickness = metadata.leafThickness ?? .035;
    const mechanism = opening.assetId ? openingMechanism(opening, metadata) : metadata.mechanism ?? (opening.kind === 'door' ? 'hinged' : 'casement');
    const swing = metadata.swing ?? 1;
    this.block(group, [frame, opening.height, wall.thickness + .02], [frame / 2, opening.height / 2, 0]);
    this.block(group, [frame, opening.height, wall.thickness + .02], [opening.width - frame / 2, opening.height / 2, 0]);
    this.block(group, [opening.width, frame, wall.thickness + .02], [opening.width / 2, opening.height - frame / 2, 0]);
    if (opening.kind === 'window' || metadata.threshold) this.block(group, [opening.width, Math.max(frame, metadata.threshold ?? frame), wall.thickness + .08], [opening.width / 2, frame / 2, 0]);
    const count = mechanism === 'double' ? 2 : 1;
    const pivots: { pivot: THREE.Group; right: boolean }[] = [];
    for (let index = 0; index < count; index++) {
      const right = count === 2 ? index === 1 : metadata.hinge === 'right';
      const sign = right ? -1 : 1, leafWidth = width / count;
      const pivot = new THREE.Group(); group.add(pivot); pivots.push({ pivot, right });
      if (opening.kind === 'door') {
        this.block(pivot, [leafWidth, height, thickness], [sign * leafWidth / 2, height / 2, 0]);
        this.block(pivot, [.13, .025, .08], [sign * (leafWidth - .1), Math.min(1, height * .5), thickness / 2 + .03]);
      } else {
        // Transparent glass is absent from the shadow pass; its solid mullions remain.
        this.block(pivot, [.025, height, thickness + .01], [sign * leafWidth * .5, height / 2, 0]);
        this.block(pivot, [leafWidth, .025, thickness + .01], [sign * leafWidth / 2, height * .5, 0]);
      }
    }
    const setAngle = (value: number) => {
      const angle = mechanism === 'fixed' ? 0 : value;
      for (const { pivot, right } of pivots) {
        const sign = right ? -1 : 1;
        pivot.position.set(right ? opening.width - frame : frame, bottom, 0); pivot.rotation.set(0, 0, 0);
        if (mechanism === 'sliding' || mechanism === 'pocket') { pivot.position.x += sign * width * angle / (Math.PI / 2); pivot.position.z = wall.thickness / 2 + thickness; }
        else if (mechanism === 'tilt') pivot.rotation.x = angle * .33 * swing;
        else pivot.rotation.y = -angle * sign * swing;
      }
      group.updateMatrixWorld(true);
    };
    this.setAngles.set(opening.id, setAngle); setAngle(this.angles.get(opening.id) ?? 0);
  }

  private clear(): void {
    for (const geometry of this.shellGeometries) geometry.dispose();
    this.shellGeometries.clear(); this.group.clear(); this.wallGroups.clear(); this.setAngles.clear();
  }

  dispose(): void {
    this.clear(); this.box.dispose(); this.wallMaterial.dispose(); this.roofMaterial.dispose();
    this.angles.clear(); this.openingPreviews.clear(); this.scene = null; this.group.removeFromParent();
  }
}
