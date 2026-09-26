import type { Operation, SceneDocument } from '../contracts';
import { emptyProject } from '../core/renovation';
import { EditorStore } from '../core/store';
import { renderEntityInspector } from './inspector';

/** A deliberately varied apartment, independent of the product's demo fixtures. */
export function windowDimensionsQAScene(): SceneDocument {
  const scene: SceneDocument = {
    format: 'varpet.editor', version: 2, id: 'window-dimensions-qa', name: 'Window dimensions QA', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'qa-room', name: 'QA room', polygon: [[0, 0], [12, 0], [12, 12], [0, 12]], color: '#eeeeee' }],
    walls: [
      { id: 'qa-source-wall', start: [0, 0], end: [12, 0], height: 3, thickness: 0.1, color: '#eeeeee', openings: [
        { id: 'qa-source', kind: 'window', offset: 1.125, width: 1.6, height: 1.5, sill: 0.8 },
      ] },
      { id: 'qa-target-wall', start: [0, 4], end: [12, 4], height: 3, thickness: 0.1, color: '#eeeeee', openings: [
        { id: 'qa-first', kind: 'window', offset: 1.25, width: 1, height: 1, sill: 1 },
        { id: 'qa-second', kind: 'window', offset: 4.375, width: 0.8, height: 1.2, sill: 0.5 },
        { id: 'qa-door', kind: 'door', offset: 8, width: 0.9, height: 2, sill: 0 },
        { id: 'qa-removed', kind: 'window', offset: 10, width: 0.7, height: 0.8, sill: 0.7 },
      ] },
      { id: 'qa-matching-wall', start: [0, 8], end: [12, 8], height: 3, thickness: 0.1, color: '#eeeeee', openings: [
        { id: 'qa-matching', kind: 'window', offset: 2, width: 1.6, height: 1.5, sill: 0.9 },
      ] },
      { id: 'qa-removed-wall', start: [0, 12], end: [12, 12], height: 3, thickness: 0.1, color: '#eeeeee', openings: [
        { id: 'qa-removed-host', kind: 'window', offset: 2, width: 0.7, height: 0.8, sill: 0.7 },
      ] },
    ], objects: [], project: emptyProject(),
  };
  scene.project!.metadata = {
    'qa-source': { name: 'Living room window', mechanism: 'fixed' },
    'qa-first': { name: 'Kitchen window', mechanism: 'casement', frameWidth: 0.045, leafThickness: 0.0375, hinge: 'right', swing: -1, notes: 'Keep existing hardware', phase: 'retain' },
    'qa-second': { name: 'Bedroom window', mechanism: 'sliding' },
    'qa-matching': { name: 'Already matching window', mechanism: 'tilt' },
    'qa-removed': { phase: 'remove', locked: true },
    'qa-removed-wall': { phase: 'remove', locked: true },
  };
  return scene;
}

const opening = (scene: SceneDocument, id: string) => scene.walls.flatMap(wall => wall.openings).find(value => value.id === id)!;

/** Uses native forms and the actual store, including its atomic validation/history path. */
export function checkWindowDimensionsDOM(container: HTMLElement): string {
  let assertions = 0;
  let scenarios = 0;
  const failures: string[] = [];
  const check = (condition: unknown, message: string) => { assertions++; if (!condition) throw new Error(message); };
  const equal = (actual: unknown, expected: unknown, message: string) => check(JSON.stringify(actual) === JSON.stringify(expected), message);
  const scenario = (name: string, run: (harness: ReturnType<typeof mount>) => void, scene = windowDimensionsQAScene()) => {
    scenarios++;
    const harness = mount(scene);
    try { run(harness); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { harness.stop(); }
  };
  function mount(scene: SceneDocument) {
    const store = new EditorStore(scene, []);
    let selected = 'qa-source';
    let executeCount = 0;
    let lastErrors: string[] = [];
    const config = {
      getScene: () => store.scene, getCatalog: () => [],
      execute: (operations: Operation[], label: string) => {
        executeCount++;
        const result = store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label, operations }, true);
        lastErrors = result.errors;
        return result.ok;
      },
      notice: () => {}, refresh: render, advanced: () => {}, getDoorAngle: () => 0, testDoor: () => {},
    };
    function render() { renderEntityInspector(container, selected, config); }
    const stop = store.subscribe(render);
    render();
    const field = (name: string) => container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
    return {
      store, stop, render, field,
      select(id: string) { selected = id; render(); },
      get executeCount() { return executeCount; }, get lastErrors() { return lastErrors; },
      set(name: string, value: string, event = 'input') { const input = field(name); input.value = value; input.dispatchEvent(new Event(event, { bubbles: true })); },
      apply: () => container.querySelector<HTMLButtonElement>('#apply-opening-dimensions')!,
      match: (mode: 'height' | 'size') => container.querySelector<HTMLButtonElement>(`[data-window-match="${mode}"]`)!,
      form: () => container.querySelector<HTMLFormElement>('#inspector-opening')!,
    };
  }

  scenario('Dirty and reverted drafts', h => {
    check(h.form().checkValidity() && h.apply().disabled, 'Pristine opening is valid and Apply is disabled');
    check(!h.match('height').disabled && h.match('height').dataset.targetCount === '2', 'Height action counts only two changed active windows');
    check(h.match('size').dataset.targetCount === '2', 'Size action excludes source, doors, matching and removed windows');
    h.set('width', '1.6000');
    check(h.apply().disabled, 'Equivalent numeric formatting does not create an edit');
    h.set('width', '1.8');
    check(!h.apply().disabled && h.match('height').disabled && h.match('size').disabled, 'Draft enables Apply and gates both match actions');
    check(container.querySelector('#window-match-note')!.textContent!.includes('Apply'), 'Disabled actions explain that the selected draft needs applying');
    h.match('height').click();
    check(h.store.revision === 0 && h.executeCount === 0, 'A disabled match action never submits the unsaved dimensions');
    h.set('width', '1.6');
    check(h.apply().disabled && !h.match('height').disabled, 'Reverting a dimension restores pristine actions');
    h.set('hinge', 'left', 'change');
    check(!h.apply().disabled && h.match('size').disabled, 'An orientation change also gates matching');
    h.set('hinge', '', 'change');
    check(h.apply().disabled && !h.match('size').disabled, 'Reverting a select also clears the draft');
    h.form().requestSubmit();
    check(h.executeCount === 0 && !h.store.canUndo, 'A pristine form submission creates no command or history');
  });

  scenario('Apply to selected window', h => {
    const before = structuredClone(h.store.scene);
    h.set('height', '1.7');
    h.apply().click();
    check(h.store.revision === 1 && opening(h.store.scene, 'qa-source').height === 1.7, 'Apply commits the selected height');
    for (const wall of before.walls) for (const item of wall.openings) {
      equal(opening(h.store.scene, item.id), item.id === 'qa-source' ? { ...item, height: 1.7 } : item, 'Applying the selected window leaves all other opening fields intact');
    }
    equal(h.store.scene.project!.metadata, before.project!.metadata, 'Applying dimensions preserves unspecified frame/orientation metadata');
    check(h.apply().disabled && !h.match('height').disabled, 'Successful submit clears the draft and enables matching');
    check(h.match('height').dataset.targetCount === '3' && h.match('size').dataset.targetCount === '3', 'Actions recalculate the changed count using applied dimensions');
  });

  scenario('Frame-only edit', h => {
    const before = structuredClone(h.store.scene);
    h.set('frameWidth', '0.045');
    h.apply().click();
    check(h.store.revision === 1 && !h.lastErrors.length, 'Frame-only submit passes real operation validation');
    equal(h.store.scene.walls, before.walls, 'Frame-only submit preserves opening geometry');
    check(h.store.scene.project!.metadata['qa-source']!.frameWidth === 0.045 && h.apply().disabled, 'Frame metadata commits and clears the draft');
    check(h.store.undo().ok && JSON.stringify(h.store.scene) === JSON.stringify(before), 'Frame-only change is one undoable edit');
  });

  for (const mode of ['height', 'size'] as const) scenario(`${mode} matching and history`, h => {
    const before = structuredClone(h.store.scene);
    h.match(mode).click();
    check(h.executeCount === 1 && h.store.revision === 1 && h.store.canUndo, 'One click submits one command');
    for (const wall of before.walls) for (const item of wall.openings) {
      const changed = ['qa-first', 'qa-second'].includes(item.id);
      const expected = changed ? { ...item, height: 1.5, ...(mode === 'size' ? { width: 1.6 } : {}) } : item;
      equal(opening(h.store.scene, item.id), expected, 'Only requested dimensions change; sill, offset, kind, doors and removed windows survive');
    }
    equal(h.store.scene.project!.metadata, before.project!.metadata, 'Matching preserves names, mechanisms, frames, orientation and phases');
    check(h.match(mode).disabled && h.match(mode).dataset.targetCount === '0', 'An applied match becomes disabled with no remaining targets');
    check(h.match(mode).textContent!.includes('Already matched'), 'The zero-target action explains its state');
    if (mode === 'height') check(h.match('size').dataset.targetCount === '2' && !h.match('size').disabled, 'Different widths remain available for size matching');
    const after = JSON.stringify(h.store.scene);
    h.match(mode).click();
    check(h.store.revision === 1 && h.executeCount === 1, 'Already matched action produces no extra history');
    check(h.store.undo().ok && JSON.stringify(h.store.scene) === JSON.stringify(before) && !h.store.canUndo, 'One undo restores every window');
    check(h.match(mode).dataset.targetCount === '2' && !h.match(mode).disabled, 'Undo restores the target count and action');
    check(h.store.redo().ok && JSON.stringify(h.store.scene) === after, 'One redo reapplies the complete match');
  });

  scenario('Door controls', h => {
    h.select('qa-door');
    check(!container.querySelector('[data-window-match]'), 'A door never offers window matching actions');
    check(h.apply().textContent!.includes('door'), 'The selected-opening action identifies the door');
    h.set('sill', '-0');
    check(h.apply().disabled, 'Negative zero and zero describe the same opening base and do not create a draft');
  });

  for (const lockedId of ['qa-second', 'qa-target-wall']) {
    const scene = windowDimensionsQAScene();
    scene.project!.metadata[lockedId] = { ...scene.project!.metadata[lockedId], locked: true };
    scenario(`Locked ${lockedId}`, h => {
      const before = JSON.stringify(h.store.scene);
      h.match('height').click();
      const alert = container.querySelector<HTMLElement>('.inspector-window-match [role="alert"]')!;
      check(!alert.hidden && /lock/i.test(alert.textContent ?? ''), 'A locked target or host produces a visible explanation');
      check(JSON.stringify(h.store.scene) === before && h.store.revision === 0 && !h.store.canUndo, 'Lock rejection changes no window or history');
      check(h.executeCount === 0, 'Lock rejection happens before a partial command can submit');
    }, scene);
  }

  scenario('Rejected selected resize keeps the draft', h => {
    const before = JSON.stringify(h.store.scene);
    h.set('width', '20');
    check(h.form().checkValidity(), 'A wall-fit failure can pass native numeric input constraints');
    h.apply().click();
    check(h.lastErrors.length > 0 && h.executeCount === 1, 'The store rejects a selected opening outside its wall');
    check(JSON.stringify(h.store.scene) === before && h.store.revision === 0 && !h.store.canUndo, 'Rejected resize changes neither scene nor history');
    check(h.field('width').value === '20' && !h.apply().disabled && h.match('height').disabled, 'Rejected dimensions remain editable and matching stays gated');
    h.set('width', '1.8');
    h.apply().click();
    check(opening(h.store.scene, 'qa-source').width === 1.8 && h.store.revision === 1, 'The retained draft can be corrected and successfully applied');
  });

  const constrained = windowDimensionsQAScene();
  opening(constrained, 'qa-second').sill = 1.8;
  scenario('Rejected matching is atomic', h => {
    const before = JSON.stringify(h.store.scene);
    h.match('height').click();
    check(h.lastErrors.length > 0, 'Matching rejects a target whose sill and proposed height exceed the host');
    check(JSON.stringify(h.store.scene) === before && h.store.revision === 0 && !h.store.canUndo, 'No earlier target changes when a later target fails validation');
    check(!h.match('height').disabled && h.match('height').dataset.targetCount === '2', 'Rejected matching preserves the actionable target count');
  }, constrained);

  if (failures.length) throw new Error(`Window resize DOM checks failed (${failures.length}): ${failures.join(' | ')}`);
  return `Window resize DOM checks passed: ${assertions} assertions across ${scenarios} scenarios.`;
}
