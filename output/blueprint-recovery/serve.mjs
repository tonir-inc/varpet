import { createServer } from '../../apps/editor/node_modules/vite/dist/node/index.js';
let failMain = true;
const server = await createServer({
  root: new URL('../../apps/editor/', import.meta.url).pathname,
  configFile: false,
  cacheDir: `/tmp/varpet-recovery-vite-${process.pid}`,
  server: { host: '127.0.0.1', port: 5198, strictPort: true, hmr: false, fs: { allow: [new URL('../../', import.meta.url).pathname] } },
  plugins: [{ name: 'blueprint-import-failure-proof', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] === '/src/main.ts') console.log('main requested, fail:', failMain);
      if (req.url?.split('?')[0] === '/src/main.ts' && failMain) {
        failMain = false; res.writeHead(503, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'}); res.end('Intentional one-time editor load failure'); return;
      }
      if (req.url?.startsWith('/api/')) { res.writeHead(503, {'Content-Type': 'application/json'}); res.end('{"error":"Offline verification"}'); return; }
      next();
    });
  }}],
});
await server.listen();
console.log('Recovery verification: http://127.0.0.1:5198/?blueprintTest=complete');
