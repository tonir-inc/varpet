import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.slice(source.indexOf('function run('), source.indexOf('\nfunction executeHumanCommand')));
function setup(mode, role = 'structural') {
  const store = { revision: 1, scene: { project: { mode } } }, buttons = new Map();
  let applied = 0, title, focused, deferred = 0;
  const deps = { store, previewMode: false, notify() {}, uid: () => 'command', catalog: [], normalizeWallJunctions() {},
    mayChangeWallStructure: () => true, previewSelectionOperations: () => ({}),
    structuralWallChanges: () => [{ name: 'Wall', role }], escape: value => value,
    showModal: value => { title = value; }, modal: { close() {}, addEventListener() {} },
    $: id => { if (!buttons.has(id)) buttons.set(id, { focus() { focused = id; } }); return buttons.get(id); },
    renderInspector() {}, renovationUI: { render() {} },
    executeHumanCommand: command => { if (command.baseRevision !== store.revision) return false; applied++; return true; },
  };
  const run = new Function(...Object.keys(deps), `${body}; return run;`)(...Object.values(deps));
  run([{ type: 'delete-wall', id: 'wall' }], 'Delete wall', 1, () => deferred++);
  return { store, buttons, get applied() { return applied; }, get title() { return title; }, get focused() { return focused; }, get deferred() { return deferred; } };
}
test('Renovate structural edit prompts, defaults to Cancel, and only applies on confirmation', () => {
  const ui = setup('renovate');
  assert.equal(ui.title, 'Change a load-bearing wall?');
  assert.equal(ui.focused, '#cancel-wall-change');
  assert.equal(ui.applied, 0);
  ui.buttons.get('#cancel-wall-change').onclick();
  assert.equal(ui.applied, 0);
  const confirmed = setup('renovate');
  confirmed.buttons.get('#confirm-wall-change').onclick();
  assert.equal(confirmed.applied, 1);
  assert.equal(confirmed.deferred, 1);
});
test('correction and unconfirmed roles apply without a structural dialog', () => {
  for (const [mode, role] of [['correct', 'structural'], ['renovate', 'unknown'], ['renovate', 'partition']]) {
    const ui = setup(mode, role); assert.equal(ui.title, undefined); assert.equal(ui.applied, 1);
  }
});
test('confirmation retains the reviewed revision', () => {
  const ui = setup('renovate'); ui.store.revision++;
  ui.buttons.get('#confirm-wall-change').onclick();
  assert.equal(ui.applied, 0); assert.equal(ui.deferred, 0);
});
