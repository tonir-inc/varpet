import type { AgentProposal, SceneDocument, StructureAdapter } from '../contracts';
import { migrateScene } from './renovation';

type Structure = Awaited<ReturnType<StructureAdapter['reconstruct']>>;

/** Real plans describe a new apartment; the local mock only exercises a structure edit. */
export function createReconstructionProposal(scene: SceneDocument, revision: number, result: Structure, live: boolean, id: string): AgentProposal {
  if (live) {
    const apartment = migrateScene({
      format: 'varpet.editor', version: 1, id, name: 'Reconstructed apartment', units: 'm', upAxis: 'Y',
      rooms: result.rooms, walls: result.walls, objects: [],
    });
    apartment.project!.currency = scene.project?.currency ?? 'AMD';
    apartment.project!.sources = structuredClone(scene.project?.sources ?? []).map(source => {
      // Keep original evidence, but old room IDs cannot describe the new footprint.
      delete source.roomId;
      return source;
    });
    return {
      id, title: 'Reconstruction review',
      description: ['Start with an empty reconstructed apartment. Applying replaces the current shell, furniture, systems, finishes and renovation options. Original source attachments are kept without room assignments. Undo restores the previous apartment.', ...result.notes].join(' '),
      command: { id, label: 'Import empty reconstructed apartment', source: 'architect', baseRevision: revision,
        operations: [{ type: 'replace-scene', scene: apartment }] },
    };
  }
  return { id, title: 'Import reconstructed structure', description: result.notes.join(' '),
    command: { id, label: 'Import structure', source: 'architect', baseRevision: revision,
      operations: [{ type: 'replace-structure', rooms: result.rooms, walls: result.walls }] } };
}
