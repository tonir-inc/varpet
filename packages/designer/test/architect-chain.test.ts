import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { SceneDocument } from '../../../apps/editor/src/contracts.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { wallOutward } from '../src/adapter.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { DesignerSession } from '../src/session.js';

// Real architect output from the editor-rendered Avani plan, including doorway recesses.
const observed = JSON.parse(readFileSync(new URL('../eval/chain-runs/20260926/architect-browser.json', import.meta.url), 'utf8'));
function shell(): SceneDocument {
  return { ...structuredClone(demoScene), objects: [], rooms: structuredClone(observed.result.structure.rooms), walls: structuredClone(observed.result.structure.walls) };
}

test('the real architect shell retains interior polygons, physical walls, openings and unknown orientation', () => {
  const input = shell(), original = structuredClone(input);
  expect(validateScene(input, localCatalog).ok).toBe(true);
  const scene = editorToDesigner(input);
  expect(scene.rooms.map(room => room.polygon)).toEqual(input.rooms.map(room => room.polygon.map(([x,z]) => [x,-z])));
  expect(scene.items).toEqual([]);
  expect(scene.north_deg).toBeUndefined();
  expect(scene.openings.map(o => o.id).sort()).toEqual(input.walls.flatMap(w => w.openings.map(o => o.id)).sort());
  expect(scene.openings.every(o => o.swing === undefined)).toBe(true);
  for (const wall of scene.walls) expect(wallOutward(scene, wall).every(Number.isFinite)).toBe(true);
  expect(input).toEqual(original);
});

test('a catalog addition to the empty architect shell passes the designer and EditorStore gates', () => {
  const input = shell(), scene = editorToDesigner(input), asset = localCatalog.find(a => a.kind === 'chair')!;
  const session = new DesignerSession(scene);
  session.setIntent({room_id:'living', add:[{kinds:['chair'], count:1}], budget_dram:asset.price});
  const accepted = session.propose([{type:'add',item:{id:'reading-chair',name:asset.name,kind:'chair',room_id:'living',
    pos:[2,-3],rot:0,size:[asset.dimensions[0],asset.dimensions[2],asset.dimensions[1]],keep:false,sku:asset.id,price:asset.price}}], 'A reading chair in the living room.');
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.errors));
  const proposal = proposalToEditor(accepted.proposal,input,0,{catalogCurrency:'AMD'});
  const store = new EditorStore(input,localCatalog);
  expect(store.execute(proposal.command,false).ok).toBe(false);
  expect(store.execute(proposal.command,true).ok).toBe(true);
  expect(validateScene(store.scene,localCatalog).ok).toBe(true);
  expect(store.scene.objects).toHaveLength(1);
});

test('wall-face support stops at physical half-thickness and still rejects interior obstacles', () => {
  const input = shell();
  // Move the exterior wall away from its room beyond its physical thickness.
  input.walls[0]!.start[1] = -.001; input.walls[0]!.end[1] = -.001;
  expect(() => editorToDesigner(input)).toThrow(/boundary/);
  const obstacle = shell();
  obstacle.walls.push({id:'interior-obstacle',start:[1,2],end:[3,2],height:2.6,thickness:.16,color:'#ffffff',openings:[]});
  expect(() => editorToDesigner(obstacle)).toThrow(/boundary/);
});
