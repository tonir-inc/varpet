/** Build a flat's workspace files: tsx run/flat.ts <flat> <outDir>
 * <flat> is "avani" (the editor demo; scene.json is fixtures/avani-empty.json so older cases stay identical),
 * an editor SceneDocument (format "varpet.editor"), or an architect shell (rooms/walls/components), which goes through
 * the product's replace-scene reconstruction. Writes source.json (editor document the renders start from) and
 * scene.json (designer scene from editorToDesigner), then prints the room ids and names as JSON. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneDocument } from '../../../../apps/editor/src/contracts.js';
import { demoScene } from '../../../../apps/editor/src/core/demo.js';
import { createInitialScene } from '../../../../apps/editor/src/core/initial-scene.js';
import { createReconstructionProposal } from '../../../../apps/editor/src/core/reconstruction-proposal.js';
import { EditorStore } from '../../../../apps/editor/src/core/store.js';
import { editorToDesigner } from '../../src/editor-bridge.js';
import type { Scene } from '../../src/scene.js';

const spike = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function editorSource(flat: string): SceneDocument {
  if (flat === 'avani') return { ...structuredClone(demoScene), objects: [] };
  const input = JSON.parse(readFileSync(resolve(spike, flat), 'utf8'));
  if (input?.format === 'varpet.editor') return { ...input, objects: input.objects ?? [] } as SceneDocument;
  const id = basename(flat).replace(/\.(shell|scene)?\.json$/, '');
  // Saved shells keep pydantic nulls (host, notes); the harness's to_editor drops them (exclude_none) and so do we.
  const dropNulls = (value: unknown): unknown => Array.isArray(value) ? value.map(dropNulls)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)])) : value;
  input.components &&= dropNulls(input.components);
  const store = new EditorStore(createInitialScene(), []);
  const operation = createReconstructionProposal(store.scene, store.revision, input, true, id).command.operations[0];
  if (operation?.type !== 'replace-scene') throw new Error(`${flat}: reconstruction did not produce a replace-scene`);
  return { ...structuredClone(operation.scene), name: id };
}

export function buildFlat(flat: string, outDir: string): { source: SceneDocument; scene: Scene } {
  const source = editorSource(flat);
  let scene: Scene;
  if (flat === 'avani') {
    copyFileSync(resolve(spike, 'fixtures/avani-empty.json'), resolve(outDir, 'scene.json'));
    scene = JSON.parse(readFileSync(resolve(outDir, 'scene.json'), 'utf8'));
  } else {
    scene = editorToDesigner(source, { northDeg: 0, catalog: [] });
    writeFileSync(resolve(outDir, 'scene.json'), JSON.stringify(scene, null, 1) + '\n');
  }
  writeFileSync(resolve(outDir, 'source.json'), JSON.stringify(source) + '\n');
  return { source, scene };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flat, outDir] = process.argv.slice(2);
  if (!flat || !outDir) { console.error('usage: flat.ts <avani|flat.json> <outDir>'); process.exit(2); }
  try {
    const { scene } = buildFlat(flat, outDir);
    console.log(JSON.stringify(scene.rooms.map(room => ({ id: room.id, name: room.name }))));
  } catch (error) { console.error(`error: ${error instanceof Error ? error.message : error}`); process.exit(1); }
}
