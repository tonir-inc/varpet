import type { AgentProposal, CatalogAsset, CatalogAdapter, DesignerAdapter, SceneDocument, StructureAdapter } from '../contracts';
import { demoScene, localCatalog } from '../core/demo';
import { validateScene } from '../core/validation';

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Request cancelled.', 'AbortError')); return; }
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Request cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

let proposalSequence = 0;

export const catalogAdapter: CatalogAdapter = {
  async list(signal) {
    await delay(180, signal);
    return structuredClone(localCatalog);
  },
};

export const structureAdapter: StructureAdapter = {
  async reconstruct(signal) {
    await delay(1250, signal);
    const { rooms, walls } = structuredClone(demoScene);
    rooms[0]!.name = 'Open living & dining';
    rooms[0]!.color = '#dbcfbc';
    return {
      rooms, walls,
      notes: [
        'Local mock reconstruction: the 10 × 8 m apartment footprint and door positions match the demo.',
        'Living room naming and floor finish are refined. Existing furniture is preserved and checked before approval.',
        'No file was uploaded or processed by a service. Connect your architect adapter to reconstruct a real plan.',
      ],
    };
  },
};

export function createDesignerAdapter(catalog: CatalogAsset[]): DesignerAdapter { return {
  async propose(scene: SceneDocument, revision: number, signal?: AbortSignal): Promise<AgentProposal> {
    const snapshot = structuredClone(scene);
    await delay(1100, signal);
    const validation = validateScene(snapshot, catalog);
    if (!validation.ok) throw new Error(`The designer needs a valid scene: ${validation.errors.join(' ')}`);
    const focal = snapshot.objects.find(object => catalog.find(asset => asset.id === object.assetId)?.kind === 'sofa') ?? snapshot.objects[0];
    const id = `mock-designer-${revision}-${++proposalSequence}`;
    if (focal) {
      const currentColor = focal.color ?? catalog.find(asset => asset.id === focal.assetId)!.color;
      const nextColor = currentColor === '#be775d' ? '#889987' : '#be775d';
      return {
        id, title: nextColor === '#be775d' ? 'A warmer focal point' : 'A softer sage palette',
        description: `Give ${focal.name.toLowerCase()} a ${nextColor === '#be775d' ? 'warm terracotta' : 'calm sage'} finish. The layout, dimensions and circulation stay the same. This is a local mock suggestion.`,
        command: { id, label: `Restyle ${focal.name}`, source: 'designer', baseRevision: revision, operations: [{ type: 'update', id: focal.id, patch: { color: nextColor } }] },
      };
    }
    const rooms = structuredClone(snapshot.rooms);
    rooms[0]!.color = rooms[0]!.color === '#ddcfb9' ? '#d6d9cb' : '#ddcfb9';
    return {
      id, title: 'Set a warm foundation', description: 'A subtle floor finish for the first room. This local mock scene has no furniture to restyle.',
      command: { id, label: 'Restyle floor finish', source: 'designer', baseRevision: revision, operations: [{ type: 'replace-structure', rooms, walls: snapshot.walls }] },
    };
  },
}; }

export const designerAdapter = createDesignerAdapter(localCatalog);
