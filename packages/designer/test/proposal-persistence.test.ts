import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import type { Scene } from '../src/scene.js';

afterEach(() => vi.unstubAllEnvs());

async function connect() {
  const scene: Scene = { rooms: [{ id: 'r', polygon: [[0,0],[5,0],[5,5],[0,5]] }], walls: [], openings: [], items: [], fixed: [] };
  const server = createServer(scene);
  const client = new Client({ name: 'persistence-test', version: '1' });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  const call = (name: string, args: Record<string,unknown>) => client.callTool({ name, arguments: args });
  return { client, server, call };
}

test('propose saves only accepted checked snapshots to the service directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'designer-proposals-'));
  vi.stubEnv('VARPET_PROPOSALS_DIR', root);
  const { client, server, call } = await connect();
  try {
    expect((await call('propose', { ops: [], rationale: 'No intent yet.' })).isError).toBe(true);
    expect(await readdir(root)).toEqual([]);
    await call('set_intent', {});
    const empty = await call('propose', { ops: [], rationale: 'Keep the clear room.' });
    expect(empty.isError).toBe(true);
    expect(JSON.stringify(empty.content)).toMatch(/empty_proposal.*conversationally/);
    expect(JSON.stringify(empty.content)).not.toMatch(/proposal_id/);
    expect(await readdir(root)).toEqual([]);
    await call('set_intent',{add:[{kinds:['chair'],count:1}]});
    const result = await call('propose', { ops: [{type:'add',item:{id:'chair',room_id:'r',kind:'chair',name:'Chair',pos:[2,2],rot:0,size:[.5,.5,.8],keep:false,price:25000}}], rationale: 'Add a chair.' });
    expect(result.isError).not.toBe(true);
    const accepted = JSON.parse((result.content as {text:string}[])[0]!.text);
    expect(await readdir(root)).toEqual([`${accepted.proposal_id}.json`]);
    const saved = JSON.parse(await readFile(join(root, `${accepted.proposal_id}.json`), 'utf8'));
    expect(saved).toEqual(accepted.proposal);
    expect(saved.ops).toHaveLength(1);
    expect(saved).toMatchObject({ application_status: 'not_applied', requires_user_acceptance: true,
      checks: { ok: true }, request_check: { ok: true } });
  } finally { await client.close(); await server.close(); await rm(root, { recursive: true }); }
});

test('a persistence failure is returned as a tool error instead of claiming a deliverable proposal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'designer-proposals-'));
  const file = join(root, 'not-a-directory'); await writeFile(file, 'occupied');
  vi.stubEnv('VARPET_PROPOSALS_DIR', file);
  const { client, server, call } = await connect();
  try {
    await call('set_intent', {});
    const empty = await call('propose', { ops: [], rationale: 'Keep the clear room.' });
    expect(empty.isError).toBe(true);
    expect(JSON.stringify(empty.content)).toMatch(/empty_proposal.*conversationally/);
    expect(JSON.stringify(empty.content)).not.toMatch(/proposal_id/);
    await call('set_intent',{add:[{kinds:['chair'],count:1}]});
    const result = await call('propose', { ops: [{type:'add',item:{id:'chair',room_id:'r',kind:'chair',name:'Chair',pos:[2,2],rot:0,size:[.5,.5,.8],keep:false,price:25000}}], rationale: 'Add a chair.' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/save|persist/i);
    expect(await readFile(file, 'utf8')).toBe('occupied');
  } finally { await client.close(); await server.close(); await rm(root, { recursive: true }); }
});
