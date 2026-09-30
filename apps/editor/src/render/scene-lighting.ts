import type { SunSettings } from './sunlight';
import { timeOfDayLighting } from './time-of-day';

/** One illumination policy for all cameras. Darkness never creates an installed light. */
export function sceneLighting(settings: SunSettings, selectedSky: boolean) {
  const daylight = settings.timeOfDay == null ? 1 : timeOfDayLighting(settings.timeOfDay).daylight;
  return {
    daylight,
    night: daylight < 0.05,
    ambient: 0.22 * daylight,
    environment: (selectedSky ? 0.35 : 0.4) * daylight,
    windowSky: settings.enabled === false ? 0 : daylight,
    exposure: 1.25,
  };
}
