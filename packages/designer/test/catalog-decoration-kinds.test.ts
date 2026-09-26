import {expect, test} from 'vitest';
import {editorKindOf} from '../src/editor-bridge.js';
import {compatibleProduct} from '../src/catalog-acceleration.js';

const decorations = ['vase', 'candle', 'sculpture', 'books', 'cushion', 'throw_blanket',
  'basket', 'tray', 'bowl', 'lantern', 'picture_frame', 'toy', 'planter'];
test.each(decorations)('%s maps to decor', kind => {
  expect(editorKindOf[kind]).toBe('decor');
});
test.each(['clock', 'wall_hanging'])('%s maps to wall_art', kind => {
  expect(editorKindOf[kind]).toBe('wall_art');
});
test('native decoration kinds and plant retain identity; curtain has no mapping', () => {
  for (const kind of ['decor', 'wall_art', 'mirror', 'plant', 'curtain']) {
    expect(editorKindOf[kind]).toBeUndefined();
  }
});
test.each([...decorations, 'clock', 'wall_hanging', 'decor', 'wall_art', 'mirror', 'plant'])(
  '%s matches its editor asset with exact dimensions and price', kind => {
    const row = {id: 'extra:decor:model', kind, size_m: [.2, .3, .4], price: 100, currency: 'AMD'};
    // The incoming catalog is an external boundary; this also runs before the editor kind lane lands.
    const asset = {id: row.id, kind: editorKindOf[kind] ?? kind, dimensions: [.2, .4, .3], price: 100};
    expect(compatibleProduct(row, [asset] as unknown as Parameters<typeof compatibleProduct>[1])).toBe(true);
    expect(compatibleProduct({...row, price: 101}, [asset] as unknown as Parameters<typeof compatibleProduct>[1])).toBe(false);
  },
);
