/** A spike workspace's finished design as an editor proposal (the designer service calls this after a turn):
 *   tsx run/proposal.ts <workspace> <current-editor.json> <catalog.json> <revision> <owned.json> <out.json> [--title t] [--description d]
 * The workspace holds scene.json, draft.json and source.json (the customer's editor document without the design's own
 * pieces). The design becomes a full editor document the same way the spike's 3D renders build it (wall-hung pieces get
 * a wall host, `on` becomes restsOn, finishes, ceiling designs and light fixtures), then the bridge diffs it against the
 * customer's current document into checked operations. Prints nothing; writes {proposal, owned}. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CatalogAsset, SceneDocument } from '../../../../apps/editor/src/contracts.js';
import { documentCommand } from '../../src/editor-bridge.js';
import type { Scene } from '../../src/scene.js';
import type { Draft } from '../lib/finishes.js';
import { editorDocument } from '../lib/view/document.js';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

export async function draftProposal(workspace: string, current: SceneDocument, requestCatalog: CatalogAsset[], revision: number, previouslyOwned: string[], copy: { title?: string; description?: string } = {}) {
  const scene = json(resolve(workspace, 'scene.json')) as Scene, draft = json(resolve(workspace, 'draft.json')) as Draft;
  const source = json(resolve(workspace, 'source.json')) as SceneDocument;
  const { scene: target, catalog } = await editorDocument(scene, draft, source);
  const clash = draft.items.find(item => !previouslyOwned.includes(item.id) && current.objects.some(object => object.id === item.id));
  if (clash) throw new Error(`Design item id ${clash.id} is already used by the customer's own furniture; rename it`);
  const owned = [...new Set([...previouslyOwned, ...draft.items.map(item => item.id),
    ...(draft.lighting ?? []).flatMap(light => light.type === 'fixture' ? [light.id] : [])])];
  const unknown = target.objects.filter(object => owned.includes(object.id) && object.assetId.startsWith('spike-box-'));
  if (unknown.length) throw new Error(`Catalog products not found for ${unknown.map(object => object.id).join(', ')}`);
  const merged = [...requestCatalog, ...catalog.filter(asset => !requestCatalog.some(known => known.id === asset.id))];
  return { proposal: documentCommand(current, target, owned, revision, { catalog: merged, ...copy }), owned };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(`--${name}`); if (i < 0) return undefined; const [, v] = args.splice(i, 2); return v; };
  const title = flag('title'), description = flag('description');
  const [workspace, currentPath, catalogPath, revision, ownedPath, out] = args;
  if (!out) { console.error('usage: proposal.ts <workspace> <current-editor.json> <catalog.json> <revision> <owned.json> <out.json> [--title t] [--description d]'); process.exit(2); }
  draftProposal(workspace!, json(currentPath!), json(catalogPath!), Number(revision), json(ownedPath!), { title, description })
    .then(result => { writeFileSync(out, JSON.stringify(result) + '\n'); process.exit(0); },
      error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
