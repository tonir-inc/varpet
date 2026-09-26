import { test, expect } from 'vitest';
import { parseScene, sceneSummary } from '../src/adapter.js';

test('concave notch wall faces north regardless of endpoint order or polygon winding', () => {
  const polygon = [[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]];
  for (const shape of [polygon,[...polygon].reverse()]) {
    for (const [a,b] of [[[4,1],[1,1]], [[1,1],[4,1]]]) {
      const scene = parseScene({ north_deg:0, rooms:[{id:'room',polygon:shape}], walls:[{id:'notch',room_id:'room',a,b}], items:[], fixed:[], openings:[] });
      expect(sceneSummary(scene).walls[0]!.compass).toBe('north');
    }
  }
});
