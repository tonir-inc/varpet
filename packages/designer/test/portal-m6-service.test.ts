import { expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTemplateScene } from '../../../apps/editor/src/portal/templates';
import type { CatalogAsset } from '../../../apps/editor/src/contracts';
import { EditorStore } from '../../../apps/editor/src/core/store';
import { validateScene } from '../../../apps/editor/src/core/validation';

test('portal m6 -> service -> checked furnishing -> editor approval and exact Undo', async () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const scene=createTemplateScene('m6');
  const bridge = process.env.VARPET_M6_TEST_BRIDGE ?? join(root, 'packages/designer/src/editor-bridge.ts');
  await expect(access(bridge)).resolves.toBeUndefined();
  const { createDesignerHttpAdapter } = await import('../../../apps/editor/src/adapters/designer-http');
  const temporary = await mkdtemp(join(tmpdir(), 'designer-editor-e2e-'));
  const worker = join(temporary, 'worker.mts');
  const tsx = join(root, 'packages/designer/node_modules/.bin/tsx');
  const sdk = join(root, 'packages/designer/node_modules/@modelcontextprotocol/sdk/dist/esm');
  // Deterministic reasoning and a supplied test catalog keep this offline; product
  // vision is disabled. Conversion, MCP checks/persistence, HTTP and EditorStore are real.
  await writeFile(worker, `
import { readFile } from 'node:fs/promises';
import { createServer } from ${JSON.stringify(join(root, 'packages/designer/src/server.ts'))};
import {place} from ${JSON.stringify(join(root, 'packages/designer/src/place.ts'))};
import { Client } from ${JSON.stringify(join(sdk, 'client/index.js'))};
import { InMemoryTransport } from ${JSON.stringify(join(sdk, 'inMemory.js'))};
const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
if(job.conversion_error)throw Error(job.conversion_error);
const scene = JSON.parse(await readFile(process.env.VARPET_SCENE, 'utf8'));
const server = createServer(scene), client = new Client({name:'editor-e2e',version:'1'});
const [a,b] = InMemoryTransport.createLinkedPair();
await server.connect(a); await client.connect(b);
if(scene.rooms?.length!==8||scene.openings?.length!==11)throw Error('Portal geometry was not converted');
for(const id of ${JSON.stringify(scene.walls.map(w=>w.id))}){
 if(!scene.walls.some(w=>w.source_id===id)&&!scene.fixed.some(f=>f.structure?.wall_id===id))throw Error('Dropped physical wall: '+id);
}
for(const id of ${JSON.stringify(scene.project!.components.map(c=>c.id))}){
 if(!scene.fixed.some(f=>f.structure?.wall_id===id))throw Error('Dropped fixture: '+id);
}
if(!scene.fixed.length||scene.fixed.some(f=>!f.keep))throw Error('Missing immutable structure');
await client.callTool({name:'set_intent',arguments:{room_id:'room-living',add:[{kinds:['sofa'],count:1}]}});
let result;
for(const relation of [{type:'centered'},{type:'against_wall'}]){
 const poses=place(scene,{room_id:'room-living',item:{id:'new-sofa',name:'Sofa',kind:'sofa',size:[1.6,.7,.8],sku:'catalog-sofa',price:123},relations:[relation]});
 for(const candidate of poses.candidates){
  result=await client.callTool({name:'propose',arguments:{ops:[candidate.op],rationale:'Add a checked sofa, preserving both balconies and door access.'}});
  if(!result.isError)break;
 }
 if(result&&!result.isError)break;
}
if(!result||result.isError)throw Error(JSON.stringify(result??'No sofa pose'));
console.log(JSON.stringify({method:'item/completed',payload:{item:{type:'mcpToolCall',server:'varpet-designer',tool:'propose',status:'completed',result}}}));
await client.close(); await server.close();
console.log(JSON.stringify({kind:'worker_summary',status:'completed',response:'A checked layout preview.'}));
`);
  const python = `from designer_service import DesignerService, make_server
service=DesignerService(bridge_command=${JSON.stringify([tsx, bridge])},worker_command=${JSON.stringify([tsx, worker])})
server=make_server(service,0)
print(server.server_port,flush=True)
try: server.serve_forever()
finally:
 service.close()
 server.server_close()
`;
  const child = spawn('python3', ['-u', '-c', python], { cwd: root,
    env: { ...process.env, VARPET_DESIGNER_TYPED_TOOLS:'0', VARPET_VISION_PRODUCTS:'0', PYTHONPATH: join(root, 'harness') }, stdio: ['ignore','pipe','pipe'] });
  let diagnostics = ''; child.stderr.on('data', chunk => diagnostics += chunk.toString());
  const exited = new Promise<void>(resolve => child.on('exit', () => resolve()));
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Service did not start: ' + diagnostics)), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        if (output.includes('\n')) { clearTimeout(timer); resolve(Number(output.trim().split('\n')[0])); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Service exited ${code}: ${diagnostics}`)); });
    });
    const catalog: CatalogAsset[] = [{id:'catalog-sofa',name:'Sofa',category:'Living',kind:'sofa',dimensions:[1.6,.8,.7],color:'#889987',price:123,source:{type:'procedural'}}];
    const store = new EditorStore(scene, catalog), progress: unknown[] = [];
    const adapter = createDesignerHttpAdapter({url:`http://127.0.0.1:${port}/designer/propose`,
      request:'Add a sofa to the living room.', catalog, catalogCurrency:'AMD', onProgress: message => progress.push(message)});
    const proposal = await adapter.propose(store.scene, store.revision);
    expect(progress.length).toBeGreaterThan(0);
    expect(store.scene).toEqual(scene);
    expect(proposal.command).toMatchObject({source:'designer',baseRevision:0,operations:[{type:'add',object:{id:'new-sofa',assetId:'catalog-sofa'}}]});
    expect(store.execute(proposal.command, false).ok).toBe(false);
    expect(store.execute(proposal.command, true).ok).toBe(true);
    expect(validateScene(store.scene, catalog).ok).toBe(true);
    expect(store.scene.objects).toHaveLength(1);
    expect(store.scene.rooms).toEqual(scene.rooms);
    expect(store.scene.walls).toEqual(scene.walls);
    expect(store.scene.project).toEqual(scene.project);
    expect(store.undo().ok).toBe(true);
    expect(store.scene).toEqual(scene);
    expect(store.execute({...proposal.command,id:'new-id-old-revision'}, true).errors.join(' ')).toMatch(/stale/);
  } catch (error) {
    throw new Error(`${String(error)}\nService stderr: ${diagnostics}`);
  } finally {
    child.kill('SIGTERM'); await exited;
    await rm(temporary, {recursive:true});
  }
}, 30000);
