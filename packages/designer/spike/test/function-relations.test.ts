import { describe, expect, test } from 'vitest';
import type { Scene } from '../../src/scene.js';
import { checkDecor } from '../lib/check.js';
import type { Draft, DraftItem } from '../lib/finishes.js';
import { functionRules, isBedFrame, isLamp } from '../lib/relations.js';
import { atWindow, onWall, wallSpot } from '../lib/scene.js';

/** One 8 x 6 m room (wall centre lines on the polygon, 0.1 m thick, 2.7 m high): a 1.5 m window in the bottom wall
 * (x 3..4.5), a door in the top wall (x 6.1..7). A second 4 x 4 m room to the right is the bedroom, window on its right. */
function scene(name = 'Living & dining'): Scene {
  const wall = (id: string, room_id: string, a: [number, number], b: [number, number]) => ({ id, room_id, a, b, thickness: 0.1, height: 2.7 });
  return {
    rooms: [
      { id: 'liv', name, polygon: [[0, 0], [8, 0], [8, 6], [0, 6]] },
      { id: 'bed', name: 'Bedroom', polygon: [[8, 0], [12, 0], [12, 4], [8, 4]] },
    ],
    walls: [wall('s', 'liv', [0, 0], [8, 0]), wall('e', 'liv', [8, 0], [8, 6]), wall('n', 'liv', [8, 6], [0, 6]), wall('w', 'liv', [0, 6], [0, 0]),
      wall('bs', 'bed', [8, 0], [12, 0]), wall('be', 'bed', [12, 0], [12, 4]), wall('bn', 'bed', [12, 4], [8, 4]), wall('bw', 'bed', [8, 4], [8, 0])],
    openings: [
      { id: 'win', wall_id: 's', kind: 'window', offset: 3, width: 1.5, height: 1.4, sill: 0.9 },
      { id: 'door', wall_id: 'n', kind: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0, swing: 'none' },
      { id: 'bwin', wall_id: 'be', kind: 'window', offset: 1.4, width: 1.2, height: 1.4, sill: 0.9 },
    ],
    items: [], fixed: [],
  } as unknown as Scene;
}
const item = (id: string, kind: string, pos: [number, number], rot: number, size: [number, number, number], extra: Partial<DraftItem> = {}): DraftItem =>
  ({ id, room_id: 'liv', kind, name: `${kind} ${id}`, pos, rot, size, keep: false, price: 1, ...extra });

/** A furnished living room that every rule accepts: sofa against the top wall facing down, coffee table 0.42 m in front,
 * rug under the front legs, floor lamp at the arm, art centred over the sofa, dining table with chairs. */
function living(s: Scene): DraftItem[] {
  return [
    item('sofa', 'sofa', [3.5, 5.5], 0, [2.2, 0.9, 0.85]),
    item('coffee', 'table', [3.5, 4.33], 0, [1.1, 0.6, 0.42], { name: 'Oak coffee table' }),
    item('rug', 'rug', [3.5, 4.3], 0, [2.6, 2.0, 0.01]),
    item('floor-lamp', 'lamp', [2.05, 5.6], 0, [0.4, 0.4, 1.55], { name: 'Tripod floor lamp' }),
    { ...item('art', 'wall_art', [0, 0], 0, [1.4, 0.03, 0.7]), ...onWall(s, 'liv', 'n', [1.4, 0.03, 0.7], 4.5) },
    item('dining', 'table', [3.5, 1.6], 0, [1.6, 0.9, 0.75], { name: 'Dining table' }),
    item('chair-1', 'chair', [3.1, 0.95], 180, [0.45, 0.5, 0.9], { name: 'Dining chair' }),
    item('chair-2', 'chair', [3.9, 2.25], 0, [0.45, 0.5, 0.9], { name: 'Dining chair' }),
  ];
}
const rules = (s: Scene, items: DraftItem[], brief?: string, lighting: Draft['lighting'] = []) => functionRules(s, { items, lighting }, brief);
const without = (items: DraftItem[], ...ids: string[]) => items.filter(o => !ids.includes(o.id));
const swap = (items: DraftItem[], id: string, patch: Partial<DraftItem>) => items.map(o => (o.id === id ? { ...o, ...patch } : o));

describe('the furnished baseline', () => {
  test('a well-furnished living room raises no hard problem', () => {
    const s = scene();
    expect(rules(s, living(s)).hard).toEqual([]);
  });
});

describe('lighting', () => {
  test('two floor lamps closer than 1.5 m fail', () => {
    const s = scene(), items = [...living(s), item('lamp-2', 'lamp', [2.05, 4.5], 0, [0.4, 0.4, 1.55], { name: 'Arc floor lamp' })];
    expect(rules(s, items).hard.join('\n')).toMatch(/floor lamps floor-lamp and lamp-2 stand 1\.10 m apart/);
  });
  test('three floor lamps lined up along an empty wall light nothing', () => {
    const s = scene(), items = [...living(s), ...[1, 2.6, 4.2].map((y, i) => item(`wall-lamp-${i}`, 'lamp', [7.6, y], 0, [0.4, 0.4, 1.55], { name: 'Floor lamp' }))];
    const hard = rules(s, items).hard.join('\n');
    expect(hard).toMatch(/floor lamp wall-lamp-0 lights nothing/);
    expect(hard).toMatch(/floor lamp wall-lamp-2 lights nothing/);
    const bunched = [...living(s), ...[1, 2, 3].map((y, i) => item(`wall-lamp-${i}`, 'lamp', [7.6, y], 0, [0.4, 0.4, 1.55], { name: 'Floor lamp' }))];
    expect(rules(s, bunched).hard.join('\n')).toMatch(/floor lamps wall-lamp-0 and wall-lamp-1 stand 1\.00 m apart/);
  });
  test('a table lamp must rest on something; a misfiled lamp table is not a lamp', () => {
    const s = scene(), items = [...living(s), item('side', 'table', [5.0, 5.6], 0, [0.4, 0.4, 0.55], { name: 'Side table' }), item('tl', 'lamp', [5.0, 4.9], 0, [0.25, 0.25, 0.5], { name: 'Ceramic table lamp' })];
    expect(rules(s, items).hard.join('\n')).toMatch(/tl is a table lamp .* standing on the floor.*on: "side"/);
    expect(isLamp(item('x', 'lamp', [0, 0], 0, [0.6, 0.6, 0.5], { name: 'Rivet Industrial Solid Wood Lamp Table with Hairpin Legs' }))).toBe(false);
    expect(isLamp(item('x', 'lamp', [0, 0], 0, [0.25, 0.25, 0.46], { name: 'Rivet Gold Bedside Table Desk Lamp' }))).toBe(true);
  });
  test('a seating group without a lamp, sconce or pendant fails; a wall sconce beside it passes', () => {
    const s = scene(), items = without(living(s), 'floor-lamp');
    expect(rules(s, items).hard.join('\n')).toMatch(/seating sofa has no lamp within 1 m/);
    const sconce = [{ room_id: 'liv', type: 'fixture' as const, id: 'sconce', mount: 'wall' as const, pos: [2.2, 5.95] as [number, number] }];
    expect(rules(s, items, undefined, sconce).hard.join('\n')).not.toMatch(/seating/);
  });
  test('a desk needs a task light', () => {
    const s = scene(), items = [...living(s), item('desk', 'desk', [7.2, 3], 90, [1.2, 0.6, 0.75])];
    expect(rules(s, items).hard.join('\n')).toMatch(/desk desk has no task light/);
    const lit = [...items, item('dl', 'lamp', [7.2, 3.3], 0, [0.2, 0.2, 0.4], { name: 'Desk lamp', on: 'desk' })];
    expect(rules(s, lit).hard.join('\n')).not.toMatch(/task light/);
  });
});

describe('bedroom', () => {
  const bedroom = (s: Scene, bedX = 10): DraftItem[] => {
    const b = (o: DraftItem) => ({ ...o, room_id: 'bed' });
    return [
      b(item('bed', 'bed', [bedX, 2.9], 0, [1.6, 2.1, 1.1], { name: 'Oak platform bed 160x200, dressed in linen' })),
      b(item('ns-l', 'nightstand', [bedX - 1.05, 3.7], 180, [0.45, 0.4, 0.55])), b(item('ns-r', 'nightstand', [bedX + 1.05, 3.7], 180, [0.45, 0.4, 0.55])),
      b(item('bl-l', 'lamp', [bedX - 1.05, 3.7], 0, [0.25, 0.25, 0.45], { name: 'Bedside lamp', on: 'ns-l' })),
      b(item('bl-r', 'lamp', [bedX + 1.05, 3.7], 0, [0.25, 0.25, 0.45], { name: 'Bedside lamp', on: 'ns-r' })),
      b({ ...item('curtain', 'curtain', [0, 0], 0, [1.6, 0.2, 2.6], { name: 'Linen curtains' }), ...atWindow(s, 'bed', 'bwin', [1.6, 0.2, 2.6]) }),
    ];
  };
  test('a centred double bed with nightstands, lamps and a curtain passes', () => {
    const s = scene(), r = rules(s, bedroom(s), 'I sleep badly');
    expect(r.hard).toEqual([]);
    expect(r.soft.join('\n')).not.toMatch(/windows|bedroom/);
  });
  test('a double bed pushed against a side wall is reachable from one side only', () => {
    const s = scene(), items = without(bedroom(s, 8.85), 'ns-l', 'bl-l');
    expect(rules(s, items).hard.join('\n')).toMatch(/bed \(1\.60 m wide\) has only 0\.\d\d m beside its side .* \(blocked by the wall\)/);
  });
  test('each open side of a double bed needs a nightstand with a light', () => {
    const s = scene(), items = without(bedroom(s), 'ns-r', 'bl-r');
    expect(rules(s, items).hard.join('\n')).toMatch(/bed has no nightstand at its side toward \(11\.05, 3\.70\)/);
    expect(rules(s, without(bedroom(s), 'bl-r')).hard.join('\n')).toMatch(/has no reading light/);
  });
  test('a dressed bed is not a bare frame; a plain frame still is', () => {
    const bed = item('b', 'bed', [0, 0], 0, [1.6, 2.1, 1.1]);
    expect(isBedFrame({ ...bed, name: 'Japandi low oak platform bed 160x200, dressed in white and oat linen' })).toBe(false);
    expect(isBedFrame({ ...bed, name: 'Minimal black steel bed 140x200, white and oat linen bedding' })).toBe(false);
    expect(isBedFrame({ ...bed, name: 'Rivet Modern Wood King Bed' })).toBe(true);
  });
});

describe('windows', () => {
  test('a bare bedroom window is advice, and a problem when the brief asks for dark', () => {
    const s = scene(), bed: DraftItem = { ...item('bed', 'bed', [10, 2.9], 180, [0.9, 2.0, 0.9], { name: 'Single bed, dressed' }), room_id: 'bed' };
    expect(rules(s, [bed]).soft.join('\n')).toMatch(/windows: window bwin in bed .* has no curtain or blind; .*atWindow\(scene, "bed", "bwin", size\)/);
    expect(rules(s, [bed], 'I sleep badly and need it dark').hard.join('\n')).toMatch(/window bwin .* the brief asks for dark\/privacy/);
  });
  test('a curtain hangs over a window with atWindow; off the window it fails', () => {
    const s = scene(), size: [number, number, number] = [2.1, 0.25, 2.6];
    const good: DraftItem = { ...item('c', 'curtain', [0, 0], 0, size), ...atWindow(s, 'liv', 'win', size) };
    expect(good.pos[0]).toBeCloseTo(3.75, 2);
    expect(checkDecor(s, { items: [good] })).toEqual([]);
    const off: DraftItem = { ...item('c', 'curtain', [0, 0], 0, size), ...onWall(s, 'liv', 'e', size, 3) };
    expect(checkDecor(s, { items: [off] }).join('\n')).toMatch(/c curtain on e is not at a window/);
    const blind: DraftItem = { ...item('b', 'blind', [0, 0], 0, [1.0, 0.08, 1.2]), ...atWindow(s, 'liv', 'win', [1.0, 0.08, 1.2]) };
    expect(checkDecor(s, { items: [blind] }, k => (k === 'blind' ? 'curtain' : k)).join('\n')).toMatch(/narrower than window win/);
  });
});

describe('check', () => {
  test('rule lines about kept furniture alone are advice; room-level lines stay hard on a flat with kept furniture', async () => {
    const { check } = await import('../lib/check.js');
    const s = scene(), kept = item('kept-sofa', 'sofa', [3.5, 5.5], 0, [2.2, 0.9, 0.85], { keep: true });
    s.items = [kept];
    const bed: DraftItem = { ...item('bed1', 'bed', [10, 2.9], 0, [0.9, 2.0, 0.9], { name: 'Single bed, dressed' }), room_id: 'bed' };
    const r = await check(s, { items: [bed, item('coffee', 'table', [3.5, 3.9], 0, [1.1, 0.6, 0.42], { name: 'Coffee table' })] }, { brief: 'I sleep badly' });
    expect(r.problems.join('\n')).toMatch(/windows: window bwin in bed .* brief asks for dark/);
    expect(r.problems.join('\n')).toMatch(/coffee table coffee is 0\.85 m from kept-sofa/);
    expect(r.advice.join('\n')).toMatch(/seating kept-sofa has no lamp/);
  });
});

describe('living', () => {
  test('a coffee table out of reach fails with the position that fixes it', () => {
    const s = scene(), items = swap(living(s), 'coffee', { pos: [3.5, 3.9] });
    expect(rules(s, items).hard.join('\n')).toMatch(/coffee table coffee is 0\.85 m from sofa's front .* move it to \(3\.50, 4\.33\)/);
  });
  test('a coffee table past the sofa ends fails', () => {
    const s = scene(), items = swap(living(s), 'coffee', { pos: [4.6, 4.33] });
    expect(rules(s, items).hard.join('\n')).toMatch(/coffee table coffee reaches past sofa's ends/);
  });
  test('a rug that stops short of the sofa front legs fails', () => {
    const s = scene(), items = swap(living(s), 'rug', { pos: [3.5, 3.9] });
    expect(rules(s, items).hard.join('\n')).toMatch(/rug rug stops 0\.\d\d m short of sofa's front legs; move it to \(3\.50, 4\.\d\d\)/);
  });
  test('an armchair facing the group from more than 3 m away is advice', () => {
    const s = scene(), items = [...living(s), item('arm', 'armchair', [7.2, 3.2], 253, [0.8, 0.8, 0.9])];
    expect(rules(s, items).soft.join('\n')).toMatch(/arm faces sofa's group but sits 4\.\d\d m from the sofa/);
  });
});

describe('wall decor', () => {
  test('art off the centre of the sofa fails with the centred position', () => {
    const s = scene(), items = living(s).map(o => (o.id === 'art' ? { ...o, ...onWall(s, 'liv', 'n', [1.4, 0.03, 0.7], 3.9) } : o));
    expect(rules(s, items).hard.join('\n')).toMatch(/art hangs 0\.60 m off the centre of sofa below it; centre it on sofa: pos \(3\.50, 5\.\d\d\)/);
  });
  test('a small print over a wide sofa is advice on scale', () => {
    const s = scene(), items = living(s).map(o => (o.id === 'art' ? { ...o, size: [0.5, 0.03, 0.4] as [number, number, number], ...onWall(s, 'liv', 'n', [0.5, 0.03, 0.4], 4.5) } : o));
    const soft = rules(s, items).soft.join('\n');
    expect(soft).toMatch(/art spans 23% of sofa's 2\.20 m width \(aim for 55-80%/);
    expect(soft).toMatch(/art floats 0\.\d\d m above sofa/);
  });
  test('a mirror crowding a door fails; the editor ignores height_m, so the check does too', () => {
    const s = scene(), mirror: DraftItem = { ...item('m', 'mirror', [0, 0], 0, [0.7, 0.05, 0.9]), ...onWall(s, 'liv', 'n', [0.7, 0.05, 0.9], 0.55) };
    expect(rules(s, [mirror]).hard.join('\n')).toMatch(/mirror m \(0\.70 m wide\) leaves 0\.10 m to door door on its/);
    const spot = wallSpot(s, { ...mirror, height_m: 0.6 })!;
    expect(spot.bottom).toBeCloseTo(1.05, 3);
    const tall = wallSpot(s, { ...mirror, size: [0.6, 0.05, 1.7] })!;
    expect(tall.bottom).toBe(0);
  });
});

describe('coverage', () => {
  test('a living & dining room with no dining table is told where the free floor is', () => {
    const s = scene(), items = without(living(s), 'dining', 'chair-1', 'chair-2');
    const soft = rules(s, items).soft.join('\n');
    expect(soft).toMatch(/coverage: liv is "Living & dining" but has no dining zone \(no dining table\); the largest free area is x /);
    expect(soft).toMatch(/coverage: liv has a dead zone of \d+\.\d\d m2/);
    expect(soft).toMatch(/all furniture in liv .* sits in its top half/);
    expect(rules(s, living(s)).soft.join('\n')).not.toMatch(/no dining zone|sits in its/);
  });
});
