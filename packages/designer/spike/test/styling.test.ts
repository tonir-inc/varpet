import { describe, expect, test } from 'vitest';
import type { Scene } from '../../src/scene.js';
import type { Draft, DraftItem } from '../lib/finishes.js';
import { atWindow, onWall } from '../lib/scene.js';
import { roomTypes, styling } from '../lib/styling.js';

/** An 8 x 6 m living room (window in the bottom wall, door in the top wall) and a 4 x 4 m bedroom to its right. */
function scene(names: [string, string] = ['Living room', 'Bedroom']): Scene {
  const wall = (id: string, room_id: string, a: [number, number], b: [number, number]) => ({ id, room_id, a, b, thickness: 0.1, height: 2.7 });
  return {
    rooms: [{ id: 'liv', name: names[0], polygon: [[0, 0], [8, 0], [8, 6], [0, 6]] }, { id: 'bed', name: names[1], polygon: [[8, 0], [12, 0], [12, 4], [8, 4]] }],
    walls: [wall('s', 'liv', [0, 0], [8, 0]), wall('e', 'liv', [8, 0], [8, 6]), wall('n', 'liv', [8, 6], [0, 6]), wall('w', 'liv', [0, 6], [0, 0]),
      wall('bs', 'bed', [8, 0], [12, 0]), wall('be', 'bed', [12, 0], [12, 4]), wall('bn', 'bed', [12, 4], [8, 4]), wall('bw', 'bed', [8, 4], [8, 0])],
    openings: [{ id: 'win', wall_id: 's', kind: 'window', offset: 3, width: 1.5, height: 1.4, sill: 0.9 },
      { id: 'door', wall_id: 'n', kind: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0, swing: 'none' },
      { id: 'bwin', wall_id: 'be', kind: 'window', offset: 1.4, width: 1.2, height: 1.4, sill: 0.9 }],
    items: [], fixed: [],
  } as unknown as Scene;
}
const item = (id: string, kind: string, pos: [number, number], rot: number, size: [number, number, number], extra: Partial<DraftItem> = {}): DraftItem =>
  ({ id, room_id: 'liv', kind, name: `${kind} ${id}`, pos, rot, size, keep: false, price: 1, ...extra });
const small = (id: string, kind: string, on: string, pos: [number, number], name = kind) => item(id, kind, pos, 0, [0.3, 0.3, 0.2], { on, name });

/** A styled living room: every living minimum met. */
function styled(s: Scene): Draft {
  const items = [
    item('sofa', 'sofa', [3.5, 5.5], 0, [2.2, 0.9, 0.85]),
    item('coffee', 'table', [3.5, 4.33], 0, [1.1, 0.6, 0.42], { name: 'Oak coffee table' }),
    item('rug', 'rug', [3.5, 4.3], 0, [2.6, 2.0, 0.01]),
    item('lamp', 'lamp', [2.05, 5.6], 0, [0.4, 0.4, 1.55], { name: 'Floor lamp' }),
    item('sideboard', 'cabinet', [6.5, 5.7], 0, [1.4, 0.45, 0.8], { name: 'Walnut sideboard' }),
    small('c1', 'cushion', 'sofa', [3, 5.6], 'Cushion set of three: sage linen'), small('t1', 'throw_blanket', 'sofa', [4.3, 5.5]),
    small('tray', 'tray', 'coffee', [3.5, 4.33]), small('vase', 'vase', 'sideboard', [6.2, 5.7]), small('pot', 'plant', 'sideboard', [6.8, 5.7]),
    item('fig', 'plant', [7.5, 0.5], 0, [0.6, 0.6, 1.5], { name: 'Fiddle-leaf fig, 150 cm' }),
    { ...item('art', 'wall_art', [0, 0], 0, [1.4, 0.03, 0.7]), ...onWall(s, 'liv', 'n', [1.4, 0.03, 0.7], 4.5) },
    { ...item('cur', 'curtain', [0, 0], 0, [2.1, 0.2, 2.6]), ...atWindow(s, 'liv', 'win', [2.1, 0.2, 2.6]) },
    { ...item('ledge', 'wall_hanging', [0, 0], 0, [1.2, 0.12, 0.3], { name: 'Oak picture ledge' }), ...onWall(s, 'liv', 'w', [1.2, 0.12, 0.3], 3) },
    { ...item('mirror', 'mirror', [0, 0], 0, [0.8, 0.05, 1.0]), ...onWall(s, 'liv', 'e', [0.8, 0.05, 1.0], 3) },
  ];
  return { items, lighting: [{ room_id: 'liv', type: 'ceiling', style: 'quiet' }, { room_id: 'liv', type: 'fixture', id: 'sconce', mount: 'wall', pos: [6.5, 5.95] }] };
}
const without = (d: Draft, ...ids: string[]): Draft => ({ ...d, items: d.items.filter(o => !ids.includes(o.id)) });
const room = (s: Scene, d: Draft, id = 'liv') => styling(s, d).find(r => r.room_id === id)!;

describe('living', () => {
  test('a styled living room meets every minimum', () => {
    const s = scene(), r = room(s, styled(s));
    expect(r.types).toEqual(['living']);
    expect(r.missing).toEqual([]);
    expect(r.passed).toBe(r.total);
  });
  test('each missing layer is one line saying what, how many and where', () => {
    const s = scene(), r = room(s, without(styled(s), 'c1', 't1', 'tray', 'fig', 'art', 'cur', 'rug', 'vase', 'pot'));
    const text = r.missing.join('\n');
    expect(text).toMatch(/3 more cushions on: "sofa"/);
    expect(text).toMatch(/a throw on: "sofa"/);
    expect(text).toMatch(/1-3 objects on: "coffee"/);
    expect(text).toMatch(/a large floor plant .* in the corner at \(\d\.\d\d, \d\.\d\d\)/);
    expect(text).toMatch(/art over sofa: .* on n: onWall\(scene, "liv", "n", size, 4\.50\)/);
    expect(text).toMatch(/curtains or blinds on win/);
    expect(text).toMatch(/a rug under the seating group, about 2\.80 x 2\.10 m, centred at \(3\.50, 4\.60\)/);
    expect(r.passed).toBeLessThan(r.total);
  });
  test('light layers count lamps, fixtures and the ceiling design', () => {
    const s = scene(), d = styled(s);
    expect(room(s, { ...d, lighting: [] }).missing.join('\n')).toMatch(/2 more light sources/);
  });
});

describe('bedroom, kids, dining, office, hall and bathroom', () => {
  const b = (o: DraftItem): DraftItem => ({ ...o, room_id: 'bed' });
  test('a bare bedroom is told to make the bed, hang art over the headboard, add a rug, a plant and curtains', () => {
    const s = scene(), items = [b(item('bed', 'bed', [10, 2.9], 0, [1.6, 2.1, 1.1], { name: 'Oak platform bed' })),
      b(item('ns', 'nightstand', [8.9, 3.7], 0, [0.45, 0.4, 0.55])), b(small('bl', 'lamp', 'ns', [8.9, 3.7], 'Bedside lamp'))];
    const r = room(s, { items }, 'bed'), text = r.missing.join('\n');
    expect(r.types).toEqual(['bedroom']);
    expect(text).toMatch(/make bed up: 2 cushions and a throw/);
    expect(text).toMatch(/art above the headboard of bed: .* onWall\(scene, "bed", "bn", size, 2\.00\)/);
    expect(text).toMatch(/a rug under the lower two thirds of bed/);
    expect(text).toMatch(/a plant/);
    expect(text).toMatch(/curtains or blinds on bwin/);
    expect(text).not.toMatch(/table lamp on/);
    const dressed = room(s, { items: [{ ...items[0]!, name: 'Oak bed 160x200, dressed in linen' }, ...items.slice(1)] }, 'bed');
    expect(dressed.missing.join('\n')).not.toMatch(/make bed up/);
  });
  test('a kids room wants playful art, toys, a play rug and soft seating', () => {
    const s = scene(['Living room', 'Kids room']), items = [b(item('kb', 'bed', [10, 3], 0, [0.9, 2.0, 0.8], { name: 'Kids single bed, dressed in pastel bedding' }))];
    const r = room(s, { items }, 'bed'), text = r.missing.join('\n');
    expect(r.types).toEqual(['kids']);
    expect(text).toMatch(/playful wall art \(\.\/varpet search --kind wall_art --text kids\)/);
    expect(text).toMatch(/2 more toys/);
    expect(text).toMatch(/a play rug/);
    expect(text).toMatch(/soft seating/);
  });
  test('a dining table wants a centrepiece, a pendant and art or a mirror near it', () => {
    const s = scene(['Living & dining', 'Bedroom']), d = styled(s);
    d.items.push(item('dt', 'table', [3.5, 1.8], 0, [1.6, 0.9, 0.75], { name: 'Dining table' }),
      ...[[2.9, 1.1, 180], [4.1, 1.1, 180], [2.9, 2.5, 0], [4.1, 2.5, 0]].map(([x, y, r], i) => item(`ch${i}`, 'chair', [x!, y!], r!, [0.45, 0.5, 0.9], { name: 'Dining chair' })));
    const r = room(s, d), text = r.missing.join('\n');
    expect(r.types).toEqual(['living', 'dining']);
    expect(text).toMatch(/a centrepiece on: "dt"/);
    expect(text).toMatch(/a pendant over dt: \{room_id: "liv", type: "fixture", id: "dining-pendant", mount: "pendant", pos: \[3\.50, 1\.80\]\}/);
    expect(text).toMatch(/art or a mirror on the wall nearest dt/);
  });
  test('a "Bedroom" holding a desk and no bed is styled as an office', () => {
    const s = scene(), items = [b(item('desk', 'desk', [10, 3.6], 0, [1.4, 0.7, 0.75]))];
    const r = room(s, { items }, 'bed');
    expect(r.types).toEqual(['office']);
    expect(r.missing.join('\n')).toMatch(/a task lamp on: "desk"/);
  });
  test('a hall and a bathroom have their own minimums', () => {
    const s = scene(['Entrance hall', 'Bathroom']);
    const hall = room(s, { items: [item('bench', 'bench', [2, 5.7], 0, [1.0, 0.4, 0.45])] });
    expect(hall.types).toEqual(['hall']);
    expect(hall.missing.join('\n')).toMatch(/a mirror near the door[\s\S]*1-2 objects on: "bench"[\s\S]*a coat rack/);
    const bath = room(s, { items: [b(item('mirror', 'mirror', [11.9, 2], 90, [0.6, 0.05, 0.8], { wall_id: 'be' }))] }, 'bed');
    expect(bath.missing.join('\n')).toMatch(/towels[\s\S]*a bath mat/);
  });
  test('roomTypes reads the room name and its contents', () => {
    expect(roomTypes({ id: 'x', name: 'WC', polygon: [] }, [])).toEqual(['bathroom']);
  });
});

describe('check', () => {
  test('styling lines are advice by default, hard for the final check, and each room gets a score', async () => {
    const { check } = await import('../lib/check.js');
    const s = scene(), d = without(styled(s), 'c1');
    const hard = await check(s, d, { brief: '', requirements: { rooms: {} }, styling: 'hard' });
    expect(hard.problems.join('\n')).toMatch(/styling: liv \(living\) needs 3 more cushions on: "sofa"/);
    expect(hard.summary).toMatch(/styling score: liv 9\/10/);
    const soft = await check(s, d, { brief: '', requirements: { rooms: {} } });
    expect(soft.problems.join('\n')).not.toMatch(/styling/);
    expect(soft.advice.join('\n')).toMatch(/styling: liv/);
  });
});

test('a room with a long plain wall and little wall decor is asked for a gallery, ledge or floating shelves', () => {
  const s = scene(), r = room(s, without(styled(s), 'ledge', 'mirror'));
  expect(r.missing.join('\n')).toMatch(/wall decor on the plain 5\.70 m stretch of [we] \(0\.15\.\.5\.85 m along\): a gallery wall of 3-5 frames .*floating shelf .*on: <its id>.*onWall\(scene, "liv", "[we]", size, 3\.00, height_m\)/);
});

test('a hung floating shelf counts as a wall piece', () => {
  const s = scene(), d = without(styled(s), 'ledge', 'mirror');
  d.items.push({ ...item('fs', 'shelf', [0, 0], 0, [1.0, 0.2, 0.08], { name: 'Oak floating shelf' }), ...onWall(s, 'liv', 'w', [1.0, 0.2, 0.08], 3, 1.4) },
    { ...item('fs2', 'shelf', [0, 0], 0, [1.0, 0.2, 0.08], { name: 'Oak floating shelf' }), ...onWall(s, 'liv', 'e', [1.0, 0.2, 0.08], 3, 1.4) });
  expect(room(s, d).missing.join('\n')).not.toMatch(/wall decor on the plain/);
});
