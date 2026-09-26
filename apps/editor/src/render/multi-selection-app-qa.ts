/** Real application wiring; catalog transport is replaced only in this isolated QA page. */
import { databaseCatalog } from '../adapters/database-catalog';
import { demoScene, localCatalog } from '../core/demo';
const output = document.querySelector<HTMLPreElement>('#qa-results')!;
const lines: string[] = [];
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const assert = (condition: unknown, label: string) => { if (!condition) throw new Error(label); lines.push(`PASS ${label}`); output.textContent = lines.join('\n'); };
const products = localCatalog.map(asset => ({ asset, priceSource: 'QA', sizeStatus: 'QA', attribution: 'Synthetic test furniture' }));
databaseCatalog.search = async () => ({ products, excluded: 0, nextOffset: null });
databaseCatalog.resolve = async ids => products.filter(product => ids.includes(product.asset.id));
const click = (selector: string, shiftKey = false) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing control ${selector}`);
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));
};
const value = (selector: string, next: number) => {
  const element = document.querySelector<HTMLInputElement>(selector)!;
  element.value = String(next); element.dispatchEvent(new Event('change', { bubbles: true }));
};
try {
  await import('../main');
  const file = document.querySelector<HTMLInputElement>('#file-input')!;
  const data = new DataTransfer(); data.items.add(new File([JSON.stringify(demoScene)], 'multi-selection-test.json', { type: 'application/json' }));
  file.files = data.files; file.dispatchEvent(new Event('change', { bubbles: true }));
  for (let count = 0; count < 120 && !document.querySelector('[data-object="coffee-table"]'); count++) await tick();
  assert(!!document.querySelector('[data-object="coffee-table"]'), 'furnished test scene loaded through normal import');
  click('[data-object="coffee-table"]'); click('[data-object="sofa"]', true);
  assert(document.querySelectorAll('.object-row.selected').length === 2, 'scene rows select multiple loose models');
  assert(!!document.querySelector('[data-group-axis="0"]'), 'loose models expose shared numeric movement');
  const before = Number(document.querySelector<HTMLInputElement>('[data-group-axis="0"]')!.value);
  value('[data-group-axis="0"]', before + 0.25);
  assert(document.querySelector('#revision')!.textContent === 'Revision 2', 'numeric furniture batch creates one revision');
  click('#undo');
  assert(Number(document.querySelector<HTMLInputElement>('[data-group-axis="0"]')!.value) === before, 'one undo restores multi-model inspector');
  click('#close-inspector');
  click('[data-action="select"][data-id="wall-west"]'); click('[data-action="select"][data-id="wall-east"]', true);
  assert(document.querySelector('#selection-status')!.textContent === '2 walls selected', 'renovation rows support Shift multi-selection');
  value('[data-wall-move-axis="0"]', 0.05);
  assert(document.querySelector('#revision')!.textContent === 'Revision 4', 'numeric wall batch creates one revision');
  click('#undo');
  assert(document.querySelector('#selection-status')!.textContent === '2 walls selected', 'undo keeps wall selection');
  click('#multi-select'); click('[data-action="select"][data-id="wall-west"]');
  assert(document.querySelector('#selection-status')!.textContent !== '2 walls selected', 'visible toggle removes selected wall without Shift');
  click('[data-action="select"][data-id="wall-west"]'); click('[data-tool="move"]');
  assert(document.querySelector('#multi-select')!.getAttribute('aria-pressed') === 'false', 'choosing Move exits selection-building mode');
  click('#plan-view'); await tick();
  assert(document.querySelectorAll('.fp-wall.is-selected').length === 2, 'Plan preserves and highlights wall selection');
  click('#perspective'); click('#close-inspector'); click('[data-object="coffee-table"]'); click('[data-object="sofa"]', true);
  output.textContent = lines.join('\n') + '\nPASS all editor multi-selection checks';
} catch (error) { output.textContent = lines.join('\n') + `\nFAIL ${error instanceof Error ? error.stack : error}`; }
