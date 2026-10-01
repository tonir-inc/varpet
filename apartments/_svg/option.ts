/** A designer proposal on a flat's main arrangement, saved as a design option build.py adds to scene.furnished.json.
 * Run from apps/editor with the editor (and its catalog) serving on 5191:
 *   npx tsx ../../apartments/_svg/option.ts <flat dir> <designer stream.ndjson> <option id> "<Option name>"
 * Writes <flat>/option.<id>.json: the proposed scene's furniture, lights, finishes and materials, plus the catalog
 * records of every piece the main arrangement does not already use. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorStore } from '../../apps/editor/src/core/store';
import { catalogProduct } from '../../apps/editor/src/adapters/database-catalog';
import type { AgentProposal, CatalogAsset, SceneDocument } from '../../apps/editor/src/contracts';

const [flat, stream, id, name] = process.argv.slice(2);
if (!flat || !stream || !id || !name) throw new Error('usage: option.ts <flat dir> <stream.ndjson> <option id> "<name>"');
const startup = JSON.parse(readFileSync(join(flat, 'startup.json'), 'utf8')) as { scene: SceneDocument; catalog: CatalogAsset[] };
const records = readFileSync(stream, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
const final = records.findLast(record => record.type === 'proposal') as { proposal: AgentProposal } | undefined;
if (!final) throw new Error(`no proposal in ${stream}`);

// The proposal was made on the main arrangement (revision 0); its new pieces come from the catalog by id.
const scene = structuredClone(startup.scene);
const known = new Set(startup.catalog.map(asset => asset.id));
const wanted = new Set<string>();
JSON.stringify(final.proposal.command.operations, (key, value) => { if (key === 'assetId' && typeof value === 'string' && !known.has(value)) wanted.add(value); return value; });
const added: CatalogAsset[] = [];
for (const ids = [...wanted]; ids.length;) {
  const batch = ids.splice(0, 100);
  const response = await fetch(`http://127.0.0.1:5191/api/catalog/items?${new URLSearchParams({ ids: batch.join(',') })}`);
  const body = await response.json() as { results?: unknown[] };
  if (!response.ok || !Array.isArray(body.results)) throw new Error(`catalog items: ${response.status}`);
  for (const product of body.results.map(catalogProduct)) if (product) added.push(product.asset);
}
const missing = [...wanted].filter(asset => !added.some(a => a.id === asset));
if (missing.length) throw new Error(`catalog has no record for ${missing.join(', ')}`);

const store = new EditorStore(scene, [...startup.catalog, ...added]);
const result = store.execute({ ...structuredClone(final.proposal.command), baseRevision: store.revision }, true);
if (!result.ok) throw new Error(result.errors.join(' '));
const out = store.scene, project = out.project!;
writeFileSync(join(flat, `option.${id}.json`), JSON.stringify({
  name, from: final.proposal.title, objects: out.objects, components: project.components, finishes: project.finishes,
  materials: project.materials, routes: project.routes, metadata: project.metadata, catalog: added,
}, null, 1) + '\n');
console.log(`option.${id}.json: ${out.objects.length} pieces (${out.objects.length - startup.scene.objects.length} added), ${added.length} new catalog records, `
  + `${project.components.length} components, ${project.finishes.length} finishes`);
