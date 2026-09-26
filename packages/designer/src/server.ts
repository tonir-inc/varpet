import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { parseScene, sceneSummary } from './adapter.js';
import type { Scene } from './scene.js';
import { sun } from './metrics/sun.js';
import { spaceMetrics } from './metrics/space.js';

export function result(data: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data) }], ...(isError ? { isError: true } : {}) };
}

export function createServer(input: Scene) {
  const scene = parseScene(input);
  const server = new McpServer({ name: 'varpet-designer', version: '0.0.0' });
  server.registerTool('scene_summary', {
    description: 'Rooms, walls with compass directions, openings, furniture, keeps and fixed items. An empty room_ids selects none.',
    inputSchema: { room_ids: z.array(z.string()).optional() },
  }, ({ room_ids }) => {
    try {
      const summary = sceneSummary(scene, room_ids);
      const selected = new Set(summary.rooms.map(room=>room.id));
      return result({ ...summary, metrics: spaceMetrics({ ...scene, rooms: summary.rooms, walls: scene.walls.filter(w=>selected.has(w.room_id)), openings: summary.openings, items: summary.items, fixed: summary.fixed }) });
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
  for (const name of ['set_intent','search_catalog','place','check_layout','score_layout','propose','ask']) {
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
