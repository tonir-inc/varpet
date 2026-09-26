import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { demoScene } from '../../../apps/editor/src/core/demo.js';
const script=new URL('../eval/komitas-validate.ts',import.meta.url).pathname;
const tsx=new URL('../node_modules/.bin/tsx',import.meta.url).pathname;
test('an accepted scene is removed when the next real HTTP outcome is an error',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'komitas-ledger-'));
  const save=(value:unknown)=>writeFileSync(resolve(root,'case.architect.json'),JSON.stringify(value));
  const run=()=>spawnSync(tsx,[script,'case',root],{encoding:'utf8'});
  try {
    save({lines:[{type:'structure',rooms:demoScene.rooms,walls:demoScene.walls,notes:[]}]});
    const accepted=run();expect(accepted.status,accepted.stderr).toBe(0);
    expect(existsSync(resolve(root,'case.scene.json'))).toBe(true);
    save({lines:[{type:'error',message:'Architect rejected geometry'}]});
    expect(run().status).toBe(1);
    expect(existsSync(resolve(root,'case.scene.json'))).toBe(false);
    expect(JSON.parse(readFileSync(resolve(root,'case.metrics.json'),'utf8')).accepted).toBe(false);
  } finally {rmSync(root,{recursive:true});}
});
test('an editor-valid draft is diagnostic only when the architect returned an error',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'komitas-ledger-'));
  try {
    writeFileSync(resolve(root,'case.architect.json'),JSON.stringify({lines:[{type:'error',message:'Unresolved shell faults'}]}));
    writeFileSync(resolve(root,'case.shell.json'),JSON.stringify({rooms:demoScene.rooms,walls:demoScene.walls,notes:[]}));
    expect(spawnSync(tsx,[script,'case',root],{encoding:'utf8'}).status).toBe(1);
    expect(existsSync(resolve(root,'case.scene.json'))).toBe(false);
    expect(existsSync(resolve(root,'case.rejected.json'))).toBe(true);
    expect(JSON.parse(readFileSync(resolve(root,'case.metrics.json'),'utf8'))).toMatchObject({architect_accepted:false,editor_accepted:true,bridge_accepted:true,accepted:false});
  } finally {rmSync(root,{recursive:true});}
});
