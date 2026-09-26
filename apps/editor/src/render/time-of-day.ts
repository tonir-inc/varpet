export interface TimeOfDayLighting {
  readonly hour: number;
  readonly daylight: number;
  readonly elevation: number;
  readonly phase: 'dawn' | 'day' | 'dusk' | 'night';
  readonly autoLights: number;
  readonly night: number;
}

/** A visual daily cycle, not a site/date-based solar calculation. 24 is midnight. */
export function normalizeTimeOfDay(hour: number): number {
  return Number.isFinite(hour) ? Math.max(0, Math.min(24, hour)) : 12;
}

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function timeOfDayLighting(value: number): TimeOfDayLighting {
  const hour = normalizeTimeOfDay(value);
  const daylight = smoothstep(6, 8, hour) * (1 - smoothstep(17, 19, hour));
  return {
    hour, daylight,
    elevation: 5 + 60 * Math.max(0, Math.sin(Math.PI * (hour - 6) / 12)),
    phase: hour < 6 || hour >= 19 ? 'night' : hour < 8 ? 'dawn' : hour < 17 ? 'day' : 'dusk',
    autoLights: 1 - daylight,
    night: 1 - daylight,
  };
}
