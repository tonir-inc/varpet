/** A furnished flat's pieces as the designer's own design: <flat>/design.json in the recorded-design shape
 * (`{draft, owned, requests}`, as in apps/editor/public/demo-sessions/*.json). The live designer moves, swaps and
 * removes the pieces of a design it owns; pieces it does not own are the customer's and stay where they are. The
 * Experimental tab sends this with the first designer request of a conversation.
 *
 *     cd packages/designer && npx tsx ../../apartments/_svg/design.ts ../../apartments/<flat>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { editorToDesigner } from '../../packages/designer/src/editor-bridge.ts';

const flat = process.argv[2];
if (!flat) { console.error('usage: design.ts <flat dir>'); process.exit(2); }
const { scene, catalog } = JSON.parse(readFileSync(join(flat, 'startup.json'), 'utf8'));
const prices = new Map<string, number>(catalog.map((asset: { id: string; price: number }) => [asset.id, asset.price]));
const designer = editorToDesigner(scene, { catalog, catalogCurrency: 'AMD' });
// The keys the designer's draft accepts (spike/run/AGENTS.md: extra keys fail its check); every item needs a price.
const items = designer.items.map(item => ({
  id: item.id, room_id: item.room_id, kind: item.kind, name: item.name, pos: item.pos, rot: item.rot, size: item.size,
  keep: false, sku: item.sku, price: prices.get(item.sku ?? '') ?? item.price ?? 0, vendor: (item.sku ?? '').split(':')[0] || 'catalog',
  ...(item.on ? { on: item.on } : {}),  // a piece standing on another (the TV on its unit)
}));
const design = { draft: { items, finishes: [], lighting: [] }, owned: items.map(item => item.id), requests: [] };
writeFileSync(join(flat, 'design.json'), JSON.stringify(design, null, 1) + '\n');
console.log(`design.json: ${items.length} pieces owned by the designer`);
