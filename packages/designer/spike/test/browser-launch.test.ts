import { expect, test } from 'vitest';
import { browserLaunch } from '../lib/view/browser-launch.js';
test('Linux uses bundled Chromium and software WebGL; Mac retains Metal', () => {
  expect(browserLaunch('linux', undefined)).toEqual({ executablePath: undefined, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  expect(browserLaunch('linux', '/custom/chrome').executablePath).toBe('/custom/chrome');
  expect(browserLaunch('darwin', undefined).args).toContain('--use-angle=metal');
});
