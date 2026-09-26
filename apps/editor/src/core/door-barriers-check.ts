import type { EntityMetadata, SceneDocument, Vec2 } from '../contracts';
import { doorBarriers } from './door-barriers';
import { polygonsOverlap } from './validation';

let assertions = 0;
function assert(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(`Door barrier check failed: ${message}`);
}
const scene = (metadata: EntityMetadata = {}): SceneDocument => ({
  format: 'varpet.editor', version: 2, id: 'doors', name: 'Doors', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#aaaaaa', polygon: [[-5, -5], [5, -5], [5, 5], [-5, 5]] }],
  walls: [{ id: 'wall', start: [0, 0], end: [4, 0], thickness: 0.2, height: 3, color: '#aaaaaa',
    openings: [{ id: 'door', kind: 'door', offset: 1, width: 1, height: 2.1, sill: 0 }] }], objects: [],
  project: { mode: 'correct', currency: 'USD', metadata: { door: metadata }, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], options: [], tasks: [] },
});
const box = (x: number, z: number, width = 0.02, depth = 0.02): Vec2[] =>
  [[x - width / 2, z - depth / 2], [x + width / 2, z - depth / 2], [x + width / 2, z + depth / 2], [x - width / 2, z + depth / 2]];
const hits = (document: SceneDocument, x: number, z: number, low = 0.5, high = 1, width = 0.02, depth = 0.02) =>
  doorBarriers(document).some(barrier => low < barrier.top - 1e-5 && high > barrier.bottom + 1e-5 && polygonsOverlap(box(x, z, width, depth), barrier.polygon));
const polygonArea = (polygon: Vec2[]) => polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length]!;
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
const contains = (polygon: Vec2[], point: Vec2) => polygon.every((a, i) => {
  const b = polygon[(i + 1) % polygon.length]!;
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -1e-8;
});

let document = scene({ frameWidth: 0.05, leafThickness: 0.04 });
assert(hits(document, 1.5, -0.015), 'the physical closed leaf includes thickness behind the swing side');
assert(hits(document, 1.45, 0.45), 'intermediate opening travel blocks a placement');
assert(hits(document, 1.05, 0.7), 'the fully open leaf blocks a placement');
assert(!hits(document, 1.7, 0.8), 'outside the sweep stays clear');
assert(!hits(document, 1.5, -0.15), 'opposite side stays clear');
assert(!hits(document, 1.5, -0.03), 'tangent contact with the closed leaf is clear');
assert(!hits(document, 1.45, 0.45, 2.05, 2.2), 'contact above the leaf top is clear');
assert(hits(document, 1.02, 0, 0.5, 1), 'the installed left frame is solid');
assert(hits(document, 1.5, 0, 2.06, 2.09), 'the installed top frame is solid');
assert(doorBarriers(document).some(barrier => barrier.kind === 'door-swing'), 'moving leaves identify opening travel');

document = scene({ hinge: 'right', swing: -1, frameWidth: 0.05, leafThickness: 0.04 });
assert(hits(document, 1.55, -0.45), 'right hinge and negative swing preserve the intended side');
assert(!hits(document, 1.55, 0.45), 'the mirrored opposite side remains clear');
for (const metadata of [{}, { hinge: 'right' as const }, { swing: -1 as const }, { hinge: 'right' as const, swing: -1 as const }, { mechanism: 'double' as const }]) {
  for (const barrier of doorBarriers(scene(metadata))) {
    assert(polygonArea(barrier.polygon) > 0, 'all output polygons are counterclockwise');
    assert(barrier.polygon.every((point, i, polygon) => {
      const b = polygon[(i + 1) % polygon.length]!, c = polygon[(i + 2) % polygon.length]!;
      return (b[0] - point[0]) * (c[1] - b[1]) - (b[1] - point[1]) * (c[0] - b[0]) >= -1e-10;
    }), 'all output polygons are convex');
  }
}

document = scene({ mechanism: 'double', frameWidth: 0.05 });
assert(hits(document, 1.05, 0.4), 'double door includes the left half leaf');
assert(hits(document, 1.95, 0.4), 'double door includes the right half leaf');
assert(!hits(document, 1.5, 0.65), 'double door does not reserve a full-width swing');
document = scene({ mechanism: 'fixed' });
assert(hits(document, 1.5, 0), 'fixed door has a physical leaf');
assert(!hits(document, 1.45, 0.45), 'fixed door has no opening sweep');
assert(doorBarriers(document).every(barrier => barrier.kind === 'door'), 'fixed geometry identifies a door');
for (const mechanism of ['sliding', 'pocket'] as const) {
  document = scene({ mechanism, frameWidth: 0.05, leafThickness: 0.04 });
  assert(hits(document, 2.5, 0.14), `${mechanism} includes fully translated leaf`);
  assert(hits(document, 1.5, 0.14), `${mechanism} starts at the rendered offset from the wall`);
  assert(!hits(document, 1.5, 0.45), `${mechanism} does not reserve hinged travel`);
  document.project!.metadata.door!.hinge = 'right';
  assert(hits(document, 0.5, 0.14), `${mechanism} with right hinge travels toward wall start`);
}
document = scene({ mechanism: 'tilt', frameWidth: 0.05, leafThickness: 0.04 });
assert(hits(document, 1.5, 0.8), 'tilt envelope covers the rendered top at maximum tilt');
assert(!hits(document, 1.5, 1.2), 'tilt does not use the full door height as its travel depth');

document = scene({ threshold: 0.2, frameWidth: 0.05, leafThickness: 0.04 });
document.project!.metadata.wall = { elevation: 1 };
document.walls[0]!.openings[0]!.sill = 0.3;
assert(!hits(document, 1.45, 0.45, 1.3, 1.5), 'threshold elevation lifts the moving leaf');
assert(hits(document, 1.45, 0.45, 1.5, 1.8), 'leaf sweep includes wall elevation, sill and threshold');
assert(hits(document, 1.5, 0, 1.3, 1.4), 'threshold is a physical barrier');
document.project!.metadata.door!.phase = 'remove';
assert(doorBarriers(document).length === 0, 'removed doors have no barriers');
document.project!.metadata.door!.phase = 'retain'; document.project!.metadata.wall!.phase = 'remove';
assert(doorBarriers(document).length === 0, 'removed hosts have no door barriers');
document = scene(); document.walls[0]!.openings[0]!.kind = 'window';
assert(doorBarriers(document).length === 0, 'window behavior stays in existing wall checks');

// Independently transform physical leaf corners throughout travel. Every corner must lie in a
// reported volume, including a reversed diagonal host and unusually thick narrow leaves.
for (const hinge of ['left', 'right'] as const) for (const swing of [1, -1] as const) for (const dimensions of [[1, 0.04], [0.2, 0.5]] as const) {
  document = scene({ hinge, swing, frameWidth: 0.01, leafThickness: dimensions[1] });
  document.walls[0]!.start = [3, 4]; document.walls[0]!.end = [-1, 1];
  document.walls[0]!.openings[0]!.width = dimensions[0];
  const barriers = doorBarriers(document).filter(barrier => barrier.kind === 'door-swing');
  const length = dimensions[0] - 0.02, right = hinge === 'right', direction = right ? -1 : 1;
  const pivot = 1 + (right ? dimensions[0] - 0.01 : 0.01);
  for (let step = 0; step <= 181; step++) for (const along of [0, length]) for (const across of [-dimensions[1] / 2, dimensions[1] / 2]) {
    const a = step / 181 * Math.PI / 2;
    const localX = pivot + direction * (along * Math.cos(a) - across * Math.sin(a));
    const localZ = swing * (along * Math.sin(a) + across * Math.cos(a));
    const point: Vec2 = [3 - 0.8 * localX + 0.6 * localZ, 4 - 0.6 * localX - 0.8 * localZ];
    assert(barriers.some(barrier => contains(barrier.polygon, point)), 'travel barriers contain every rendered leaf corner on reversed diagonal walls');
  }
  // The region behind both the hinge and the chosen swing direction is always clear of leaf travel.
  const back: Vec2 = [3 - 0.8 * (pivot - direction * 0.08) + 0.6 * (-swing * 0.08), 4 - 0.6 * (pivot - direction * 0.08) - 0.8 * (-swing * 0.08)];
  assert(!barriers.some(barrier => contains(barrier.polygon, back)), 'sweep hull does not fill the empty quadrant behind the hinge');
}

document = scene({ frameWidth: 0.05, leafThickness: 0.04 });
const before = JSON.stringify(document);
const travel = doorBarriers(document).filter(barrier => barrier.kind === 'door-swing');
const radius = Math.hypot(0.9, 0.02);
assert(travel.every(barrier => barrier.polygon.every(([x, z]) => Math.hypot(x - 1.05, z) <= radius + 0.00010001)), 'arc envelope overshoot is at most 0.1 mm');
assert(JSON.stringify(document) === before, 'door geometry leaves source data unchanged');
console.log(`Door barrier checks passed (${assertions} assertions).`);
