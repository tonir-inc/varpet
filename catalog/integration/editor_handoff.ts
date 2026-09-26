// End-to-end check of the catalog -> designer -> editor handoff, with the real code on each side:
// the editor catalog from GET /editor/assets, SKUs as the designer's search_catalog sees them,
// the designer's DesignerSession + editor bridge, and the editor's EditorStore.
// Run: packages/designer/node_modules/.bin/tsx catalog/integration/editor_handoff.ts <assets.json> <picks.json>
import { readFileSync } from 'node:fs';
import type { CatalogAsset, SceneDocument } from '../../apps/editor/src/contracts.js';
import { localCatalog } from '../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../apps/editor/src/core/store.js';
import { DesignerSession } from '../../packages/designer/src/session.js';
import { editorToDesigner, proposalToEditor } from '../../packages/designer/src/editor-bridge.js';

type Pick = { id: string; kind: string; name: string; size_m: [number, number, number]; price: number };
const remote = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as CatalogAsset[];
const picks = JSON.parse(readFileSync(process.argv[3]!, 'utf8')) as Pick[];
const catalog = [...localCatalog, ...remote.filter(a => !localCatalog.some(l => l.id === a.id))];

const scene: SceneDocument = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', polygon: [[0, 0], [7, 0], [7, 7], [0, 7]], color: '#ffffff' }],
  walls: [{ id: 'wall', start: [0, 0], end: [7, 0], height: 2.7, thickness: .1, color: '#ffffff',
    openings: [{ id: 'door', kind: 'door', offset: 0, width: .9, sill: 0, height: 2.1 }] }],
  objects: [] };

let failures = 0;
for (const pick of picks) {
  try {
    const session = new DesignerSession(editorToDesigner(scene, { catalog, catalogCurrency: 'AMD' }));
    session.setIntent({ room_id: 'room', add: [{ kinds: [pick.kind], count: 1 }], remove: [], keeps: [], move: [] });
    const item = { id: `new-${pick.kind}`, kind: pick.kind, name: pick.name.slice(0, 60), room_id: 'room',
      pos: [3.5, -3.5] as [number, number], rot: 0, size: pick.size_m, keep: false, sku: pick.id, price: pick.price };
    const result = session.propose([{ type: 'add', item }], `Add the ${pick.kind} from the catalog.`);
    if (!result.ok) throw new Error('designer refused: ' + JSON.stringify(result.errors).slice(0, 300));
    const translated = proposalToEditor(result.proposal, scene, 0, { catalog, catalogCurrency: 'AMD' });
    const store = new EditorStore(scene, catalog), applied = store.execute(translated.command, true);
    if (!applied.ok) throw new Error('editor refused: ' + JSON.stringify(applied).slice(0, 300));
    const placed = store.scene.objects[0]!;
    console.log(`PASS ${pick.kind.padEnd(8)} ${pick.id} -> editor object ${placed.id} asset ${placed.assetId}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${pick.kind.padEnd(8)} ${pick.id}: ${(error as Error).message.split('\n')[0]}`);
  }
}
process.exit(failures ? 1 : 0);
