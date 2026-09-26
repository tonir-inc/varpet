import { test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

test('stdio lists exactly nine tools and reads the bedroom from any working directory', async () => {
  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['--silent', '--dir', fileURLToPath(new URL('..', import.meta.url)), 'start', '--scene', fileURLToPath(new URL('./fixtures/bedroom.json', import.meta.url))],
    cwd: tmpdir(), stderr: 'pipe',
  });
  const client = new Client({ name: 'designer-contract', version: '1' });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    expect(result.tools.map(t => t.name).sort()).toEqual(['ask', 'check_layout', 'place', 'propose', 'scene_summary', 'score_layout', 'search_catalog', 'set_intent', 'sun']);
    const summary = await client.callTool({ name: 'scene_summary', arguments: {} });
    expect(summary.isError).not.toBe(true);
    const data = JSON.parse((summary.content as { text: string }[])[0]!.text);
    expect(data.rooms[0].polygon).toEqual([[0,0],[4,0],[4,3.5],[0,3.5]]);
    expect(data.walls.map((w: { compass: string }) => w.compass).sort()).toEqual(['east','north','south','west']);
    expect(data.items).toHaveLength(4);
    expect(data.items.find((i: { id: string }) => i.id === 'bed').keep).toBe(true);
    expect(data.openings.find((o: { id: string }) => o.id === 'door').swing).toBe('inward-left');
    const invalid = await client.callTool({ name: 'scene_summary', arguments: { room_ids: ['missing'] } });
    expect(invalid.isError).toBe(true);
    const pending = await client.callTool({ name: 'ask', arguments: {} });
    expect(pending.isError).toBe(true);
    expect(JSON.stringify(pending.content)).toContain('question');
  } finally { await client.close(); await transport.close(); }
}, 20000);
