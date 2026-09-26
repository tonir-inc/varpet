import {test,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('non-promoted classes bypass geometry even when explicitly classified',()=>{
 const root=mkdtempSync(join(tmpdir(),'fast-class-gate-'));
 try{
  const input=join(root,'input.json');writeFileSync(input,JSON.stringify({action:'prepare',allowed_classes:['move.group'],request:'Furnish the living room',scene:{},catalog:[]}));
  const raw=execFileSync(fileURLToPath(new URL('../node_modules/.bin/tsx',import.meta.url)),[fileURLToPath(new URL('../src/fast-cli.ts',import.meta.url)),input],{encoding:'utf8'});
  const result=JSON.parse(raw);expect(result.prepared.type).toBe('fallback');expect(result.prepared.classId).toBe('furnish.living');expect(result.cache_hit).toBe(false);
 }finally{rmSync(root,{recursive:true});}
});
