import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-viewer-integrity-'));
after(() => rm(output, { recursive: true, force: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, plugins: [{
  name: 'viewer-integrity-entry', resolveId(id) { if (id.endsWith('viewer-integrity-entry')) return '\0viewer-integrity-entry'; },
  load(id) { if (id === '\0viewer-integrity-entry') return `export * as THREE from 'three';\n` +
    ['render/scene-lighting', 'render/sunlight', 'render/rigid-opening-motion', 'render/practical-lights', 'render/services', 'core/free-walkthrough', 'core/renovation']
      .map(name => `export * from '${root}/src/${name}.ts';`).join('\n'); },
}], build: { ssr: 'viewer-integrity-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { THREE, sceneLighting, DEFAULT_SUN, rigidOpeningMotion, PracticalLightPool, moveFreeWalkPosition, freeWalkSpawn, emptyProject, makeServices, installComponentModel } = await import(pathToFileURL(join(output, 'test.mjs')));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const scene = () => ({ format:'varpet.editor', version:2, id:'camera-check', name:'Camera check', units:'m', upAxis:'Y',
  rooms:[{id:'room', name:'Room', polygon:[[0,0],[4,0],[4,4],[0,4]], color:'#eeeeee'}],
  walls:[{id:'wall', start:[2,0],end:[2,4],height:3,thickness:.2,color:'#eeeeee',openings:[]}], objects:[], project:emptyProject() });

test('midnight contributes no artificial sun/sky/ambient light, regardless of selected sky', () => {
  for (const hour of [0,22,24]) for (const selectedSky of [false,true]) {
    const light = sceneLighting({...DEFAULT_SUN,timeOfDay:hour}, selectedSky);
    assert.equal(light.night,true); assert.equal(light.ambient,0); assert.equal(light.environment,0); assert.equal(light.windowSky,0);
  }
  const noon = sceneLighting({...DEFAULT_SUN,timeOfDay:12}, false);
  assert.ok(noon.ambient > 0 && noon.environment > 0 && noon.windowSky > 0);
  assert.equal(noon.exposure,sceneLighting({...DEFAULT_SUN,timeOfDay:22},false).exposure);
});

test('fitted leaves retain every edge length through swing and tilt, including both mirror axes', () => {
  for (const mirrorX of [-1,1]) for (const mirrorZ of [-1,1]) for (const axis of ['x','y']) {
    const holder = new THREE.Group(); holder.scale.set(mirrorX*1.4,.8,mirrorZ*2.1);
    const pivot = new THREE.Group(); pivot.position.set(-.4,.1,.03); holder.add(pivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(.8,2,.045)); leaf.position.set(.4,1,0); pivot.add(leaf);
    const update = rigidOpeningMotion(pivot,holder.scale);
    const vertices = [new THREE.Vector3(-.4,-1,-.0225),new THREE.Vector3(.4,-1,-.0225),new THREE.Vector3(.4,1,.0225)];
    let distances;
    for (const angle of [0,.2,.6,Math.PI/2,0]) {
      pivot.rotation.set(0,0,0); pivot.rotation[axis]=angle; update(); holder.updateMatrixWorld(true);
      const points=vertices.map(point=>leaf.localToWorld(point.clone()));
      const current=[points[0].distanceTo(points[1]),points[1].distanceTo(points[2]),points[2].distanceTo(points[0])];
      if (!distances) distances=current; else current.forEach((distance,index)=>near(distance,distances[index]));
    }
    leaf.geometry.dispose(); leaf.material.dispose();
  }
});

test('practical source budget remains identical when the camera moves across a flat', () => {
  const world=new THREE.Scene(), pool=new PracticalLightPool(2); world.add(pool.group);
  for (let index=0;index<4;index++) { const light=new THREE.PointLight('#ffffff',index+1,5); light.position.x=index*10; world.add(light); }
  const camera=new THREE.PerspectiveCamera();
  const snapshot=()=>pool.group.children.map(light=>({intensity:light.intensity,position:light.position.toArray()}));
  pool.sync(world,camera); const first=snapshot(); camera.position.x=100; pool.sync(world,camera);
  assert.deepEqual(snapshot(),first); pool.dispose();
});

test('Inside crosses walls, furniture, room gaps and elevation changes without writing the document', () => {
  const document=scene(); document.objects.push({id:'block',assetId:'missing',name:'Block',position:[2,0,2],rotation:0,scale:[1,1,1]});
  const original=JSON.stringify(document);
  assert.deepEqual(moveFreeWalkPosition(document,[1,1.65,2],[2,0]),[3,1.65,2]);
  assert.deepEqual(moveFreeWalkPosition(document,[3,1.65,2],[3,0]),[6,1.65,2]);
  document.project.metadata.room={elevation:1.2};
  near(moveFreeWalkPosition(document,[6,1.65,2],[-3,0])[1],2.85);
  assert.ok(freeWalkSpawn(document)); delete document.project.metadata.room;
  assert.equal(JSON.stringify(document),original);
});

test('off and zero-brightness installed fixtures also turn off their imported emissive materials', () => {
  const document=scene(), component={id:'light',name:'Light',kind:'light',position:[2,2.8,2],dimensions:[.2,.1,.2],rotation:0,color:'#ffffff',phase:'existing',light:{brightness:800,temperature:3000,enabled:true}};
  document.project.components.push(component); const services=makeServices(document);
  const material=new THREE.MeshStandardMaterial({emissive:'#ffffff',emissiveIntensity:3});
  const model=new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(.2,.1,.2),material));
  installComponentModel(services.components.get('light'),component,model);
  services.applyLighting(new Map([['light',0]])); assert.equal(material.emissiveIntensity,0);
  services.applyLighting(new Map([['light',1]])); assert.equal(material.emissiveIntensity,3);
  component.light.brightness=0; services.applyLighting(new Map([['light',1]])); assert.equal(material.emissiveIntensity,0);
});
