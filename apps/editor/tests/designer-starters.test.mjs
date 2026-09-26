import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-starters-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  ssr: `${root}/src/ui/designer-starters.ts`, target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'starters.mjs' } },
} });
const { designerStarters, fallbackStarters } = await import(pathToFileURL(join(output, 'starters.mjs')));
const room = (id, name, x=0) => ({id, name, polygon:[[x,0],[x+4,0],[x+4,4],[x,4]],color:'#ffffff'});
const scene = () => ({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[room('living','Living room'),room('bed','Bedroom',4)],walls:[],objects:[]});
const object = (id,assetId,x=6,z=2) => ({id,name:id,assetId,position:[x,0,z],rotation:0,scale:[1,1,1]});
const catalog = [{id:'bed',name:'Double bed',kind:'bed',category:'Bedroom'}, {id:'wardrobe',name:'Oak wardrobe',kind:'cabinet',category:'Bedroom'}, {id:'cabinet',name:'Storage cabinet',kind:'cabinet',category:'Storage'}];
const windowWall = () => ({id:'west',start:[0,0],end:[0,4],height:2.7,thickness:.2,color:'#ffffff',openings:[{id:'window',kind:'window',offset:1,width:1,height:1.5,sill:.8}]});
const labels = suggestions => suggestions.map(s=>s.label).join('\n');

test('empty flat keeps the four original examples',()=>{
  const s=scene(); s.rooms=[];
  assert.deepEqual(designerStarters(s,catalog),fallbackStarters);
  assert.equal(fallbackStarters.length,4);
});
test('empty rooms get actionable starters and edits recompute without mutation',()=>{
  const s=scene(), before=structuredClone(s);
  const first=designerStarters(s,catalog);
  assert.match(labels(first),/Living room is empty/);
  assert.equal(first.find(v=>v.id==='empty:living').request,'Furnish the Living room.');
  assert.ok(first.length>=3 && first.length<=4); assert.deepEqual(s,before);
  s.objects.push(object('bed','bed'));
  const next=designerStarters(s,catalog);
  assert.doesNotMatch(labels(next),/Bedroom is empty/);
  assert.match(labels(next),/No wardrobe.*Bedroom/);
  s.objects.push(object('wardrobe','wardrobe'));
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/No wardrobe/);
});
test('unknown furniture and ambiguous cabinets never become false empty or missing-storage claims',()=>{
  const s=scene(); s.objects=[object('unknown','not-loaded')];
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/Bedroom is empty|No wardrobe/);
  s.objects=[object('bed','bed'),object('cabinet','cabinet')];
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/No wardrobe/);
});
test('native wardrobe kind counts as storage even when its product name gives no clue',()=>{
  const s=scene(); s.objects=[object('bed','bed'),object('pax','pax')];
  const assets=[...catalog,{id:'pax',name:'PAX',kind:'wardrobe',category:'Bedroom'}];
  assert.doesNotMatch(labels(designerStarters(s,assets)),/No wardrobe/);
  s.objects.pop();
  assert.match(labels(designerStarters(s,assets)),/No wardrobe/);
});
test('room polygons, boundaries and floors determine which room contains furniture',()=>{
  const s=scene(); s.rooms=[room('bed','Bedroom')];
  s.rooms[0].polygon=[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]];
  s.objects=[object('bed','bed',3,3)];
  assert.match(labels(designerStarters(s,catalog)),/Bedroom is empty/);
  s.objects[0].position=[0,0,2];
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/Bedroom is empty/);
  s.objects[0].position=[0,3,2];
  assert.match(labels(designerStarters(s,catalog)),/Bedroom is empty/);
});
test('built-in storage and removed entities respect renovation metadata',()=>{
  const s=scene(); s.objects=[object('bed','bed')];
  s.project={metadata:{living:{phase:'remove'}},components:[{id:'built',name:'Wardrobe',kind:'cabinet',roomId:'bed',position:[6,0,2],dimensions:[2,2,.6],rotation:0,color:'#ffffff',phase:'existing'}]};
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/Living room|No wardrobe/);
  s.project.components[0].phase='remove';
  assert.match(labels(designerStarters(s,catalog)),/No wardrobe/);
});
test('west-facing wording requires known north and survives reversed wall endpoints',()=>{
  const s=scene(); s.walls=[windowWall()];
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/west|afternoon/i);
  assert.match(labels(designerStarters(s,catalog,0)),/West-facing.*Living room/);
  s.walls[0].start=[0,4];s.walls[0].end=[0,0];
  assert.match(labels(designerStarters(s,catalog,0)),/West-facing/);
  assert.doesNotMatch(labels(designerStarters(s,catalog,90)),/West-facing/);
});
test('interior, removed and explicitly shared windows never claim west exposure',()=>{
  const s=scene();s.walls=[windowWall()];s.rooms.push(room('outside','Study',-4));
  assert.doesNotMatch(labels(designerStarters(s,catalog,0)),/West-facing/);
  s.rooms.pop();s.project={metadata:{west:{boundary:'shared'}},components:[]};
  assert.doesNotMatch(labels(designerStarters(s,catalog,0)),/West-facing/);
  s.project.metadata={window:{phase:'remove'}};
  assert.doesNotMatch(labels(designerStarters(s,catalog,0)),/window|West-facing/i);
});
test('only four deterministic, distinct suggestions are shown in a large flat',()=>{
  const s=scene();s.rooms=Array.from({length:30},(_,i)=>room(`room${i}`,`Bedroom ${i}`,i*4));
  const result=designerStarters(s,catalog);
  assert.equal(result.length,4); assert.equal(new Set(result.map(s=>s.id)).size,4);
  assert.deepEqual(designerStarters(s,catalog),result);
});

test('elevated built-in cabinets count without roomId and stay on their own floor',()=>{
  const s=scene();s.objects=[object('bed','bed')];
  s.project={metadata:{},components:[{id:'cupboard',name:'Wall cabinet',kind:'cabinet',position:[6,1.4,2],dimensions:[1,.8,.4],rotation:0,color:'#ffffff',phase:'existing'}]};
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/No wardrobe/);
  s.objects=[];
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/Bedroom is empty/);
  s.project.components[0].position[1]=4.4;
  assert.match(labels(designerStarters(s,catalog)),/Bedroom is empty/);
});

test('built-in occupancy uses the same shell-derived ceiling as the editor',()=>{
  const s=scene();s.rooms=[room('living','Living room')];s.walls=[{...windowWall(),height:3.5}];
  s.project={metadata:{},components:[{id:'cupboard',name:'Wall cabinet',kind:'cabinet',position:[1,3,2],dimensions:[1,.3,.4],rotation:0,color:'#ffffff',phase:'existing'}]};
  assert.doesNotMatch(labels(designerStarters(s,catalog)),/Living room is empty/);
});
