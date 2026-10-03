import { expect, test } from 'vitest';
import { searchCatalog, type CatalogQuery } from '../src/catalog.js';

// Real names from the catalog (2026-10-03): placeable in search for the editor, which mounts them; the designer cannot.
const row = (id: string, kind: string, name: string, source: string) => ({ id, kind, name, source, size_m: [.6, .5, .8], price: 100000, currency: 'AMD' });

test('the designer is never offered the wall fittings or the newly placeable wall and ceiling lamps it cannot mount', async () => {
  const query: CatalogQuery = async () => ({ results: [
    row('hood', 'range_hood', 'Chimney cooker hood 60 cm, stainless', 'extra'),
    row('heater', 'water_heater', 'Slim electric water heater 50 L, white, wall-hung', 'extra'),
    row('rail', 'towel_rail', 'Chrome ladder towel rail, 50 x 80 cm, wall-mounted', 'extra'),
    row('sconce', 'lamp', 'Oak paper-cone sconce', 'extra'),
    row('flush', 'lamp', 'Flush ceiling light, opal glass 35 cm', 'extra'),
    row('pendant', 'lamp', 'Pendant light, opal glass globe 30 cm', 'extra'),
    row('table', 'lamp', 'Opal glass mushroom table lamp', 'extra'),
    row('abo-pendant', 'lamp', 'Amazon Basics Pendant Lamp - 15.7" x 15.7" x 60", Matte Black', 'abo'),
  ] });
  const result = await searchCatalog({ limit: 20 }, query);
  expect(result.results.map(product => product.sku)).toEqual(['table', 'abo-pendant']);
  expect(result.excluded_records).toBe(6);
});

test('the designer is never offered a product the editor rejects for its size (a 6 mm outdoor rug)', async () => {
  const query: CatalogQuery = async () => ({ results: [
    { ...row('thin-rug', 'rug', 'Striped polypropylene outdoor rug, balcony, 120 x 180 cm', 'extra'), size_m: [1.2, 1.8, 0.006] },
    { ...row('rug', 'rug', 'Jute rug 160 x 230 cm', 'extra'), size_m: [1.6, 2.3, 0.01] },
  ] });
  const result = await searchCatalog({ limit: 20 }, query);
  expect(result.results.map(product => product.sku)).toEqual(['rug']);
});
