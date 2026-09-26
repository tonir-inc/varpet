import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localCatalog } from '../../apps/editor/src/core/demo';
import { parseScene, serializeScene } from '../../apps/editor/src/core/persistence';
import { validateScene } from '../../apps/editor/src/core/validation';
import { createApartmentStore } from '../../apps/editor/src/core/apartment-store';
import { polygonArea } from '../../apps/editor/src/core/geometry';

const path = process.argv[2] ?? 'apartments/m6-12-54/scene.json';
const scene = parseScene(readFileSync(path, 'utf8'), localCatalog);
assert.equal(scene.rooms.length, 8);
assert.equal(scene.rooms.filter(r => scene.project!.metadata[r.id]?.zone === 'balcony').length, 2);
assert.equal(scene.walls.flatMap(w => w.openings).length, 11);
assert.equal(scene.walls.flatMap(w => w.openings).filter(o => scene.project!.metadata[o.id]?.role === 'balcony').length, 3);
assert.equal(scene.walls.flatMap(w => w.openings).filter(o => scene.project!.metadata[o.id]?.role === 'entrance').length, 1);
assert.equal(scene.project!.sources.length, 1);
assert.ok(scene.project!.sources[0]!.dataUrl!.startsWith('data:image/png;base64,'));
assert.ok(scene.project!.assumptions.every(a => a.status === 'unresolved'));
assert.ok(scene.walls.every(w => scene.project!.metadata[w.id]?.review === 'required'));
assert.deepEqual(parseScene(serializeScene(scene), localCatalog), scene);
const store = createApartmentStore(scene, localCatalog);
assert.deepEqual(validateScene(store.scene, localCatalog).errors, []);
assert.deepEqual(parseScene(serializeScene(store.scene), localCatalog), store.scene);
assert.equal(store.scene.walls.flatMap(w => w.openings).length, 11);
assert.equal(store.scene.project!.sources[0]!.dataUrl, scene.project!.sources[0]!.dataUrl);

// Every closed room and both balcony connections must reach floor on BOTH sides of its door.
const contains = (x: number, z: number, p: number[][]) => {
  let inside = false;
  for (let i=0,j=p.length-1;i<p.length;j=i++) {
    const a=p[i]!,b=p[j]!;
    if ((a[1]!>z)!==(b[1]!>z) && x<(b[0]!-a[0]!)*(z-a[1]!)/(b[1]!-a[1]!)+a[0]!) inside=!inside;
  }
  return inside;
};
const connections: Record<string, string[]> = {};
assert.equal(scene.project!.metadata['door-bedroom-small']?.swing, -1, 'Bedroom 2 must open into the bedroom, matching the source arc.');
const pixelPoint = (x: number, y: number) => [(x-635)/97,(y-575)/97] as const;
for (const [x,y] of [[1006.5,700],[830,899.5]]) {
  const p=pixelPoint(x!,y!);
  assert.ok(contains(...p,scene.rooms.find(r=>r.id==='room-living')!.polygon),'Living floor must reach its east facade and south window.');
}
const southReturn=pixelPoint(350,1062);
assert.ok(contains(...southReturn,scene.rooms.find(r=>r.id==='room-bedroom-large')!.polygon),'Bedroom 1 floor must reach the stepped south facade.');
for (const wall of scene.walls) for (const opening of wall.openings.filter(o=>o.kind==='door')) {
  const dx=wall.end[0]-wall.start[0], dz=wall.end[1]-wall.start[1], len=Math.hypot(dx,dz);
  const at=opening.offset+opening.width/2, x=wall.start[0]+dx/len*at,z=wall.start[1]+dz/len*at;
  const sides=[-1,1].map(sign=>scene.rooms.filter(r=>contains(x-sign*dz/len*(wall.thickness/2+0.025),z+sign*dx/len*(wall.thickness/2+0.025),r.polygon)).map(r=>r.id));
  if (opening.id==='door-entrance') assert.ok(sides.some(s=>s.includes('room-hall')));
  else assert.ok(sides.every(s=>s.length>0),`${opening.id} lacks floor on both sides: ${JSON.stringify(sides)}`);
  connections[opening.id]=sides.flat();
  if (opening.id !== 'door-entrance') for (const along of [0.05,0.25,0.5,0.75,0.95]) for (const across of [-0.55,0,0.55]) {
    const distance=opening.offset+opening.width*along;
    const px=wall.start[0]+dx/len*distance-dz/len*wall.thickness*across;
    const pz=wall.start[1]+dz/len*distance+dx/len*wall.thickness*across;
    assert.ok(scene.rooms.some(r=>contains(px,pz,r.polygon)),`${opening.id} has an uncovered threshold (${along}, ${across}).`);
  }
}
assert.deepEqual(new Set(connections['door-balcony-small']), new Set(['room-bedroom-small','room-balcony-south']));
assert.deepEqual(new Set(connections['door-balcony-large']), new Set(['room-bedroom-large','room-balcony-south']));
assert.deepEqual(new Set(connections['door-balcony-living']), new Set(['room-living','room-balcony-east']));
console.log(`PASS ${path}: 8 rooms, 2 balconies, 11 openings; 3 balcony doors connect correctly; all internal doors connect floor; embedded source and assumptions survive normalized save/reimport.`);
console.log(`Raw wall spans ${scene.walls.length}; normalized wall spans ${store.scene.walls.length}; floor polygons ${scene.rooms.reduce((s,r)=>s+polygonArea(r.polygon),0).toFixed(2)} m².`);
console.log(JSON.stringify(connections,null,2));
