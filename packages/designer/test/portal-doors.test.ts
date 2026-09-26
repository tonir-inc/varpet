import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {editorToDesigner} from '../src/editor-bridge.js';
import {physicalDoorSwingPolygon,pointInPolygon} from '../src/metrics/space.js';
import {doorBarriers} from '../../../apps/editor/src/core/door-barriers.js';
import type {SceneDocument} from '../../../apps/editor/src/contracts.js';
test('explicit portal hinged-door metadata converts to the same physical side as editor barriers',()=>{
 const scene=JSON.parse(readFileSync(new URL('../../../apartments/m6-12-54/scene.json',import.meta.url),'utf8')) as SceneDocument;
 const original=structuredClone(scene),converted=editorToDesigner(scene,{catalog:[],catalogCurrency:'AMD'});
 for(const wall of scene.walls)for(const door of wall.openings.filter(o=>o.kind==='door')){
  const opening=converted.openings.find(o=>o.id===door.id)!;
  expect(opening.swing).toBeDefined();
  const sweep=physicalDoorSwingPolygon(converted,opening)!;
  const barriers=doorBarriers(scene).filter(b=>b.entityId===door.id&&b.kind==='door-swing');
  for(const b of barriers){const center=b.polygon.reduce((a,p)=>[a[0]+p[0]/b.polygon.length,a[1]-p[1]/b.polygon.length],[0,0]);expect(pointInPolygon(center as [number,number],sweep),door.id).toBe(true);}
 }
 expect(scene).toEqual(original);
});
