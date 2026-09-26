import { wallOutward } from '../adapter.js';
import type { Opening, Scene, Vec2, Wall } from '../scene.js';

const RAD = Math.PI / 180;
const LOCATION = { latitude: 40.18, longitude: 44.51, utc_offset_hours: 4 } as const;
const SEASON_DATES = ['2026-03-20', '2026-06-21', '2026-09-22', '2026-12-21'] as const;
const normalize = (angle: number) => ((angle % 360) + 360) % 360;

export interface SolarPosition {
  /** Clockwise from true north. */
  azimuth_deg: number;
  /** Apparent elevation, including NOAA's standard atmospheric refraction. */
  elevation_deg: number;
  /** Civil local hour in fixed UTC+4; this is not necessarily 12:00. */
  solar_noon_hour: number;
}
type Direction = Pick<SolarPosition, 'azimuth_deg' | 'elevation_deg'>;
export interface SunInterval { start_hour: number; end_hour: number }
export interface WindowSunHours {
  window_id: string;
  date: string;
  outward_azimuth_deg: number;
  direct_sun_hours: number;
  intervals: SunInterval[];
}
export interface FloorProjection { polygon: Vec2[]; depth_m: number }
export interface FloorSunPatch extends FloorProjection { hour: number; position: SolarPosition }
export interface SunOptions { room_id?: string; window_id?: string; date?: string; hours?: number[] }
export interface SunResult {
  status: 'known' | 'unknown';
  reason?: string;
  location: typeof LOCATION;
  assumptions: string[];
  windows: {
    window_id: string;
    room_id: string;
    outward_azimuth_deg: number;
    days: (WindowSunHours & { patches: { hour: number; patch: FloorSunPatch | null }[] })[];
  }[];
}

function dateJulianDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date ${date}: use YYYY-MM-DD`);
  const milliseconds = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date ${date}: expected a real Gregorian date`);
  }
  return milliseconds / 86_400_000 + 2440587.5;
}

function validateHour(hour: number): void {
  if (!Number.isFinite(hour) || hour < 0 || hour >= 24) throw new Error(`Invalid local hour ${hour}: expected 0 <= hour < 24 in UTC+4`);
}

/** NOAA/Meeus solar elements; source: https://gml.noaa.gov/grad/solcalc/main.js
 * and https://gml.noaa.gov/grad/solcalc/calcdetails.html. No clock or network access. */
function solarElements(julianDay: number): { declination: number; equation_minutes: number } {
  const t = (julianDay - 2451545) / 36525;
  const meanLongitude = normalize(280.46646 + t * (36000.76983 + t * 0.0003032));
  const anomaly = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * RAD;
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const equationCenter = Math.sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * anomaly) * (0.019993 - 0.000101 * t) + Math.sin(3 * anomaly) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = (meanLongitude + equationCenter - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const obliquity = (23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    + 0.00256 * Math.cos(omega)) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
  const y = Math.tan(obliquity / 2) ** 2;
  const longitude = meanLongitude * RAD;
  const equation_minutes = 4 / RAD * (y * Math.sin(2 * longitude) - 2 * eccentricity * Math.sin(anomaly)
    + 4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * longitude)
    - 0.5 * y * y * Math.sin(4 * longitude) - 1.25 * eccentricity * eccentricity * Math.sin(2 * anomaly));
  return { declination, equation_minutes };
}

function refraction(elevation: number): number {
  if (elevation > 85) return 0;
  const tangent = Math.tan(elevation * RAD);
  if (elevation > 5) return (58.1 / tangent - 0.07 / tangent ** 3 + 0.000086 / tangent ** 5) / 3600;
  if (elevation > -0.575) return (1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))) / 3600;
  return -20.774 / tangent / 3600;
}

function noonHour(julianDay: number): number {
  let hour = 12 + LOCATION.utc_offset_hours - LOCATION.longitude / 15;
  for (let iteration = 0; iteration < 3; iteration++) {
    const { equation_minutes } = solarElements(julianDay + (hour - LOCATION.utc_offset_hours) / 24);
    hour = (720 - 4 * LOCATION.longitude - equation_minutes + 60 * LOCATION.utc_offset_hours) / 60;
  }
  return hour;
}

function positionAt(julianDay: number, hour: number, solar_noon_hour: number): SolarPosition {
  const { declination, equation_minutes } = solarElements(julianDay + (hour - LOCATION.utc_offset_hours) / 24);
  const solarMinutes = hour * 60 + equation_minutes + 4 * LOCATION.longitude - 60 * LOCATION.utc_offset_hours;
  const hourAngle = (solarMinutes / 4 - 180) * RAD;
  const latitude = LOCATION.latitude * RAD;
  const sineElevation = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const geometricElevation = Math.asin(Math.max(-1, Math.min(1, sineElevation))) / RAD;
  const azimuth_deg = normalize(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)) / RAD + 180);
  return { azimuth_deg, elevation_deg: geometricElevation + refraction(geometricElevation), solar_noon_hour };
}

export function solarPosition(date: string, hour: number): SolarPosition {
  const julianDay = dateJulianDay(date);
  validateHour(hour);
  return positionAt(julianDay, hour, noonHour(julianDay));
}

export function receivesDirectSun(position: Direction, outward_azimuth_deg: number): boolean {
  const incidence = Math.abs(normalize(position.azimuth_deg - outward_azimuth_deg + 180) - 180);
  return position.elevation_deg > 15 && incidence <= 85;
}

function requireNorth(scene: Scene): number {
  if (scene.north_deg === undefined || !Number.isFinite(scene.north_deg)) {
    throw new Error('Direct sun is unknown: set north_deg from the plan north arrow first');
  }
  return scene.north_deg;
}

function windowGeometry(scene: Scene, windowId: string): { opening: Opening; wall: Wall; a: Vec2; b: Vec2; outward: number } {
  const opening = scene.openings.find(candidate => candidate.id === windowId && candidate.kind === 'window');
  if (!opening) throw new Error(`Unknown window: ${windowId}`);
  const wall = scene.walls.find(candidate => candidate.id === opening.wall_id);
  if (!wall) throw new Error(`Window ${windowId}: unknown wall ${opening.wall_id}`);
  const north = requireNorth(scene);
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (length <= 0) throw new Error(`Window ${windowId}: wall ${wall.id} has zero length`);
  if (opening.offset < 0 || opening.width <= 0 || opening.offset + opening.width > length + 1e-8) {
    throw new Error(`Window ${windowId}: opening exceeds wall ${wall.id} span`);
  }
  const along = (distance: number): Vec2 => [wall.a[0] + (wall.b[0] - wall.a[0]) * distance / length, wall.a[1] + (wall.b[1] - wall.a[1]) * distance / length];
  const outward = wallOutward(scene, wall);
  return { opening, wall, a: along(opening.offset), b: along(opening.offset + opening.width), outward: normalize(Math.atan2(outward[0], outward[1]) / RAD - north) };
}

/** Integrates a whole local day with one-minute midpoint samples. Interval boundaries are
 * civil UTC+4 hours and have at most one minute of sampling uncertainty each. */
export function windowSunHours(scene: Scene, windowId: string, date: string): WindowSunHours {
  const geometry = windowGeometry(scene, windowId);
  const julianDay = dateJulianDay(date);
  const noon = noonHour(julianDay);
  const intervals: SunInterval[] = [];
  let startMinute: number | undefined;
  for (let minute = 0; minute <= 1440; minute++) {
    const lit = minute < 1440 && receivesDirectSun(positionAt(julianDay, (minute + 0.5) / 60, noon), geometry.outward);
    if (lit && startMinute === undefined) startMinute = minute;
    if (!lit && startMinute !== undefined) {
      intervals.push({ start_hour: startMinute / 60, end_hour: minute / 60 });
      startMinute = undefined;
    }
  }
  return {
    window_id: windowId, date, outward_azimuth_deg: geometry.outward,
    direct_sun_hours: intervals.reduce((sum, interval) => sum + interval.end_hour - interval.start_hour, 0), intervals,
  };
}

/** Unoccluded floor-plane projection of all four window corners. It preserves the full
 * opening span and the sill-to-head band; depth is head height / tan(elevation).
 * This polygon is not clipped to room walls or furniture. */
export function projectWindowSpan(a: Vec2, b: Vec2, sill: number, height: number, position: Direction, north_deg: number): FloorProjection {
  if (![...a, ...b].every(Number.isFinite) || Math.hypot(b[0] - a[0], b[1] - a[1]) <= 0) throw new Error('Window span must have two distinct finite endpoints');
  if (!Number.isFinite(sill) || sill < 0) throw new Error('Window sill must be nonnegative metres');
  if (!Number.isFinite(height) || height <= 0) throw new Error('Window height must be positive metres');
  if (!Number.isFinite(position.elevation_deg) || position.elevation_deg <= 0 || position.elevation_deg > 90) throw new Error('Solar elevation must be above 0 and at most 90 degrees');
  if (!Number.isFinite(position.azimuth_deg) || !Number.isFinite(north_deg)) throw new Error('Solar azimuth and north_deg must be finite degrees');
  const tangent = Math.tan(position.elevation_deg * RAD);
  const planAzimuth = (position.azimuth_deg + north_deg) * RAD;
  const direction: Vec2 = [-Math.sin(planAzimuth), -Math.cos(planAzimuth)];
  const project = (point: Vec2, z: number): Vec2 => [point[0] + direction[0] * z / tangent, point[1] + direction[1] * z / tangent];
  return { polygon: [project(a, sill), project(b, sill), project(b, sill + height), project(a, sill + height)], depth_m: (sill + height) / tangent };
}

export function floorSunPatch(scene: Scene, windowId: string, date: string, hour: number): FloorSunPatch | null {
  const geometry = windowGeometry(scene, windowId);
  const position = solarPosition(date, hour);
  if (!receivesDirectSun(position, geometry.outward)) return null;
  return { hour, position, ...projectWindowSpan(geometry.a, geometry.b, geometry.opening.sill, geometry.opening.height, position, requireNorth(scene)) };
}

export function sun(scene: Scene, options: SunOptions = {}): SunResult {
  if (options.room_id !== undefined && !scene.rooms.some(room => room.id === options.room_id)) throw new Error(`Unknown room: ${options.room_id}`);
  if (options.window_id !== undefined && !scene.openings.some(opening => opening.id === options.window_id && opening.kind === 'window')) throw new Error(`Unknown window: ${options.window_id}`);
  const dates = options.date === undefined ? [...SEASON_DATES] : [options.date];
  dates.forEach(dateJulianDay);
  const hours = options.hours ?? [9, 12, 15];
  hours.forEach(validateHour);
  const assumptions = [
    'Calculated clear-sky potential direct sun, with a fixed 15 degree obstruction horizon and at most 85 degree incidence.',
    'Intervals use one-minute midpoint samples in fixed UTC+4; noon refers to solar noon.',
    'Floor polygons are unoccluded full-window projections; not clipped to walls or furniture.',
    ...(options.date === undefined ? ['Default seasonal dates use fixed reference year 2026.'] : []),
  ];
  if (scene.north_deg === undefined || !Number.isFinite(scene.north_deg)) {
    return { status: 'unknown', reason: 'Direct sun is unknown: set north_deg from the plan north arrow first', location: { ...LOCATION }, assumptions, windows: [] };
  }
  const windows = scene.openings.filter(opening => opening.kind === 'window' && (options.window_id === undefined || opening.id === options.window_id))
    .filter(opening => options.room_id === undefined || scene.walls.find(wall => wall.id === opening.wall_id)?.room_id === options.room_id)
    .map(opening => {
      const geometry = windowGeometry(scene, opening.id);
      return {
        window_id: opening.id, room_id: geometry.wall.room_id, outward_azimuth_deg: geometry.outward,
        days: dates.map(date => ({ ...windowSunHours(scene, opening.id, date), patches: hours.map(hour => ({ hour, patch: floorSunPatch(scene, opening.id, date, hour) })) })),
      };
    });
  if (options.window_id !== undefined && options.room_id !== undefined && windows.length === 0) {
    throw new Error(`Window ${options.window_id} does not belong to room ${options.room_id}`);
  }
  return { status: 'known', location: { ...LOCATION }, assumptions, windows };
}
