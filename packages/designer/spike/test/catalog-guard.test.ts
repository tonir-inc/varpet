import { expect, test, vi } from 'vitest';

// The spike's ./varpet search reads the shared catalog through createHttpCatalogQuery; the records below are real
// shapes (2026-10-03: a 6 mm outdoor rug and a cooker hood broke Styled previews).
vi.mock('../../src/catalog.js', async original => ({
  ...(await original<typeof import('../../src/catalog.js')>()),
  createHttpCatalogQuery: () => async () => ({ results: [
    { id: 'extra:bpy-balcony:striped-outdoor-rug-120x180', kind: 'rug', name: 'Striped polypropylene outdoor rug, balcony, 120 x 180 cm', size_m: [1.2, 1.8, 0.006], price: 32000, source: 'extra' },
    { id: 'extra:bpy-kitchen:hood', kind: 'range_hood', name: 'Chimney cooker hood 60 cm, stainless', size_m: [0.6, 0.5, 0.8], price: 90000, source: 'extra' },
    { id: 'extra:bpy-rugs:jute', kind: 'rug', name: 'Jute rug 160 x 230 cm', size_m: [1.6, 2.3, 0.01], price: 60000, source: 'extra' },
  ] }),
}));
const { search } = await import('../lib/catalog.js');

test('./varpet search never offers what the editor would refuse: a 6 mm rug or a piece only the editor mounts', async () => {
  expect((await search({ kind: 'rug', limit: 10 })).map(product => product.sku)).toEqual(['extra:bpy-rugs:jute']);
});
