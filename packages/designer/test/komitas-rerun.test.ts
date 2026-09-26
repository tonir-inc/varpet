import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const root = new URL('../eval/komitas/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));

test('the live Komitas rerun has one fresh measurement for every ground-truth flat', () => {
  const ledger = read('../komitas-rerun.json');
  const ids = read('ground-truth.json').map((row: { id: string }) => row.id);
  expect(ledger.flats.map((row: { id: string }) => row.id)).toEqual(ids);
  expect(ledger.profile).toMatchObject({ model: 'gpt-6-astra', effort: 'medium', photos: 0, parallel: 4 });
  for (const row of ledger.flats) {
    const capture = read(`${row.id}.architect.json`), metrics = read(`${row.id}.metrics.json`);
    expect(capture.source_revision).toBe(ledger.source_revision);
    expect(row.after.seconds).toBe(capture.seconds);
    expect(row.after.tokens).toBe(capture.usage.total.total_tokens);
    expect(row.after.architect).toBe(metrics.architect_accepted);
    expect(row.after.editor).toBe(metrics.editor_accepted);
    expect(row.after.bridge).toBe(metrics.bridge_accepted);
  }
});

test('only fresh whole-chain Komitas passes are published, with source geometry and both screenshots', () => {
  const ledger = read('../komitas-rerun.json');
  for (const row of ledger.flats) {
    const metrics = read(`${row.id}.metrics.json`);
    const accepted = metrics.architect_accepted && metrics.editor_accepted && metrics.bridge_accepted;
    expect(metrics.accepted).toBe(accepted);
    expect(existsSync(new URL(`${row.id}.scene.json`, root))).toBe(accepted);
    if (!accepted) continue;
    const scene = read(`${row.id}.scene.json`), structure = read(`${row.id}.architect.json`).lines.at(-1);
    expect(scene.rooms).toEqual(structure.rooms);
    expect(scene.walls).toEqual(structure.walls);
    expect(scene.objects).toEqual([]);
    for (const view of ['top', '3d']) expect(existsSync(new URL(`${row.id}-${view}.png`, root))).toBe(true);
    for (const extension of ['png', 'jpg', 'jpeg']) expect(existsSync(new URL(`${row.id}.${extension}`, root))).toBe(false);
  }
});
