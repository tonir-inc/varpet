import type { AgentProposal, CatalogAsset, SceneDocument, StructureAdapter } from '../contracts';
import { createApartmentStore } from './apartment-store';
import { migrateScene } from './renovation';
import { isRecord } from './validation';
import { decorateGeneratedCeilings } from './generated-ceilings';

type Structure = Awaited<ReturnType<StructureAdapter['reconstruct']>>;

/** Inspect the same validated, normalized command that Apply will commit, without editing history. */
export function previewReconstructionProposal(scene: SceneDocument, revision: number, proposal: AgentProposal, catalog: CatalogAsset[]): SceneDocument {
  if (proposal.command.baseRevision !== revision) throw new Error('This reconstruction is stale. Request a fresh proposal.');
  const preview = createApartmentStore(scene, catalog);
  const command = structuredClone(proposal.command);
  command.baseRevision = preview.revision;
  const result = preview.execute(command, true);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return preview.scene;
}

/** Real plans describe a new apartment; the local mock only exercises a structure edit. */
export function createReconstructionProposal(scene: SceneDocument, revision: number, result: Structure, live: boolean, id: string): AgentProposal {
  if (live) {
    const apartment = migrateScene({
      format: 'varpet.editor', version: 1, id, name: 'Reconstructed apartment', units: 'm', upAxis: 'Y',
      rooms: result.rooms, walls: result.walls, objects: [],
    });
    apartment.project!.metadata = {
      ...apartment.project!.metadata,
      ...Object.fromEntries(Object.entries(result.metadata ?? {}).map(([entityId, metadata]) => [entityId,
        isRecord(metadata) ? { ...apartment.project!.metadata[entityId], ...structuredClone(metadata) } : metadata])),
    };
    apartment.project!.currency = scene.project?.currency ?? 'AMD';
    apartment.project!.components = structuredClone(result.components ?? []);
    apartment.project!.sources = structuredClone(scene.project?.sources ?? []).map(source => {
      // Keep original evidence, but old room IDs cannot describe the new footprint.
      delete source.roomId;
      return source;
    });
    return {
      id, title: 'Reconstruction review',
      description: [result.components?.length ? 'Start with an unfurnished reconstructed apartment and its fixed fixtures.' : 'Start with an empty reconstructed apartment.',
        'Editable starter ceiling lighting and room switches are proposed where they fit; these are design choices to review, not reconstructed evidence.',
        'Applying replaces the current shell, furniture, systems, finishes and renovation options. Original source attachments are kept without room assignments. Undo restores the previous apartment.', ...result.notes].join(' '),
      command: { id, label: 'Import empty reconstructed apartment', source: 'architect', baseRevision: revision,
        operations: [{ type: 'replace-scene', scene: decorateGeneratedCeilings(apartment) }] },
    };
  }
  return { id, title: 'Import reconstructed structure', description: result.notes.join(' '),
    command: { id, label: 'Import structure', source: 'architect', baseRevision: revision,
      operations: [{ type: 'replace-structure', rooms: result.rooms, walls: result.walls },
        ...Object.entries(result.metadata ?? {}).filter(([, metadata]) => Object.keys(metadata).length > 0)
          .map(([entityId, metadata]) => ({ type: 'set-metadata' as const, id: entityId, patch: structuredClone(metadata) }))] } };
}
