import { expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts';
import { EditorStore } from '../../../apps/editor/src/core/store';
import { validateScene } from '../../../apps/editor/src/core/validation';

test('browser adapter -> HTTP service -> real bridge and MCP proposal -> editor validation and approval', async () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const bridge = join(root, 'packages/designer/src/editor-bridge.ts');
  await expect(access(bridge)).resolves.toBeUndefined();
  const { createDesignerHttpAdapter } = await import('../../../apps/editor/src/adapters/designer-http');
  const temporary = await mkdtemp(join(tmpdir(), 'designer-editor-e2e-'));
  const worker = join(temporary, 'worker.mts');
  const tsx = join(root, 'packages/designer/node_modules/.bin/tsx');
  const sdk = join(root, 'packages/designer/node_modules/@modelcontextprotocol/sdk/dist/esm');
  // Only model reasoning is replaced: scene conversion, the MCP gate, persistence,
  // HTTP streaming, command conversion and the editor store are production code.
  await writeFile(worker, `
import { readFile } from 'node:fs/promises';
import { createServer } from ${JSON.stringify(join(root, 'packages/designer/src/server.ts'))};
import { Client } from ${JSON.stringify(join(sdk, 'client/index.js'))};
import { InMemoryTransport } from ${JSON.stringify(join(sdk, 'inMemory.js'))};
const scene = JSON.parse(await readFile(process.env.VARPET_SCENE, 'utf8'));
const server = createServer(scene), client = new Client({name:'editor-e2e',version:'1'});
const [a,b] = InMemoryTransport.createLinkedPair();
await server.connect(a); await client.connect(b);
await client.callTool({name:'set_intent',arguments:{room_id:'room',move:[{kinds:['sofa'],count:1}]}});
const result = await client.callTool({name:'propose',arguments:{ops:[{type:'move',id:'sofa',pos:[2,-2],rot:90}],rationale:'Move the sofa into the clear floor area.'}});
console.log(JSON.stringify({method:'item/completed',payload:{item:{type:'mcpToolCall',server:'varpet-designer',tool:'propose',status:'completed',result}}}));
await client.close(); await server.close();
console.log(JSON.stringify({kind:'worker_summary',status:'completed',response:'A checked layout preview.'}));
`);
  const python = `from designer_service import DesignerService, make_server
service=DesignerService(worker_command=${JSON.stringify([tsx, worker])})
server=make_server(service,0)
print(server.server_port,flush=True)
try: server.serve_forever()
finally:
 service.close()
 server.server_close()
`;
  const child = spawn('python3', ['-u', '-c', python], { cwd: root,
    env: { ...process.env, PYTHONPATH: join(root, 'harness') }, stdio: ['ignore','pipe','pipe'] });
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
    const catalog: CatalogAsset[] = [{ id:'catalog-sofa', name:'Sofa', category:'Living', kind:'sofa',
      dimensions:[1,.8,.7], color:'#889987', price:123, source:{type:'procedural'} }];
    const scene: SceneDocument = {format:'varpet.editor',version:1,id:'room-scene',name:'Room',units:'m',upAxis:'Y',
      rooms:[{id:'room',name:'Living',color:'#ddcfb9',polygon:[[0,0],[5,0],[5,5],[0,5]]}],walls:[],
      objects:[{id:'sofa',name:'Sofa',assetId:'catalog-sofa',position:[1,0,1],rotation:0,scale:[1,1,1]}]};
    const store = new EditorStore(scene, catalog), progress: unknown[] = [];
    const adapter = createDesignerHttpAdapter({url:`http://127.0.0.1:${port}/designer/propose`,
      request:'Move the sofa into the clear floor.', catalog, onProgress: message => progress.push(message)});
    const proposal = await adapter.propose(store.scene, store.revision);
    expect(progress.length).toBeGreaterThan(0);
    expect(store.scene).toEqual(scene);
    expect(proposal.command).toMatchObject({source:'designer',baseRevision:0,
      operations:[{type:'update',id:'sofa',patch:{position:[2,0,2],rotation:Math.PI/2}}]});
    expect(store.execute(proposal.command, false).ok).toBe(false);
    expect(store.execute(proposal.command, true).ok).toBe(true);
    expect(validateScene(store.scene, catalog).ok).toBe(true);
    expect(store.scene.objects[0]!.position).toEqual([2,0,2]);
    expect(store.undo().ok).toBe(true);
    expect(store.scene).toEqual(scene);
    expect(store.execute({...proposal.command,id:'new-id-old-revision'}, true).errors.join(' ')).toMatch(/stale/);
  } catch (error) {
    throw new Error(`${String(error)}\nService stderr: ${diagnostics}`);
  } finally {
    child.kill('SIGTERM'); await exited;
    await rm(temporary, {recursive:true});
  }
}, 20000);
