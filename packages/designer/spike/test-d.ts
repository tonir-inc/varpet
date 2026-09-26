/** Owner D manual check: search + a sheet, read the PNG to confirm it renders. Not a test suite. */
import { search, productSheet } from './lib/catalog.js';

const t0 = Date.now();
const sofas = await search({ kind: 'sofa', text: 'japandi light oak', limit: 8 });
console.log(`sofa search: ${Date.now() - t0}ms, ${sofas.length} results`);
console.log(sofas.slice(0, 3));

const t1 = Date.now();
const beds = await search({ kind: 'bed', maxW: 1.7, limit: 8 });
console.log(`bed search: ${Date.now() - t1}ms, ${beds.length} results`);
for (const b of beds) if (b.size[0] > 1.7) throw new Error(`bed ${b.sku} width ${b.size[0]} exceeds 1.7m`);
console.log(beds.slice(0, 3));

const skus = [...sofas, ...beds].slice(0, 8).map(p => p.sku);
const t2 = Date.now();
const outPng = new URL('./sheet-test.png', import.meta.url).pathname;
await productSheet(skus, outPng);
console.log(`sheet: ${Date.now() - t2}ms -> ${outPng}`);
