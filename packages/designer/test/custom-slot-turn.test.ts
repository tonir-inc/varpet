import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CustomSlots } from '../src/custom-slots.js';

test('an old-turn slot is explicitly rejected instead of silently queued', async () => {
  const buildsDir = await mkdtemp(join(tmpdir(), 'varpet-slot-turn-'));
  try {
    const first = new CustomSlots({ buildsDir, conversationId: 'c1', turnId: 't1' });
    first.searchedCatalog('cabinet');
    const slot = await first.reserve({ kind: 'cabinet', size_wdh_m: [.5, .4, .65], note: 'Plain cabinet' });
    await first.markProposed([slot.asset]);
    const next = new CustomSlots({ buildsDir, conversationId: 'c1', turnId: 't2' });
    await expect(next.queue(slot.slotId)).rejects.toThrow(/current turn/);
  } finally {
    await rm(buildsDir, { recursive: true, force: true });
  }
});
