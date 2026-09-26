import type { Room, Wall, Opening, SceneObject, Vec2, Vec3 } from './contracts';

export type RenovationPhase = 'existing' | 'retain' | 'remove' | 'new' | 'replace';
export type StructuralRole = 'structural' | 'partition' | 'unknown';
export type CeilingStyle = 'quiet' | 'soft-glow' | 'architectural';
/** Room-owned conceptual ceiling treatment. Distances are metres; brightness is visual percent. */
export interface CeilingDesign {
  style: CeilingStyle;
  drop: number;
  inset: number;
  brightness: number;
  temperature: number;
  enabled: boolean;
}
export interface EntityMetadata {
  name?: string;
  structuralRole?: StructuralRole;
  boundary?: 'interior' | 'exterior' | 'shared';
  phase?: RenovationPhase;
  locked?: boolean;
  review?: 'unreviewed' | 'required' | 'reviewed';
  material?: string;
  zone?: 'interior' | 'balcony' | 'loggia' | 'terrace';
  elevation?: number;
  ceilingHeight?: number;
  ceilingDesign?: CeilingDesign | null;
  role?: 'entrance' | 'interior' | 'balcony' | 'access';
  mechanism?: 'hinged' | 'sliding' | 'pocket' | 'fixed' | 'casement' | 'tilt' | 'double';
  hinge?: 'left' | 'right';
  swing?: 1 | -1;
  leafThickness?: number;
  frameWidth?: number;
  threshold?: number;
  notes?: string;
}
export type ComponentKind = 'column' | 'beam' | 'shaft' | 'railing' | 'step' | 'ceiling' | 'light' | 'switch' | 'outlet' | 'panel' | 'junction' | 'sink' | 'toilet' | 'shower' | 'bath' | 'drain' | 'valve' | 'riser' | 'radiator' | 'ac' | 'vent' | 'thermostat' | 'cabinet' | 'worktop' | 'appliance' | 'smoke-detector' | 'security' | 'network' | 'gas-point' | 'access-panel';
export interface ComponentHost { wallId: string; offset: number; elevation: number; side: 1 | -1 }
export interface BuildingComponent {
  id: string;
  name: string;
  kind: ComponentKind;
  position: Vec3;
  dimensions: Vec3;
  rotation: number;
  color: string;
  phase: RenovationPhase;
  host?: ComponentHost;
  roomId?: string;
  price?: number;
  notes?: string;
  light?: { brightness: number; temperature: number; enabled: boolean; group?: string };
  /** Targets identify light components or rooms' ceiling lights. Plain/outdoor/removed ceilings are inert. */
  control?: { type: 'single' | 'two-way' | 'dimmer' | 'multi-gang'; targets: string[]; gangs: number };
  clearance?: Vec3;
  /** Catalog asset drawn in place of the procedural shape, fitted to `dimensions`. Unknown ids fall back to the procedural shape. */
  assetId?: string;
}
export type ServiceSystem = 'electrical' | 'water-hot' | 'water-cold' | 'waste' | 'ventilation' | 'heating' | 'gas' | 'data';
export interface ServiceRoute {
  id: string; name: string; system: ServiceSystem; points: Vec3[]; diameter: number;
  phase: RenovationPhase; from?: string; to?: string; circuit?: string; pricePerMetre?: number; notes?: string;
}
export type SourceKind = 'photo' | 'plan' | 'measurement' | 'document';
export interface EvidenceSource {
  id: string; name: string; kind: SourceKind; notes?: string; roomId?: string;
  dataUrl?: string; url?: string;
  calibration?: { metres: number; pixels: number; origin: Vec2; rotation: number };
}
export interface PropertyAssumption {
  id: string; entityId: string; property: string; value: string;
  status: 'unresolved' | 'accepted' | 'measured' | 'verified' | 'stale';
  sourceKind: 'unknown' | 'inferred' | 'measured' | 'observed' | 'design';
  sourceIds: string[]; rationale: string; alternatives: string[]; question?: string;
  dependsOn?: string[];
  sourceRegion?: { sourceId: string; x: number; y: number; width: number; height: number };
}
export interface FinishMaterial { id: string; name: string; color: string; unit: 'm2' | 'm' | 'each'; unitCost: number; thickness: number; wastePercent: number; notes?: string }
export interface FinishAssignment { id: string; entityId: string; surface: 'floor' | 'ceiling' | 'wall-front' | 'wall-back' | 'skirting' | 'component'; materialId: string }
export interface ProjectTask { id: string; title: string; trade: string; status: 'todo' | 'doing' | 'done'; entityIds: string[]; dependsOn: string[]; allowance: number; notes?: string }
export interface RenovationSnapshot {
  rooms: Room[]; walls: Wall[]; objects: SceneObject[];
  metadata: Record<string, EntityMetadata>; components: BuildingComponent[]; routes: ServiceRoute[]; finishes: FinishAssignment[];
}
export interface DesignOption { id: string; name: string; snapshot: RenovationSnapshot }
export interface RenovationProject {
  mode: 'correct' | 'renovate';
  currency: string;
  metadata: Record<string, EntityMetadata>;
  components: BuildingComponent[];
  routes: ServiceRoute[];
  sources: EvidenceSource[];
  assumptions: PropertyAssumption[];
  materials: FinishMaterial[];
  finishes: FinishAssignment[];
  tasks: ProjectTask[];
  baseline?: RenovationSnapshot;
  options: DesignOption[];
  activeOptionId?: string;
}
export type RenovationOperation =
  | { type: 'migrate-project' }
  | { type: 'update-wall'; id: string; patch: Partial<Pick<Wall, 'start' | 'end' | 'height' | 'thickness' | 'color'>> }
  | { type: 'add-wall'; wall: Wall }
  | { type: 'delete-wall'; id: string }
  | { type: 'split-wall'; id: string; offset: number; newId: string }
  | { type: 'join-walls'; id: string; otherId: string }
  | { type: 'add-opening'; wallId: string; opening: Opening }
  | { type: 'update-opening'; id: string; patch: Partial<Omit<Opening, 'id'>> }
  | { type: 'delete-opening'; id: string }
  | { type: 'add-room'; room: Room }
  | { type: 'update-room'; id: string; patch: Partial<Omit<Room, 'id'>> }
  | { type: 'delete-room'; id: string }
  | { type: 'set-metadata'; id: string; patch: EntityMetadata }
  | { type: 'upsert-component'; component: BuildingComponent }
  | { type: 'delete-component'; id: string }
  | { type: 'upsert-route'; route: ServiceRoute }
  | { type: 'delete-route'; id: string }
  | { type: 'upsert-source'; source: EvidenceSource }
  | { type: 'delete-source'; id: string }
  | { type: 'upsert-assumption'; assumption: PropertyAssumption }
  | { type: 'delete-assumption'; id: string }
  | { type: 'upsert-material'; material: FinishMaterial }
  | { type: 'delete-material'; id: string }
  | { type: 'upsert-finish'; finish: FinishAssignment }
  | { type: 'delete-finish'; id: string }
  | { type: 'upsert-task'; task: ProjectTask }
  | { type: 'delete-task'; id: string }
  | { type: 'set-project'; patch: Partial<Pick<RenovationProject, 'mode' | 'currency'>> }
  | { type: 'capture-baseline' }
  | { type: 'restore-baseline' }
  | { type: 'create-option'; id: string; name: string }
  | { type: 'switch-option'; id: string }
  | { type: 'delete-option'; id: string };
export interface ProjectIssue { id: string; severity: 'warning' | 'info'; entityId?: string; title: string; detail: string }
export interface QuantityLine { id: string; name: string; quantity: number; unit: string; cost: number }
export interface ProjectAnalysis { issues: ProjectIssue[]; quantities: QuantityLine[]; totalCost: number; floorArea: number; wallArea: number; routeLength: number; changes: { added: number; removed: number; changed: number } }
