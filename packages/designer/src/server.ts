import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { opsSchema, parseScene, sceneSummary } from './adapter.js';
import type { Scene } from './scene.js';
import { sun } from './metrics/sun.js';
import { spaceMetrics } from './metrics/space.js';
import { place, placeInputSchema } from './place.js';
import { checkLayout, scoreLayout } from './layout.js';
import { intentSchema } from './request.js';
import { DesignerSession } from './session.js';

export function result(data: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data) }], ...(isError ? { isError: true } : {}) };
}

export function createServer(input: Scene) {
  const scene = parseScene(input);
  const session = new DesignerSession(scene);
  const server = new McpServer({ name: 'varpet-designer', version: '0.0.0' });
  server.registerTool('scene_summary', {
    description: 'Rooms, walls with compass directions, openings, furniture, keeps and fixed items. An empty room_ids selects none.',
    inputSchema: { room_ids: z.array(z.string()).optional() },
  }, ({ room_ids }) => {
    try {
      const summary = sceneSummary(scene, room_ids);
      const selected = new Set(summary.rooms.map(room=>room.id));
      // Neighboring walls may own doors that swing into a selected room.
      const rooms = selected.size ? spaceMetrics(scene).rooms.filter(room=>selected.has(room.room_id)) : [];
      const free_area_m2 = Math.round(rooms.reduce((sum,room)=>sum+room.free_area_m2,0)*1e10)/1e10;
      return result({ ...summary, metrics: {rooms,free_area_m2} });
    }
    catch (error) { return result(String(error), true); }
  });
  server.registerTool('sun', {
    description: 'Direct sun and floor patches over Yerevan in UTC+4. Missing north is unknown. Defaults to the four 2026 seasonal dates; no current-clock assumptions.',
    inputSchema: {
      room_id: z.string().optional(), window_id: z.string().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hours: z.array(z.number().finite().min(0).max(24)).max(48).optional(),
    },
  }, options => {
    try { return result(sun(scene,options)); }
    catch (error) { return result(String(error),true); }
  });
  server.registerTool('place', {
    description: 'Find up to three checked poses from spatial relations, with clearances. Accepts existing item IDs or a sized item description; no raw pose input. Returns preview ops without changing the scene.',
    inputSchema: placeInputSchema,
  }, request => {
    try { return result(place(scene,request)); }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('set_intent', {
    description: 'Store the request: room, kinds and counts to add/remove/move, kept items, optional dram budget and geometric preferences. Empty add/remove means rearrange existing furniture only.',
    inputSchema: intentSchema,
  }, intent => {
    try { return result(session.setIntent(intent)); }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('check_layout', {
    description: 'Apply preview ops to a copy and return hard errors before soft guidance, coordinates, overlap depths and incremental purchase price. Reports engine checks unavailable while using the temporary scene adapter.',
    inputSchema: {ops:opsSchema},
  }, ({ops}) => {
    try { const check=checkLayout(scene,ops);return result(check,!check.ok); }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('score_layout', {
    description: 'Compare before/after open floor, largest rectangle, circulation, potential window sunlight, function clearances and incremental cost. Pure rearranges cost zero; missing north or prices stay unknown.',
    inputSchema: {ops:opsSchema},
  }, ({ops}) => {
    try { return result(scoreLayout(scene,ops)); }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('propose', {
    description: 'Store a checked proposal for user review. Refuses failed physical checks or unmet intent. Returns a proposal ID and score without changing or applying the scene; explicit user acceptance remains required.',
    inputSchema: {ops:opsSchema,rationale:z.string().min(1).max(4000)},
  }, ({ops,rationale}) => {
    const proposal=session.propose(ops,rationale);
    return result(proposal,!proposal.ok);
  });
  for (const name of ['search_catalog','ask']) {
    server.registerTool(name, { description: `${name}: not implemented yet`, inputSchema: {} }, () => result(`${name}: not implemented yet`, true));
  }
  return server;
}

async function main() {
  const sceneArg = process.argv.indexOf('--scene');
  const scenePath = sceneArg >= 0 ? process.argv[sceneArg+1] : process.env.VARPET_SCENE;
  if (!scenePath) throw new Error('Supply --scene /absolute/path/to/scene.json or VARPET_SCENE');
  const scene = parseScene(JSON.parse(await readFile(scenePath,'utf8')));
  await createServer(scene).connect(new StdioServerTransport());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
