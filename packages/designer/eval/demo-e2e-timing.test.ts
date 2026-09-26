import { expect, test } from 'vitest';
import { elapsedSeconds } from './demo-e2e.js';

test('monotonic millisecond durations are reported as seconds, including zero', () => {
  expect(elapsedSeconds(1000,25825.188)).toBe(24.825);
  expect(elapsedSeconds(42,42)).toBe(0);
});
