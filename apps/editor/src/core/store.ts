import { placeFurniture, followSupports, floorHeight, type FurnitureSurfaceResolver } from './furniture-support';
import type { CatalogAsset, CommandResult, EditCommand, SceneChange, SceneDocument, SceneObject, ValidationResult } from '../contracts';
import { isRecord, validateScene, renovationOperationError } from './validation';
import { applyRenovationOperation, applyWallTranslationBatch, invalidateAssumptions, migrateScene } from './renovation';

import { furnitureUpdates, removeSingletonGroups } from './grouping';

const HISTORY_LIMIT = 100;
type HistoryEntry = { scene: SceneDocument; label: string };
/** Optional application topology policy; the command processor also supports raw imported walls. */
export type SceneNormalizer = (scene: SceneDocument, previous?: SceneDocument) => SceneDocument;

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function commandErrors(command: unknown): string[] {
  if (!isRecord(command)) return ['Command must be an object.'];
  if (Object.keys(command).some(key => !['id', 'label', 'source', 'baseRevision', 'operations'].includes(key))) return ['Command contains unsupported fields.'];
  if (typeof command.id !== 'string' || !command.id.trim() || command.id.length > 120) return ['Command needs a valid ID.'];
  if (typeof command.label !== 'string' || !command.label.trim() || command.label.length > 160) return ['Command needs a concise label.'];
  if (typeof command.source !== 'string' || !['human', 'designer', 'architect'].includes(command.source)) return ['Command has an unknown source.'];
  if (!Number.isSafeInteger(command.baseRevision) || (command.baseRevision as number) < 0) return ['Command has an invalid base revision.'];
  if (!Array.isArray(command.operations) || command.operations.length < 1 || command.operations.length > 100) return ['A command needs 1–100 operations.'];
  for (const operation of command.operations) {
    if (!isRecord(operation)) return ['Each operation must be an object.'];
    const allowed: Record<string, string[]> = {
      group: ['type', 'id', 'objectIds'], ungroup: ['type', 'id'],
      add: ['type', 'object', 'on'], update: ['type', 'id', 'patch', 'on'], delete: ['type', 'id'],
      'replace-structure': ['type', 'rooms', 'walls'], 'replace-scene': ['type', 'scene'],
    };
    if (typeof operation.type !== 'string') return ['Command contains an unsupported operation.'];
    if (!Object.hasOwn(allowed, operation.type)) {
      const error = renovationOperationError(operation);
      if (error) return [error];
      continue;
    }
    if (Object.keys(operation).some(key => !allowed[operation.type as string]!.includes(key))) return ['Operation contains unsupported fields.'];
    if (['update', 'delete', 'group', 'ungroup'].includes(operation.type)) {
      if (typeof operation.id !== 'string' || !operation.id.trim() || operation.id.length > 100) return ['Operation needs a valid object ID.'];
    }
    if (operation.type === 'group') {
      if (!Array.isArray(operation.objectIds) || operation.objectIds.length < 2 || operation.objectIds.length > 400 || operation.objectIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 100) || new Set(operation.objectIds).size !== operation.objectIds.length) return ['Select 2–400 different furniture objects to group.'];
    }
    if (['group', 'ungroup'].includes(operation.type) && ['__proto__', 'prototype', 'constructor'].includes(operation.id as string)) return ['Group needs a non-reserved ID.'];
    if (operation.type === 'update') {
      if (!isRecord(operation.patch) || (Object.keys(operation.patch).length < 1 && operation.on === undefined)
        || Object.keys(operation.patch).some(key => !['name', 'position', 'rotation', 'scale', 'color', 'restsOn'].includes(key))) return ['Update contains an empty or unsupported object patch.'];
    }
    if (operation.on !== undefined && operation.on !== null && (typeof operation.on !== 'string' || !operation.on.trim() || operation.on.length > 100)) return ['Support on must be a furniture ID or null.'];
    if (operation.type === 'add' && !isRecord(operation.object)) return ['Add operation needs an object.'];
    if (operation.type === 'replace-scene' && !isRecord(operation.scene)) return ['Replace operation needs a scene object.'];
    if (operation.type === 'replace-structure' && (!Array.isArray(operation.rooms) || !Array.isArray(operation.walls))) return ['Structure operation needs room and wall arrays.'];
  }
  return [];
}

/** The only write boundary: every successful command commits one fully checked, frozen snapshot. */
export class EditorStore {
  private current: SceneDocument;
  private surfaceResolver?: FurnitureSurfaceResolver;
  setSurfaceResolver(resolver: FurnitureSurfaceResolver): void { this.surfaceResolver = resolver; }
  private catalog: CatalogAsset[];
  private currentRevision = 0;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private executedIds = new Set<string>();
  private listeners = new Set<(change: SceneChange) => void>();
  private publishing = false;

  constructor(scene: SceneDocument, catalog: CatalogAsset[], private normalize?: SceneNormalizer) {
    const validation = validateScene(scene, catalog);
    if (!validation.ok) throw new Error(`Cannot open scene: ${validation.errors.join(' ')}`);
    const candidate = this.normalize ? this.normalize(structuredClone(scene)) : structuredClone(scene);
    const normalizedValidation = this.normalize ? validateScene(candidate, catalog) : validation;
    if (!normalizedValidation.ok) throw new Error(`Cannot open scene: ${normalizedValidation.errors.join(' ')}`);
    this.current = freeze(candidate);
    this.catalog = freeze(structuredClone(catalog));
  }

  get scene(): SceneDocument { return this.current; }
  get revision(): number { return this.currentRevision; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  /** Keep checked search results plus every scene/history reference; browsing never consumes history. */
  registerCatalogAssets(assets: CatalogAsset[]): CatalogAsset[] {
    const referenced = new Set<string>();
    for (const scene of [this.current, ...this.past.map(entry => entry.scene), ...this.future.map(entry => entry.scene)]) {
      const snapshots = [scene, ...(scene.project?.baseline ? [scene.project.baseline] : []), ...(scene.project?.options.map(option => option.snapshot) ?? [])];
      for (const snapshot of snapshots) for (const object of snapshot.objects) referenced.add(object.assetId);
    }
    const next = new Map(this.catalog.filter(asset => referenced.has(asset.id)).map(asset => [asset.id, asset]));
    for (const asset of assets) {
      const existing = next.get(asset.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) throw new Error(`Catalog item “${asset.id}” changed. Reopen the project to use updated product data.`);
      next.set(asset.id, asset);
    }
    const candidate = [...next.values()];
    const validation = validateScene(this.current, candidate);
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    this.catalog = freeze(structuredClone(candidate));
    return structuredClone(candidate);
  }

  subscribe(listener: (change: SceneChange) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private rejection(message: string | string[]): CommandResult {
    return { ok: false, errors: typeof message === 'string' ? [message] : message, warnings: [], revision: this.revision };
  }

  private publish(label: string, source: SceneChange['source'], validation: ValidationResult): CommandResult {
    const change: SceneChange = Object.freeze({ scene: this.scene, revision: this.revision, label, source, canUndo: this.canUndo, canRedo: this.canRedo });
    this.publishing = true;
    try {
      for (const listener of [...this.listeners]) {
        try { listener(change); }
        catch (error) { console.error('Scene subscriber failed:', error); }
      }
    } finally { this.publishing = false; }
    return { ...validation, revision: this.revision };
  }

  execute(command: EditCommand, approved: boolean): CommandResult {
    if (this.publishing) return this.rejection('Wait for the current scene update before editing again.');
    if (approved !== true) return this.rejection('This change needs human approval before it can be applied.');
    const errors = commandErrors(command);
    if (errors.length) return this.rejection(errors);
    if (this.executedIds.has(command.id)) return this.rejection('This command has already been applied. Request a new proposal.');
    if (command.baseRevision !== this.revision) return this.rejection(`This change is stale: it was created at revision ${command.baseRevision}, but the scene is now revision ${this.revision}. Request it again.`);
    try {
      const operations = structuredClone(command.operations);
      let candidate = structuredClone(this.current);
      let previous: SceneDocument | undefined = this.current;
      const wallBatch = applyWallTranslationBatch(candidate, operations);
      if (wallBatch) candidate = wallBatch;
      for (const operation of wallBatch ? [] : operations) {
        switch (operation.type) {
          case 'group': {
            const ids = new Set(operation.objectIds);
            if (operation.objectIds.some(id => !candidate.objects.some(object => object.id === id))) return this.rejection('Select existing furniture to group.');
            const previousGroups = new Set(candidate.objects.filter(object => ids.has(object.id)).map(object => object.groupId).filter(Boolean));
            if (candidate.objects.some(object => !ids.has(object.id) && object.groupId && (previousGroups.has(object.groupId) || object.groupId === operation.id))) return this.rejection('Select every member of an existing group before regrouping it.');
            candidate = migrateScene(candidate);
            for (const object of candidate.objects) if (ids.has(object.id)) object.groupId = operation.id;
            break;
          }
          case 'ungroup': {
            const members = candidate.objects.filter(object => object.groupId === operation.id);
            if (!members.length) return this.rejection('This furniture group no longer exists.');
            for (const object of members) delete object.groupId;
            break;
          }
          case 'add': {
            if (candidate.objects.some(object => object.id === operation.object.id)) return this.rejection(`Object “${operation.object.id}” already exists.`);
            const position = operation.object.position ?? (operation.on ? candidate.objects.find(o => o.id === operation.on)?.position : undefined);
            if (!position) return this.rejection('Add needs a position or an existing furniture support on.');
            const object: SceneObject = { ...operation.object, position: [...position] };
            candidate.objects.push(placeFurniture(candidate, this.catalog, object, operation.on !== undefined ? operation.on : object.restsOn, this.surfaceResolver, operation.object.position && object.position[1] > floorHeight(candidate, object) ? object.position[1] + .02 : undefined));
            break;
          }
          case 'update': {
            const index = candidate.objects.findIndex(object => object.id === operation.id);
            if (index < 0) return this.rejection(`Object “${operation.id}” no longer exists.`);
            const before = structuredClone(candidate);
            let patch = operation.patch;
            if (operation.on && !patch.position) {
              const support = candidate.objects.find(o => o.id === operation.on);
              if (!support) return this.rejection(`Unknown furniture support “${operation.on}”.`);
              patch = { ...patch, position: [...support.position] };
            }
            const updates = furnitureUpdates(candidate, operation.id, patch);
            const transforming = patch.position || patch.rotation !== undefined || patch.scale
              || operation.on !== undefined || patch.restsOn !== undefined;
            const byId = new Map(updates.map(object => {
              if (!transforming) return [object.id, object] as const;
              const on = operation.on !== undefined ? operation.on : patch.restsOn ?? (!patch.position ? object.restsOn : undefined);
              const useHeight = operation.patch.position || (operation.on === undefined && object.restsOn);
              const ceiling = useHeight && object.position[1] > floorHeight(candidate, object) ? object.position[1] + .02 : undefined;
              return [object.id, placeFurniture(candidate, this.catalog, object, on, this.surfaceResolver, ceiling)] as const;
            }));
            candidate.objects = candidate.objects.map(object => byId.get(object.id) ?? object);
            followSupports(before, candidate, new Set(updates.map(o => o.id)), this.catalog);
            invalidateAssumptions(candidate, updates.map(object => object.id));
            break;
          }
          case 'delete': {
            const index = candidate.objects.findIndex(object => object.id === operation.id);
            if (index < 0) return this.rejection(`Object “${operation.id}” no longer exists.`);
            const before = structuredClone(candidate);
            candidate.objects.splice(index, 1);
            followSupports(before, candidate, new Set(), this.catalog);
            removeSingletonGroups(candidate);
            if (candidate.project) delete candidate.project.metadata[operation.id];
            break;
          }
          case 'replace-structure':
            invalidateAssumptions(candidate, [...candidate.rooms, ...candidate.walls, ...candidate.walls.flatMap(w => w.openings)].map(entity => entity.id));
            candidate.rooms = operation.rooms;
            candidate.walls = operation.walls;
            previous = undefined;
            break;
          case 'replace-scene': {
            // Validate before later operations can access an imported document's fields.
            const imported = validateScene(operation.scene, this.catalog);
            if (!imported.ok) return this.rejection(imported.errors);
            candidate = operation.scene;
            previous = undefined;
            break;
          }
          default:
            candidate = applyRenovationOperation(candidate, operation);
            if (operation.type === 'switch-option' || operation.type === 'restore-baseline') previous = undefined;
        }
      }
      // Validate the complete raw edit before topology can partition openings or
      // remap dependants, then validate again before the single atomic commit.
      if (this.normalize) {
        const draftValidation = validateScene(candidate, this.catalog);
        if (!draftValidation.ok) return { ...draftValidation, revision: this.revision };
        candidate = this.normalize(candidate, previous);
      }
      const validation = validateScene(candidate, this.catalog);
      if (!validation.ok) return { ...validation, revision: this.revision };
      this.past.push({ scene: this.current, label: command.label });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
      this.current = freeze(candidate);
      this.currentRevision++;
      this.executedIds.add(command.id);
      return this.publish(command.label, command.source, validation);
    } catch (error) {
      return this.rejection(`The change could not be read safely. ${error instanceof Error ? error.message : 'Use plain JSON values.'}`);
    }
  }

  undo(): CommandResult {
    if (this.publishing) return this.rejection('Wait for the current scene update before editing again.');
    const entry = this.past.at(-1);
    if (!entry) return this.rejection('There is nothing to undo.');
    const validation = validateScene(entry.scene, this.catalog);
    if (!validation.ok) return { ...validation, revision: this.revision };
    this.past.pop();
    this.future.push({ scene: this.current, label: entry.label });
    this.current = entry.scene;
    this.currentRevision++;
    return this.publish(`Undo: ${entry.label}`, 'history', validation);
  }

  redo(): CommandResult {
    if (this.publishing) return this.rejection('Wait for the current scene update before editing again.');
    const entry = this.future.at(-1);
    if (!entry) return this.rejection('There is nothing to redo.');
    const validation = validateScene(entry.scene, this.catalog);
    if (!validation.ok) return { ...validation, revision: this.revision };
    this.future.pop();
    this.past.push({ scene: this.current, label: entry.label });
    this.current = entry.scene;
    this.currentRevision++;
    return this.publish(`Redo: ${entry.label}`, 'history', validation);
  }
}
