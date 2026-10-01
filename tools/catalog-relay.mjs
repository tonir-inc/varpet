// Local stand-in for the tailnet catalog (mc-server:8765), for laptops off the tailnet. Run from the repo root:
//   node tools/catalog-relay.mjs                      (port 8766)
//   VARPET_CATALOG_URL=http://127.0.0.1:8766/mcp npx vite --port 5191               (in apps/editor)
//   VARPET_CATALOG_URL=http://127.0.0.1:8766/mcp uv run python designer_service.py  (in harness)
//   /models/X.glb  -> the deployed app's public model relay
//   /mcp           -> MCP tools search_furniture, get_item, list_vocab answered from the deployed app's HTTP catalog API
// Read-only; find_similar and check_fit report themselves unavailable.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
const NM = new URL('../packages/designer/node_modules/', import.meta.url).href;
const { McpServer } = await import(NM + '@modelcontextprotocol/sdk/dist/esm/server/mcp.js');
const { StreamableHTTPServerTransport } = await import(NM + '@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js');
const { z } = await import(NM + 'zod/index.js');

const APP = 'https://varpet.snek.page/api/catalog/';
const getJson = async path => { const r = await fetch(APP + path); if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json(); };
const reply = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
const any = z.any().optional();

function server() {
  const s = new McpServer({ name: 'varpet-catalog-local', version: '1' });
  s.registerTool('search_furniture', { description: 'Search furniture', inputSchema: {
    text: any, query: any, kind: any, limit: any, offset: any, max_w: any, max_d: any, max_h: any, min_w: any, min_d: any, min_h: any,
    max_price: any, colors: any, styles: any, materials: any, room: any } }, async args => {
    const text = String(args.text ?? args.query ?? ''), kind = args.kind ? String(args.kind) : '';
    const limit = Number(args.limit) || 10, rows = [];
    let offset = Number(args.offset) || 0;
    for (let page = 0; page < 4 && offset !== null && rows.length < limit; page++) {
      const data = await getJson(`search?${new URLSearchParams({ text, kind, ...(offset ? { offset: String(offset) } : {}) })}`);
      for (const r of data.results ?? []) {
        const [w, d, h] = r.fit_size_m ?? r.size_m ?? [0, 0, 0];
        if ((args.max_w && w > args.max_w) || (args.max_d && d > args.max_d) || (args.max_h && h > args.max_h)
          || (args.min_w && w < args.min_w) || (args.min_d && d < args.min_d) || (args.min_h && h < args.min_h)
          || (args.max_price && r.price > args.max_price)) continue;
        rows.push(r);
      }
      offset = typeof data.next_offset === 'number' ? data.next_offset : null;
    }
    return reply({ results: rows.slice(0, limit), total: rows.length });
  });
  s.registerTool('get_item', { description: 'One item', inputSchema: { item_id: z.string() } }, async ({ item_id }) => {
    const data = await getJson(`items?${new URLSearchParams({ ids: item_id })}`);
    return reply(data.results?.[0] ?? { error: `No item ${item_id}` });
  });
  s.registerTool('list_vocab', { description: 'Vocabulary', inputSchema: {} }, async () => reply(await getJson('vocab')));
  for (const name of ['find_similar', 'check_fit'])
    s.registerTool(name, { description: name, inputSchema: { item_id: any } }, async () => reply({ error: `${name} is not available off the tailnet` }));
  return s;
}

createServer(async (req, res) => {
  const url = req.url ?? '';
  const m = /^\/models\/([A-Za-z0-9_-]{1,120}\.glb)$/.exec(url);
  if (m) {
    try {
      const up = await fetch('https://varpet.snek.page/api/catalog/models/' + m[1]);
      if (!up.ok || !up.body) { res.writeHead(up.status === 404 ? 404 : 502); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
      return Readable.fromWeb(up.body).pipe(res);
    } catch { res.writeHead(502); return res.end(); }
  }
  if (url.startsWith('/mcp')) {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const s = server();
    res.on('close', () => { transport.close(); s.close(); });
    await s.connect(transport);
    return transport.handleRequest(req, res, body);
  }
  res.writeHead(404); res.end();
}).listen(8766, '127.0.0.1', () => console.log('catalog relay on 8766 (/models, /mcp)'));
