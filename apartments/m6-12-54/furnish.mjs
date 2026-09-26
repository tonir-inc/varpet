import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { localCatalog } from '../../apps/editor/src/core/demo.ts';

// Re-read the shell every run; never import trace.mjs (it writes files).
const shell = JSON.parse(readFileSync(new URL('scene.json', import.meta.url), 'utf8'));
const scene = structuredClone(shell);
const origin = [635, 575], metresPerPixel = 1 / 97;
const catalog = new Map(localCatalog.map(asset => [asset.id, asset]));
const round = n => Number(n.toFixed(6));
const position = (x, y, elevation = 0) => [round((x - origin[0]) * metresPerPixel), elevation, round((y - origin[1]) * metresPerPixel)];
const sourceId = 'source-m6-plan';
const counts = new Map();
const sourceRegion = (x, y, width, depth, rotation) => {
  const dx = Math.abs(Math.cos(rotation)) * width + Math.abs(Math.sin(rotation)) * depth;
  const dy = Math.abs(Math.sin(rotation)) * width + Math.abs(Math.cos(rotation)) * depth;
  return { sourceId, x: (x - dx / 2) / 1280, y: (y - dy / 2) / 1192, width: dx / 1280, height: dy / 1192 };
};
function evidence(id, name, roomId, x, y, width, depth, height, rotation, notes) {
  counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
  scene.project.metadata[id] = {
    name, phase: 'existing', locked: false, review: 'required',
    notes: `Printed furnishing interpretation in ${roomId}. ${notes} Footprint, height, finish and catalog model are approximate; this is not a procurement specification.`,
  };
  scene.project.assumptions.push({
    id: `assumption-${id}-furnishing`, entityId: id, property: 'furnishing',
    value: `${round(width * metresPerPixel)} × ${round(depth * metresPerPixel)} m footprint; ${height} m assumed height`,
    status: 'unresolved', sourceKind: 'inferred', sourceIds: [sourceId],
    rationale: `Raster footprint at ${round(1 / metresPerPixel)} px/m; ordinary visualization height. ${notes}`,
    alternatives: [], question: 'Confirm the item, dimensions, finish and placement from a clearer plan or site measurements.',
    sourceRegion: sourceRegion(x, y, width, depth, rotation),
  });
}
// Width/depth follow the local object's front/back axes; positive Y rotation
// turns a south-facing item toward plan-right. Coordinates remain source pixels.
function furniture(id, assetId, name, roomId, x, y, width, depth, height, rotation = 0, notes = '', color) {
  const asset = catalog.get(assetId);
  assert.ok(asset, `Missing localCatalog asset ${assetId}`);
  const dimensions = [width * metresPerPixel, height, depth * metresPerPixel];
  scene.objects.push({
    id, assetId, name, position: position(x, y), rotation,
    scale: dimensions.map((size, index) => round(size / asset.dimensions[index])),
    ...(color ? { color } : {}),
  });
  evidence(id, name, roomId, x, y, width, depth, height, rotation, notes);
}
function fixture(id, kind, name, roomId, x, y, width, depth, height, rotation = 0, notes = '', elevation = 0, color = '#e3dacb') {
  scene.project.components.push({
    id, kind, name, roomId, position: position(x, y, elevation),
    dimensions: [round(width * metresPerPixel), height, round(depth * metresPerPixel)], rotation, color,
    phase: 'existing', price: 0, notes,
  });
  evidence(id, name, roomId, x, y, width, depth, height, rotation, notes);
}

// Bathroom: the north rectangle is interpreted as a shower, the small
// southwest rectangle as laundry/storage. The image does not identify it.
fixture('bath-shower', 'shower', 'Bathroom · shower interpretation', 'room-bathroom', 145, 309, 120, 66, 2.05, 0,
  'North rectangular wet area; shower versus bath is uncertain.');
fixture('bath-toilet', 'toilet', 'Bathroom · WC', 'room-bathroom', 111, 383, 45, 58, 0.76, Math.PI / 2,
  'WC symbol against west wall, facing into room.');
fixture('bath-basin', 'sink', 'Bathroom · washbasin', 'room-bathroom', 105, 454, 52, 42, 0.84, Math.PI / 2,
  'Small basin at west wall; generic vanity representation.');
fixture('bath-laundry', 'appliance', 'Bathroom · laundry/storage interpretation', 'room-bathroom', 110, 516, 51, 50, 0.86, Math.PI / 2,
  'Faint southwest rectangular symbol; generic appliance proxy, not confirmed as a washing machine.');

// Galley kitchen: north sink / preparation / cooker / end unit and south run.
fixture('kitchen-sink', 'sink', 'Kitchen · sink unit', 'room-kitchen', 454, 317, 81, 56, 0.90, 0,
  'Sink and drainer symbol; current sink model has one basin.');
fixture('kitchen-north-prep', 'cabinet', 'Kitchen · preparation unit', 'room-kitchen', 524, 317, 52, 56, 0.90);
fixture('kitchen-cooker', 'appliance', 'Kitchen · cooker/oven', 'room-kitchen', 592, 317, 79, 56, 0.90, 0,
  'Four-ring cooker symbol; generic oven proxy.');
fixture('kitchen-hob', 'worktop', 'Kitchen · hob surface', 'room-kitchen', 592, 317, 73, 51, 0.015, 0,
  'Hob shown as a dark worktop slab; no burner geometry exists in the current component renderer.', 0.90, '#484b49');
fixture('kitchen-north-end', 'cabinet', 'Kitchen · north end unit', 'room-kitchen', 654, 317, 41, 56, 0.90);
fixture('kitchen-south-west', 'cabinet', 'Kitchen · south west unit', 'room-kitchen', 425, 487, 68, 53, 0.90, Math.PI);
fixture('kitchen-south-middle', 'cabinet', 'Kitchen · south worktop run', 'room-kitchen', 535, 487, 148, 53, 0.90, Math.PI,
  'Faint long rectangle interpreted as continuous lower cabinetry, not an island.');
fixture('kitchen-south-east', 'cabinet', 'Kitchen · south east unit', 'room-kitchen', 638, 487, 54, 53, 0.90, Math.PI);

// Bedroom 1: headboard on west wall, two nightstands, alcove wardrobe.
furniture('bedroom-large-bed', 'bed-linen', 'Bedroom 1 · double bed', 'room-bedroom-large', 181, 868, 184, 196, 0.67, Math.PI / 2,
  'Headboard at west wall; feet point toward the room.');
furniture('bedroom-large-nightstand-north', 'nightstand', 'Bedroom 1 · north nightstand', 'room-bedroom-large', 106, 744, 48, 49, 0.50, Math.PI / 2);
furniture('bedroom-large-nightstand-south', 'nightstand', 'Bedroom 1 · south nightstand', 'room-bedroom-large', 105, 989, 45, 48, 0.50, Math.PI / 2);
furniture('bedroom-large-wardrobe', 'wardrobe', 'Bedroom 1 · alcove wardrobe', 'room-bedroom-large', 145, 606, 119, 76, 2.05, 0,
  'Faint rectangular storage symbol in the north alcove.');

// Bedroom 2 reverses the bed: headboard east, feet west.
furniture('bedroom-small-bed', 'bed-linen', 'Bedroom 2 · double bed', 'room-bedroom-small', 562, 742, 180, 200, 0.67, -Math.PI / 2,
  'Headboard at east wall; feet point west.');
furniture('bedroom-small-nightstand-north', 'nightstand', 'Bedroom 2 · north nightstand', 'room-bedroom-small', 642, 622, 49, 42, 0.50, -Math.PI / 2);
furniture('bedroom-small-nightstand-south', 'nightstand', 'Bedroom 2 · south nightstand', 'room-bedroom-small', 642, 861, 48, 42, 0.50, -Math.PI / 2);
furniture('bedroom-small-wardrobe', 'wardrobe', 'Bedroom 2 · north wardrobe', 'room-bedroom-small', 586, 567, 150, 51, 2.05, 0);

// Eight dining seats are visible, including both end chairs. The chairs are
// tucked under the printed table, so footprint overlaps are deliberately kept.
furniture('dining-table', 'table-dining', 'Living · eight-seat dining table', 'room-living', 841, 357, 164, 86, 0.75, 0);
for (const [index, x] of [792, 843, 894].entries()) {
  furniture(`dining-chair-north-${index + 1}`, 'chair-dining', `Dining · north chair ${index + 1}`, 'room-living', x, 313, 45, 49, 0.80, 0,
    'Chair tucked beneath tabletop in the printed plan.');
  furniture(`dining-chair-south-${index + 1}`, 'chair-dining', `Dining · south chair ${index + 1}`, 'room-living', x, 396, 45, 49, 0.80, Math.PI,
    'Chair tucked beneath tabletop in the printed plan.');
}
furniture('dining-chair-west', 'chair-dining', 'Dining · west end chair', 'room-living', 741, 358, 45, 49, 0.80, Math.PI / 2);
furniture('dining-chair-east', 'chair-dining', 'Dining · east end chair', 'room-living', 943, 358, 45, 49, 0.80, -Math.PI / 2);

// Large title obscures part of this seating group. Preserve the visible layout
// and attach the uncertainty to each obscured piece rather than redesigning it.
furniture('living-sofa', 'sofa-sage', 'Living · sofa facing east', 'room-living', 727, 707, 205, 76, 0.82, Math.PI / 2,
  'West-side sofa is partly obscured by the large apartment label.');
furniture('living-armchair-north', 'chair-clay', 'Living · north armchair', 'room-living', 829, 565, 92, 80, 0.80, 0,
  'Generic chair proxy for the upholstered armchair outline.');
furniture('living-armchair-south', 'chair-clay', 'Living · south armchair', 'room-living', 829, 842, 89, 82, 0.80, Math.PI,
  'Generic chair proxy for the upholstered armchair outline.');
furniture('living-side-table-north', 'table-coffee', 'Living · north side table', 'room-living', 718, 550, 62, 63, 0.48, 0,
  'Round symbol represented by a square table; current catalog has rectangular tables.');
furniture('living-side-table-south', 'table-coffee', 'Living · south side table', 'room-living', 719, 856, 61, 62, 0.48, 0,
  'Round symbol represented by a square table; current catalog has rectangular tables.');
furniture('living-coffee-table', 'table-coffee', 'Living · coffee table', 'room-living', 822, 711, 91, 44, 0.38, Math.PI / 2,
  'Thin rectangular symbol is heavily obscured by the title; approximate position and extent.');
furniture('living-media-console', 'console-oak', 'Living · east media console', 'room-living', 976, 754, 212, 30, 0.52, -Math.PI / 2,
  'Thin east-wall media/storage outline; exact television screen is omitted because it has no catalog model.');
furniture('living-plant', 'plant-small', 'Living · east plant', 'room-living', 977, 602, 40, 44, 0.90, 0,
  'Plant symbol beside the east wall; botanical species is not specified.');

// East balcony: two chairs facing a small round table, two plants, end bench.
furniture('balcony-east-table', 'table-coffee', 'East balcony · small table', 'room-balcony-east', 1145, 422, 53, 53, 0.58, 0,
  'Round table approximated by the rectangular local table model.');
furniture('balcony-east-chair-north', 'chair-dining', 'East balcony · north chair', 'room-balcony-east', 1100, 378, 58, 58, 0.80, Math.PI / 4,
  'Round outdoor chair symbol approximated by a dining chair oriented toward the table.');
furniture('balcony-east-chair-south', 'chair-dining', 'East balcony · south chair', 'room-balcony-east', 1100, 468, 58, 58, 0.80, 3 * Math.PI / 4,
  'Round outdoor chair symbol approximated by a dining chair oriented toward the table.');
furniture('balcony-east-plant-north', 'plant-small', 'East balcony · north plant', 'room-balcony-east', 1150, 352, 38, 40, 0.75);
furniture('balcony-east-plant-south', 'plant-small', 'East balcony · south plant', 'room-balcony-east', 1157, 487, 34, 40, 0.75);
furniture('balcony-east-bench', 'console-oak', 'East balcony · end bench/storage', 'room-balcony-east', 1119, 552, 117, 35, 0.45, Math.PI,
  'Striped end rectangle interpreted as a low bench/storage; may instead be a planter or service element.');

// Shared south balcony: two chairs and table, plants, east end bench.
furniture('balcony-south-table', 'table-coffee', 'South balcony · small table', 'room-balcony-south', 560, 1024, 47, 47, 0.58, 0,
  'Faint central table between the two chairs; round footprint approximated by a square.');
furniture('balcony-south-chair-west', 'chair-dining', 'South balcony · west chair', 'room-balcony-south', 517, 987, 58, 56, 0.80, Math.PI / 4,
  'Round outdoor chair symbol approximated by the dining chair model.');
furniture('balcony-south-chair-east', 'chair-dining', 'South balcony · east chair', 'room-balcony-south', 603, 987, 58, 56, 0.80, -Math.PI / 4,
  'Round outdoor chair symbol approximated by the dining chair model.');
furniture('balcony-south-plant-west', 'plant-small', 'South balcony · west plant', 'room-balcony-south', 474, 1046, 42, 40, 0.75);
furniture('balcony-south-plant-east', 'plant-small', 'South balcony · east plant', 'room-balcony-south', 567, 1056, 38, 25, 0.65,
  0, 'Low planter symbol; species and height are unknown.');
furniture('balcony-south-bench', 'console-oak', 'South balcony · end bench/storage', 'room-balcony-south', 671, 1008, 116, 33, 0.45, -Math.PI / 2,
  'Striped east rectangle interpreted as a low bench/storage; may instead be a planter or service element.');

scene.project.assumptions.push({
  id: 'assumption-furnished-variant', entityId: 'room-living', property: 'furnished-variant',
  value: 'Separate approximate interpretation of the printed furniture, on the unchanged shell',
  status: 'unresolved', sourceKind: 'inferred', sourceIds: [sourceId],
  rationale: 'The inherited empty-shell furniture note describes scene.json. This scene.furnished.json adds the visible furnishing layout. Printed furniture is illustrative; shape, materials, heights, prices and partly obscured symbols are not verified. The entrance hall has no legible furniture and remains empty.',
  alternatives: [], question: 'Review the shell and ambiguous furnishings before treating this as a design proposal.',
});

// Structural geometry and every existing evidence/metadata entry remain byte-
// equivalent as JSON values. Future shell fixes are picked up on regeneration.
assert.deepEqual(scene.rooms, shell.rooms);
assert.deepEqual(scene.walls, shell.walls);
assert.deepEqual(scene.project.sources, shell.project.sources);
assert.deepEqual(scene.project.assumptions.slice(0, shell.project.assumptions.length), shell.project.assumptions);
for (const [id, value] of Object.entries(shell.project.metadata)) assert.deepEqual(scene.project.metadata[id], value);
assert.deepEqual(scene.project.components.slice(0, shell.project.components.length), shell.project.components);
writeFileSync(new URL('scene.furnished.json', import.meta.url), `${JSON.stringify(scene, null, 2)}\n`);
console.log(`Furnished variant: ${scene.objects.length - shell.objects.length} furniture objects and ${scene.project.components.length - shell.project.components.length} fixture components added; shell/evidence unchanged.`);
console.log(Object.fromEntries(counts));
