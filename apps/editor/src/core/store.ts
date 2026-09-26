import type { CatalogAsset, CommandResult, EditCommand, SceneChange, SceneDocument, ValidationResult } from '../contracts';
import { isRecord, validateScene } from './validation';

const HISTORY_LIMIT = 100;
type HistoryEntry = { scene: SceneDocument; label: string };

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
      add: ['type', 'object'], update: ['type', 'id', 'patch'], delete: ['type', 'id'],
      'replace-structure': ['type', 'rooms', 'walls'], 'replace-scene': ['type', 'scene'],
    };
    if (typeof operation.type !== 'string' || !Object.hasOwn(allowed, operation.type)) return ['Command contains an unsupported operation.'];
    if (Object.keys(operation).some(key => !allowed[operation.type as string]!.includes(key))) return ['Operation contains unsupported fields.'];
    if (operation.type === 'update' || operation.type === 'delete') {
      if (typeof operation.id !== 'string' || !operation.id.trim() || operation.id.length > 100) return ['Operation needs a valid object ID.'];
    }
    if (operation.type === 'update') {
      if (!isRecord(operation.patch) || Object.keys(operation.patch).length < 1
        || Object.keys(operation.patch).some(key => !['name', 'position', 'rotation', 'scale', 'color'].includes(key))) return ['Update contains an empty or unsupported object patch.'];
    }
    if (operation.type === 'add' && !isRecord(operation.object)) return ['Add operation needs an object.'];
    if (operation.type === 'replace-scene' && !isRecord(operation.scene)) return ['Replace operation needs a scene object.'];
    if (operation.type === 'replace-structure' && (!Array.isArray(operation.rooms) || !Array.isArray(operation.walls))) return ['Structure operation needs room and wall arrays.'];
  }
  return [];
}

/** The only write boundary: every successful command commits one fully checked, frozen snapshot. */
export class EditorStore {
  private current: SceneDocument;
  private catalog: CatalogAsset[];
  private currentRevision = 0;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private executedIds = new Set<string>();
  private listeners = new Set<(change: SceneChange) => void>();
  private publishing = false;

  constructor(scene: SceneDocument, catalog: CatalogAsset[]) {
    const validation = validateScene(scene, catalog);
    if (!validation.ok) throw new Error(`Cannot open scene: ${validation.errors.join(' ')}`);
    this.current = freeze(structuredClone(scene));
    this.catalog = freeze(structuredClone(catalog));
  }

  get scene(): SceneDocument { return this.current; }
  get revision(): number { return this.currentRevision; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

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
      for (const operation of operations) {
        switch (operation.type) {
          case 'add':
            if (candidate.objects.some(object => object.id === operation.object.id)) return this.rejection(`Object “${operation.object.id}” already exists.`);
            candidate.objects.push(operation.object);
            break;
          case 'update': {
            const index = candidate.objects.findIndex(object => object.id === operation.id);
            if (index < 0) return this.rejection(`Object “${operation.id}” no longer exists.`);
            candidate.objects[index] = { ...candidate.objects[index]!, ...operation.patch };
            break;
          }
          case 'delete': {
            const index = candidate.objects.findIndex(object => object.id === operation.id);
            if (index < 0) return this.rejection(`Object “${operation.id}” no longer exists.`);
            candidate.objects.splice(index, 1);
            break;
          }
          case 'replace-structure':
            candidate.rooms = operation.rooms;
            candidate.walls = operation.walls;
            break;
          case 'replace-scene': {
            // Validate before later operations can access an imported document's fields.
            const imported = validateScene(operation.scene, this.catalog);
            if (!imported.ok) return this.rejection(imported.errors);
            candidate = operation.scene;
            break;
          }
        }
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
