import { expect, test } from 'vitest';
import type { Scene } from '../src/scene.js';
import {
  receivesDirectSun, projectWindowSpan, solarPosition, windowSunHours, floorSunPatch, sun,
} from '../src/metrics/sun.js';

function room(north: number | undefined = 0): Scene {
  return {
    ...(north === undefined ? {} : { north_deg: north }),
    rooms: [{ id: 'room', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]] }],
    walls: [
      { id: 'south-wall', room_id: 'room', a: [0, 0], b: [6, 0] },
      { id: 'east-wall', room_id: 'room', a: [6, 0], b: [6, 6] },
      { id: 'north-wall', room_id: 'room', a: [6, 6], b: [0, 6] },
      { id: 'west-wall', room_id: 'room', a: [0, 6], b: [0, 0] },
    ],
    openings: ['south', 'east', 'north', 'west'].map(side => ({
      id: side, wall_id: `${side}-wall`, kind: 'window', offset: 2, width: 2, height: 1.5, sill: 0.8,
    })),
    items: [], fixed: [],
  };
}

// External oracle: NOAA's published calculator, https://gml.noaa.gov/grad/solcalc/main.js
// calcAzEl(calcTimeJulianCent(JD + (hour - 4) / 24), hour * 60, 40.18, 44.51, 4),
// run independently of this package for 2026. Apparent elevation includes NOAA refraction.
test.each([
  ['2026-03-20', 9, 108.784079, 20.685075],
  ['2026-03-20', 15, 219.036158, 42.557510],
  ['2026-06-21', 9, 88.837081, 36.692618],
  ['2026-06-21', 15, 244.393067, 60.396893],
  ['2026-09-22', 9, 111.177645, 23.640489],
  ['2026-09-22', 15, 223.472829, 40.943851],
  ['2026-12-21', 12, 164.838541, 24.902311],
  ['2026-12-21', 15, 209.324555, 20.559263],
])('matches published NOAA calculator: %s at %s local', (date, hour, azimuth, elevation) => {
  const position = solarPosition(date, hour);
  expect(Math.abs(position.azimuth_deg - azimuth)).toBeLessThan(0.05);
  expect(Math.abs(position.elevation_deg - elevation)).toBeLessThan(0.05);
});

test.each([
  ['2026-06-21', 13.060813779, 73.3],
  ['2026-12-21', 12.995457034, 26.4],
])('Yerevan solar-noon elevation on %s is the published solstice value', (date, noon, elevation) => {
  expect(Math.abs(solarPosition(date, noon).elevation_deg - elevation)).toBeLessThan(0.5);
  expect(Math.abs(solarPosition(date, 12).solar_noon_hour - noon)).toBeLessThan(1 / 60);
});

test('solar positions reject invalid dates and hours; leap day and midnight are valid', () => {
  for (const date of ['2026-02-29', '2026-13-01', '03-20', '2026-04-31']) {
    expect(() => solarPosition(date, 12)).toThrow(/date/i);
  }
  for (const hour of [-0.01, 24, NaN, Infinity]) expect(() => solarPosition('2026-03-20', hour)).toThrow(/hour/i);
  expect(solarPosition('2024-02-29', 0).elevation_deg).toBeLessThan(0);
  expect(solarPosition('2026-06-21', 0).elevation_deg).toBeLessThan(0);
});

test('the obstruction horizon is strict and the 85 degree incidence boundary is inclusive', () => {
  expect(receivesDirectSun({ elevation_deg: 15, azimuth_deg: 180 }, 180)).toBe(false);
  expect(receivesDirectSun({ elevation_deg: 15.001, azimuth_deg: 180 }, 180)).toBe(true);
  expect(receivesDirectSun({ elevation_deg: 30, azimuth_deg: 265 }, 180)).toBe(true);
  expect(receivesDirectSun({ elevation_deg: 30, azimuth_deg: 265.001 }, 180)).toBe(false);
  expect(receivesDirectSun({ elevation_deg: 30, azimuth_deg: 359 }, 1)).toBe(true);
  expect(receivesDirectSun({ elevation_deg: -2, azimuth_deg: 180 }, 180)).toBe(false);
});

test('winter south window has direct sun, north has none, and east sun ends before solar noon', () => {
  const scene = room();
  const south = windowSunHours(scene, 'south', '2026-12-21');
  const north = windowSunHours(scene, 'north', '2026-12-21');
  expect(south.direct_sun_hours).toBeGreaterThan(4);
  expect(north.direct_sun_hours).toBe(0);
  expect(north.intervals).toEqual([]);
  for (const date of ['2026-03-20', '2026-06-21', '2026-09-22', '2026-12-21']) {
    const east = windowSunHours(scene, 'east', date);
    expect(east.direct_sun_hours).toBeGreaterThan(0);
    expect(east.intervals.every(interval => interval.end_hour < solarPosition(date, 12).solar_noon_hour)).toBe(true);
    expect(east.direct_sun_hours).toBeCloseTo(east.intervals.reduce((hours, interval) => hours + interval.end_hour - interval.start_hour, 0), 8);
  }
});

test('rotation of plan north changes compass normal without depending on wall endpoint order', () => {
  const scene = room(90);
  expect(windowSunHours(scene, 'south', '2026-12-21').outward_azimuth_deg).toBeCloseTo(90, 8);
  const southWall = scene.walls.find(wall => wall.id === 'south-wall')!;
  [southWall.a, southWall.b] = [southWall.b, southWall.a];
  expect(windowSunHours(scene, 'south', '2026-12-21').outward_azimuth_deg).toBeCloseTo(90, 8);
});

test('floor patch projects both endpoints, sill and head at the given elevation', () => {
  const patch = projectWindowSpan([2, 0], [4, 0], 1, 2, { azimuth_deg: 180, elevation_deg: 45 }, 0);
  expect(patch.depth_m).toBeCloseTo(3, 8);
  expect(patch.polygon).toHaveLength(4);
  for (const [i, expected] of [[2, 1], [4, 1], [4, 3], [2, 3]].entries()) {
    expect(patch.polygon[i]![0]).toBeCloseTo(expected[0]!, 8);
    expect(patch.polygon[i]![1]).toBeCloseTo(expected[1]!, 8);
  }
  const rotated = projectWindowSpan([0, 4], [0, 2], 0, 2, { azimuth_deg: 180, elevation_deg: 45 }, 90);
  expect(rotated.polygon[0]).toEqual([0, 4]);
  expect(rotated.polygon[2]![0]).toBeCloseTo(2, 8);
  expect(rotated.polygon[2]![1]).toBeCloseTo(2, 8);
});

test('projection rejects invalid spans/heights and horizon rays; sill zero is allowed', () => {
  const position = { azimuth_deg: 180, elevation_deg: 45 };
  expect(() => projectWindowSpan([0, 0], [0, 0], 0, 2, position, 0)).toThrow(/span/i);
  expect(() => projectWindowSpan([0, 0], [1, 0], -1, 2, position, 0)).toThrow(/sill/i);
  expect(() => projectWindowSpan([0, 0], [1, 0], 0, 0, position, 0)).toThrow(/height/i);
  expect(() => projectWindowSpan([0, 0], [1, 0], 0, 2, { ...position, elevation_deg: 0 }, 0)).toThrow(/elevation/i);
  expect(projectWindowSpan([0, 0], [1, 0], 0, 2, position, 0).polygon[0]).toEqual([0, 0]);
});

test('window patch is absent when direct sun fails and uses the full opening offset and width', () => {
  const scene = room();
  expect(floorSunPatch(scene, 'north', '2026-12-21', 13)).toBeNull();
  expect(floorSunPatch(scene, 'south', '2026-12-21', 0)).toBeNull();
  const patch = floorSunPatch(scene, 'south', '2026-12-21', 13)!;
  expect(patch.polygon).toHaveLength(4);
  expect(patch.polygon[1]![0] - patch.polygon[0]![0]).toBeCloseTo(2, 8);
  expect(patch.depth_m).toBeCloseTo(2.3 / Math.tan(patch.position.elevation_deg * Math.PI / 180), 8);
  expect(Math.min(...patch.polygon.map(point => point[1]))).toBeGreaterThan(0);
});

test('sun returns all four seasonal dates by default and filters rooms, windows and hours', () => {
  const scene = room();
  const result = sun(scene, { room_id: 'room' });
  expect(result.status).toBe('known');
  expect(result.location).toMatchObject({ latitude: 40.18, longitude: 44.51, utc_offset_hours: 4 });
  expect(result.windows).toHaveLength(4);
  expect(result.windows[0]!.days.map(day => day.date)).toEqual(['2026-03-20', '2026-06-21', '2026-09-22', '2026-12-21']);
  const filtered = sun(scene, { window_id: 'south', date: '2026-12-21', hours: [10, 13] });
  expect(filtered.windows).toHaveLength(1);
  expect(filtered.windows[0]!.days).toHaveLength(1);
  expect(filtered.windows[0]!.days[0]!.patches.map(patch => patch.hour)).toEqual([10, 13]);
  expect(sun({ ...scene, openings: [] }).windows).toEqual([]);
});

test('unknown north stays unknown and invalid selection is actionable', () => {
  const scene = room();
  delete scene.north_deg;
  const result = sun(scene);
  expect(result.status).toBe('unknown');
  expect(result.reason).toMatch(/north_deg/i);
  expect(result.windows).toEqual([]);
  expect(() => windowSunHours(scene, 'south', '2026-12-21')).toThrow(/north_deg/i);
  expect(() => sun(room(), { window_id: 'missing' })).toThrow(/window.*missing/i);
  expect(() => sun(room(), { room_id: 'missing' })).toThrow(/room.*missing/i);
});
