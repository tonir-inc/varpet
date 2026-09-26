import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecords } from '../showcase/server/data.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.env.BUYER_DATA_DIR ?? resolve(root, '../../packages/designer/eval/komitas');
const moduleId = '\0virtual:buyer-flats';
// Komitas flats come from the same committed scene files the showcase reads; plans are never loaded here.
export default defineConfig({
  plugins: [{ name: 'buyer-flats',
    resolveId(id) { if (id === 'virtual:buyer-flats') return moduleId; },
    async load(id) { if (id === moduleId) return `export default ${JSON.stringify(await loadRecords(dataDir))}`; },
  }],
  server: { fs: { allow: [resolve(root, '../..')] } },
});
