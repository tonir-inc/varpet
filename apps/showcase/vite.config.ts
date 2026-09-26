import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecords, planFile } from './server/data.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(root, '../../packages/designer/eval/komitas');
const plans = process.env.KOMITAS_PLANS_DIR ?? resolve(homedir(), 'AshProjects/tonir/apartment/komitas-park/data/plans');
const moduleId = '\0virtual:showcase-data';
function localPlans(server) {
  server.middlewares.use(async (req, res, next) => {
    const match = /^\/plans\/([a-zA-Z0-9_-]+)$/.exec((req.url ?? '').split('?')[0]);
    if (!match) return next();
    const path = await planFile(plans, match[1]);
    if (!path) { res.statusCode = 404; res.end('Plan not available on this device.'); return; }
    try { res.setHeader('Content-Type', extname(path) === '.png' ? 'image/png' : 'image/jpeg'); res.setHeader('Cache-Control', 'private, no-store'); res.end(await readFile(path)); }
    catch { res.statusCode = 404; res.end('Plan unavailable.'); }
  });
}
export default defineConfig({
  publicDir: '../editor/public',
  plugins: [{ name: 'showcase-records',
    resolveId(id) { if (id === 'virtual:showcase-data') return moduleId; },
    async load(id) { if (id === moduleId) return `export default ${JSON.stringify(await loadRecords(dataDir))}`; },
    configureServer(server) {
      localPlans(server); server.watcher.add(dataDir);
      server.watcher.on('all', (_event, path) => { if (path.startsWith(dataDir)) { const module = server.moduleGraph.getModuleById(moduleId); if (module) server.moduleGraph.invalidateModule(module); server.ws.send({ type: 'full-reload' }); } });
    },
    configurePreviewServer: localPlans,
  }],
  server: { fs: { allow: [resolve(root, '../..')] } },
});
