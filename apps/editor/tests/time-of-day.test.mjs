import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-time-of-day-'));
after(() => rm(output, { recursive: true, force: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, plugins: [{
  name: 'time-of-day-entry', resolveId(id) { if (id.endsWith('time-of-day-entry')) return '\0time-of-day-entry'; },
  load(id) { if (id === '\0time-of-day-entry') return ['time-of-day', 'sunlight', 'services'].map(name => `export * from '${root}/src/render/${name}.ts';`).join('\n'); },
}], build: { ssr: 'time-of-day-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { normalizeTimeOfDay, timeOfDayLighting, normalizeSun, effectiveSunlight, DEFAULT_SUN, LightingPreview } = await import(pathToFileURL(join(output, 'test.mjs')));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('clock accepts fractional hours, clamps endpoints, and safely normalizes invalid input', () => {
  for (const hour of [0, 6.25, 12, 18.75, 24]) assert.equal(normalizeTimeOfDay(hour), hour);
  assert.equal(normalizeTimeOfDay(-1), 0); assert.equal(normalizeTimeOfDay(25), 24);
  for (const value of [NaN, Infinity, -Infinity, undefined, null, '22', {}]) assert.equal(normalizeTimeOfDay(value), 12);
});

test('noon is bright and both midnight endpoints are dark with automatic lights on', () => {
  const noon = timeOfDayLighting(12);
  assert.equal(noon.daylight, 1); assert.equal(noon.autoLights, 0); assert.equal(noon.night, 0); assert.equal(noon.phase, 'day');
  for (const hour of [0, 24]) {
    const night = timeOfDayLighting(hour);
    assert.equal(night.daylight, 0); assert.equal(night.autoLights, 1); assert.equal(night.night, 1); assert.equal(night.phase, 'night');
    assert.ok(night.elevation < noon.elevation);
  }
});

test('dawn brightens smoothly and dusk dims smoothly while automatic lights follow the opposite curve', () => {
  let dawn = -1, dusk = 2;
  for (let minute = 0; minute <= 120; minute++) {
    const morning = timeOfDayLighting(6 + minute / 60), evening = timeOfDayLighting(17 + minute / 60);
    assert.ok(morning.daylight >= dawn); assert.ok(evening.daylight <= dusk);
    near(morning.autoLights + morning.daylight, 1); near(evening.autoLights + evening.daylight, 1);
    dawn = morning.daylight; dusk = evening.daylight;
  }
  near(timeOfDayLighting(7).daylight, .5); near(timeOfDayLighting(18).daylight, .5);
  assert.equal(timeOfDayLighting(7).phase, 'dawn'); assert.equal(timeOfDayLighting(18).phase, 'dusk');
});

test('daylight is continuous at each dawn/dusk boundary and remains finite across the full clock', () => {
  for (const boundary of [6, 8, 17, 19]) {
    assert.ok(Math.abs(timeOfDayLighting(boundary - .001).daylight - timeOfDayLighting(boundary + .001).daylight) < .00001);
  }
  for (let hour = 0; hour <= 24; hour += .25) {
    const state = timeOfDayLighting(hour);
    assert.ok([state.hour, state.daylight, state.night, state.autoLights, state.elevation].every(Number.isFinite));
    assert.ok(state.daylight >= 0 && state.daylight <= 1); assert.ok(state.elevation >= 5 && state.elevation <= 85);
  }
});

test('time lighting results are independent values', () => {
  const first = timeOfDayLighting(12); first.daylight = 0;
  assert.equal(timeOfDayLighting(12).daylight, 1);
});

test('default and legacy manual sunlight retain the existing elevation and strength', () => {
  assert.equal(DEFAULT_SUN.timeOfDay, null); assert.equal(DEFAULT_SUN.autoLights, true);
  const legacy = { enabled: true, azimuth: 225, elevation: 35, intensity: 100 };
  const state = normalizeSun({}, legacy);
  assert.equal(state.elevation, 35); near(effectiveSunlight(state).sunIntensity, 3.2);
  assert.equal(normalizeSun({ elevation: 65 }, state).elevation, 65);
});

test('clock edits derive elevation without mutating the previous settings or patch', () => {
  const previous = Object.freeze({ ...DEFAULT_SUN }), patch = Object.freeze({ timeOfDay: 12 });
  const state = normalizeSun(patch, previous);
  assert.equal(state.timeOfDay, 12); near(state.elevation, timeOfDayLighting(12).elevation);
  assert.equal(previous.timeOfDay, null); assert.equal(previous.elevation, 35);
  assert.deepEqual(patch, { timeOfDay: 12 });
});

test('compass, strength and auto-light edits preserve the selected time', () => {
  const night = normalizeSun({ timeOfDay: 22 }, { ...DEFAULT_SUN });
  const changed = normalizeSun({ azimuth: 405, intensity: 125, autoLights: false }, night);
  assert.equal(changed.timeOfDay, 22); assert.equal(changed.azimuth, 45); assert.equal(changed.intensity, 125);
  assert.equal(changed.autoLights, false); assert.equal(changed.elevation, night.elevation);
});

test('an explicit elevation edit returns to manual positioning, and reset clears the clock', () => {
  const night = normalizeSun({ timeOfDay: 22 }, { ...DEFAULT_SUN });
  const manual = normalizeSun({ elevation: 30 }, night);
  assert.equal(manual.timeOfDay, null); assert.equal(manual.elevation, 30); near(effectiveSunlight(manual).sunIntensity, 3.2);
  const reset = normalizeSun(DEFAULT_SUN, night);
  assert.deepEqual(reset, DEFAULT_SUN);
});

test('invalid solar edits preserve a valid active clock and numeric settings', () => {
  const original = normalizeSun({ timeOfDay: 18 }, { ...DEFAULT_SUN });
  for (const value of [NaN, Infinity, -Infinity, undefined]) {
    const unchanged = normalizeSun({ timeOfDay: value, elevation: value, azimuth: value, intensity: value }, original);
    assert.deepEqual(unchanged, original);
  }
  assert.equal(normalizeSun({ timeOfDay: -3 }, original).timeOfDay, 0);
  assert.equal(normalizeSun({ timeOfDay: 29 }, original).timeOfDay, 24);
});

test('effective sun is absent at night, proportional at dusk, and obeys direct-sun and evening switches', () => {
  const at = hour => normalizeSun({ timeOfDay: hour }, { ...DEFAULT_SUN });
  near(effectiveSunlight(at(12)).sunIntensity, 3.2);
  near(effectiveSunlight(at(18)).sunIntensity, 1.6);
  near(effectiveSunlight(at(22)).sunIntensity, 0);
  near(effectiveSunlight({ ...at(12), enabled: false }).sunIntensity, 0);
  near(effectiveSunlight(at(12), true).sunIntensity, 0);
});

const fixture = (id, enabled = true, phase = 'existing') => ({
  id, name: id, kind: 'light', position: [1, 2.6, 1], dimensions: [.4, .1, .4], rotation: 0, color: '#fff', phase,
  light: { enabled, brightness: 800, temperature: 3000 },
});
const control = targets => ({ id: 'switch', name: 'Switch', kind: 'switch', position: [0, 1, 0], dimensions: [.1, .1, .02], rotation: 0, color: '#fff', phase: 'existing', control: { type: 'dimmer', gangs: 1, targets } });

test('automatic lighting changes only the preview fallback and leaves authored components untouched', () => {
  const preview = new LightingPreview(), components = [fixture('light'), control(['light'])], original = JSON.stringify(components);
  preview.setComponents(components);
  preview.setAutomaticLevel(0); assert.equal(preview.getSwitchLevel('switch'), 0);
  preview.setAutomaticLevel(.5); assert.equal(preview.getSwitchLevel('switch'), .5);
  preview.setAutomaticLevel(1); assert.equal(preview.getSwitchLevel('switch'), 1);
  assert.equal(preview.levels.size, 0); assert.equal(JSON.stringify(components), original);
  preview.setAutomaticLevel(null); assert.equal(preview.getSwitchLevel('switch'), 1);
});

test('switch off wins over night auto-lighting and a dimmer setting survives day/night changes', () => {
  const preview = new LightingPreview(); preview.setComponents([fixture('light'), control(['light'])]);
  preview.setAutomaticLevel(1); preview.toggleSwitch('switch'); assert.equal(preview.getSwitchLevel('switch'), 0);
  preview.setAutomaticLevel(0); preview.setAutomaticLevel(1); assert.equal(preview.getSwitchLevel('switch'), 0);
  preview.setSwitchLevel('switch', .35); preview.setAutomaticLevel(0); assert.equal(preview.getSwitchLevel('switch'), .35);
  preview.toggleSwitch('switch'); preview.toggleSwitch('switch'); near(preview.getSwitchLevel('switch'), .35);
});

test('disabled and removed light fixtures stay off when automatic night lighting is active', () => {
  const preview = new LightingPreview(); preview.setComponents([fixture('disabled', false), fixture('removed', true, 'remove'), control(['disabled', 'removed'])]);
  preview.setAutomaticLevel(1); assert.equal(preview.getSwitchLevel('switch'), 0);
  preview.setComponents([fixture('removed', true, 'remove'), control(['removed'])]);
  preview.setSwitchLevel('switch', 1); assert.equal(preview.getSwitchLevel('switch'), 0);
});
