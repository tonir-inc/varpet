// UI-only recorded HTTP service: node apps/editor/tests/designer-panel-service.mjs [port]
// Pair with: VITE_DESIGNER_URL=http://127.0.0.1:8789 pnpm dev
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-replay-'));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  ssr: join(root, 'src/ui/designer-panel.ts'), target: 'node22', outDir: output,
  minify: false, rolldownOptions: { output: { entryFileNames: 'panel.mjs' } },
} });
const { createRecordedDesigner } = await import(pathToFileURL(join(output, 'panel.mjs')));
const ask = createRecordedDesigner(1200);
const port = Number(process.argv[2] ?? 8789);
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.url === '/designer/health') { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true,"recorded":true}'); return; }
  if (req.method !== 'POST' || req.url !== '/designer/propose') { res.writeHead(404).end(); return; }
  const controller = new AbortController(); res.on('close', () => controller.abort());
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4_000_000) throw new Error('Request too large'); }
    const request = JSON.parse(body);
    res.setHeader('Content-Type', 'application/x-ndjson'); res.flushHeaders();
    const started = performance.now();
    const reply = await ask(request, { signal: controller.signal,
      onProgress: message => res.write(`${JSON.stringify({ type: 'progress', message })}\n`) });
    res.end(`${JSON.stringify(reply)}\n`);
    console.log(`${reply.type} ${(performance.now() - started).toFixed(0)}ms`);
  } catch (error) {
    if (controller.signal.aborted) { console.log('cancelled'); return; }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.end(`${JSON.stringify({ type: 'error', message: String(error) })}\n`);
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Recorded designer service: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.closeAllConnections(); server.close(async () => { await rm(output, { recursive: true }); process.exit(); });
});
