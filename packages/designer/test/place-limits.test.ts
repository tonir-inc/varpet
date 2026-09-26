import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

// A separate process makes the pre-fix synchronous generator loop safely reproducible.
const sceneSource = `
const scene = {
  rooms:[{id:'room',polygon:[[0,0],[width,0],[width,4],[0,4]]}],
  walls:[{id:'south',room_id:'room',a:[0,0],b:[width,0]}],
  openings:[],fixed:[],items:[]
};
const item = {id:'desk',kind:'desk',size:[1.2,0.6,0.75]};
`;
function run(source: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import {place} from './src/place.ts'; ${source}`], {
    cwd: process.cwd(), timeout: 2000, encoding: 'utf8',
  });
}

test('oversized room is rejected before a wall generator can run without bound', () => {
  const result = run(`const width=1e20; ${sceneSource}
    try { place(scene,{room_id:'room',item,relations:[{type:'against_wall',wall_id:'south'}]}); process.exitCode=2; }
    catch (error) { console.log(error.message); if (!/one million|too large|split/i.test(error.message)) process.exitCode=3; }
  `);
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/one million|too large|split/i);
});

test('anchor enumeration terminates when a five-centimetre step is below floating-point precision', () => {
  const result = run(`const width=4; ${sceneSource}
    scene.items.push({id:'anchor',kind:'sofa',name:'Sofa',room_id:'room',pos:[2,2],rot:0,size:[1,1e20,1],keep:false});
    const result=place(scene,{room_id:'room',item,relations:[{type:'beside',anchor_id:'anchor',side:'left'}]});
    console.log(JSON.stringify(result));
    if (result.candidates.length || !/bound|split|invalid|outside/i.test(result.reason ?? '')) process.exitCode=2;
  `);
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/bound|split|invalid|outside/i);
});
