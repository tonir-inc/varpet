import type { RenovationOperation, RenovationProject } from './renovation-contracts';
export type * from './renovation-contracts';
/** Editor-local v1 boundary. Deliberately does not define the future shared engine schema. */
export type Vec2 = [number, number]; // x, z in metres
export type Vec3 = [number, number, number]; // x, y, z in metres
export type AssetKind = 'sofa' | 'chair' | 'table' | 'bed' | 'cabinet' | 'lamp' | 'plant' | 'rug' | 'shelf';
export interface CatalogAsset {
  id: string;
  name: string;
  category: string;
  kind: AssetKind;
  dimensions: Vec3;
  color: string;
  price: number;
  source: { type: 'procedural' } | { type: 'gltf'; url: string };
}
export interface Room { id: string; name: string; polygon: Vec2[]; color: string }
/** Offset measures metres from wall.start to the near edge, toward wall.end. Doors have sill=0. */
export interface Opening { id: string; kind: 'door' | 'window'; offset: number; width: number; height: number; sill: number }
export interface Wall { id: string; start: Vec2; end: Vec2; height: number; thickness: number; color: string; openings: Opening[] }
export interface SceneObject {
  id: string;
  name: string;
  assetId: string;
  position: Vec3; // floor-centred origin, base at y=0
  rotation: number; // radians about +Y
  scale: Vec3;
  color?: string;
}
export interface SceneDocument {
  format: 'varpet.editor';
  version: 1 | 2;
  project?: RenovationProject;
  id: string;
  name: string;
  units: 'm';
  upAxis: 'Y';
  rooms: Room[];
  walls: Wall[];
  objects: SceneObject[];
}
export type ObjectPatch = Partial<Pick<SceneObject, 'name' | 'position' | 'rotation' | 'scale' | 'color'>>;
export type Operation =
  | { type: 'add'; object: SceneObject }
  | { type: 'update'; id: string; patch: ObjectPatch }
  | { type: 'delete'; id: string }
  | { type: 'replace-structure'; rooms: Room[]; walls: Wall[] }
  | { type: 'replace-scene'; scene: SceneDocument }
  | RenovationOperation;
export type CommandSource = 'human' | 'designer' | 'architect';
export interface EditCommand { id: string; label: string; source: CommandSource; baseRevision: number; operations: Operation[] }
export interface CommandResult { ok: boolean; errors: string[]; warnings: string[]; revision: number }
export interface SceneChange { scene: SceneDocument; revision: number; label: string; source: CommandSource | 'history'; canUndo: boolean; canRedo: boolean }
export interface ValidationResult { ok: boolean; errors: string[]; warnings: string[] }
export interface AgentProposal { id: string; title: string; description: string; command: EditCommand }
export interface StructureAdapter { reconstruct(signal?: AbortSignal): Promise<{ rooms: Room[]; walls: Wall[]; notes: string[] }> }
export interface CatalogAdapter { list(signal?: AbortSignal): Promise<CatalogAsset[]> }
export interface DesignerAdapter { propose(scene: SceneDocument, revision: number, signal?: AbortSignal): Promise<AgentProposal> }
export type ToolMode = 'select' | 'move' | 'rotate' | 'scale';
export type ViewMode = 'perspective' | 'top';
export type WallMode = 'cutaway' | 'full' | 'hidden';
export type QualityMode = 'balanced' | 'high';
export type ViewportLayer = 'shell' | 'furniture' | 'services' | 'assumptions' | 'ceilings' | 'dimensions' | 'components' | 'clearances' | 'electrical' | 'water-hot' | 'water-cold' | 'waste' | 'ventilation' | 'heating' | 'gas' | 'data';
export type ComponentTransformPatch = Partial<Pick<import('./renovation-contracts').BuildingComponent, 'position' | 'rotation' | 'dimensions' | 'host'>>;
export interface ViewportCallbacks {
  onComponentTransform?(id: string, patch: ComponentTransformPatch): void;
  onWallEndpoint?(id: string, endpoint: 'start' | 'end', point: Vec2): void;
  onWallMove?(id: string, start: Vec2, end: Vec2): void;
  onOpeningMove?(id: string, offset: number): void;
  onSelect(id: string | null): void;
  onTransform(id: string, patch: ObjectPatch): void;
  onInteraction(active: boolean): void;
  onError(message: string): void;
}
export interface Viewport {
  setScene(scene: SceneDocument, catalog: CatalogAsset[]): void;
  animatePlacement(id: string): void;
  setSelection(id: string | null): void;
  setTool(tool: ToolMode): void;
  setView(view: ViewMode): void;
  setSnap(enabled: boolean): void;
  setWalls(mode: WallMode): void;
  setQuality(mode: QualityMode): void;
  setLayer(layer: ViewportLayer, visible: boolean): void;
  setDoorAngle(id: string, angle: number): void;
  getDoorAngle(id: string): number;
  toggleSwitch(id: string): void;
  setSwitchLevel(id: string, level: number): void;
  getSwitchLevel(id: string): number;
  setComparison(enabled: boolean): void;
  focus(id?: string): void;
  cancelInteraction(): void;
  dispose(): void;
}
