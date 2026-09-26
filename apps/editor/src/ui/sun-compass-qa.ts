/** Real DOM regression in an isolated host; never creates a renderer or loads project data. */
import { DEFAULT_SUN, normalizeSun, type SunSettings } from '../render/sunlight';
import { createSunControls, type SunControls } from './sun-controls';

const host = document.querySelector<HTMLElement>('#qa-host')!;
const trigger = document.querySelector<HTMLButtonElement>('#sun')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const status = document.querySelector<HTMLElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
let settings: SunSettings = { ...DEFAULT_SUN }, writes = 0, controls: SunControls;
function mount(): void {
  controls?.dispose(); settings = { ...DEFAULT_SUN }; writes = 0;
  trigger.hidden = false; trigger.classList.remove('active'); trigger.setAttribute('aria-expanded', 'false');
  controls = createSunControls(trigger, host, {
    getSun: () => ({ ...settings }),
    setSun: patch => { settings = normalizeSun(patch, settings); writes++; },
  });
}
mount(); trigger.click();

run.onclick = () => {
  run.disabled = true; status.textContent = 'Running'; results.textContent = '';
  let count = 0;
  const check = (condition: boolean, label: string) => {
    if (!condition) throw new Error(label);
    results.textContent += `PASS ${label}\n`; count++;
  };
  try {
    mount(); trigger.click();
    const panel = host.querySelector<HTMLElement>('#sun-controls')!;
    const compass = host.querySelector<HTMLElement>('#sun-compass')!;
    const range = host.querySelector<HTMLInputElement>('#sun-azimuth')!;
    const enabled = host.querySelector<HTMLInputElement>('#sun-enabled')!;
    const bearing = host.querySelector<SVGGElement>('[data-sun-bearing]')!;
    const key = (name: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true });
      compass.dispatchEvent(event); return event;
    };
    const marker = () => new DOMPoint(80, 32).matrixTransform(bearing.transform.baseVal.consolidate()!.matrix);
    const at = (degrees: number, x: number, y: number) => settings.azimuth === degrees
      && compass.getAttribute('aria-valuenow') === String(degrees)
      && Math.abs(marker().x - x) < .01 && Math.abs(marker().y - y) < .01;
    const preset = (index: number) => host.querySelector<HTMLButtonElement>(`[data-sun-preset="${index}"]`)!.click();
    check(settings.azimuth === 225 && marker().x < 80 && marker().y > 80 && compass.getAttribute('aria-valuetext') === '225° SW', 'Default compass points southwest');
    range.focus(); range.value = '0'; range.dispatchEvent(new Event('input', { bubbles: true }));
    check(at(0, 80, 32), 'Native direction range synchronizes north marker');
    preset(0); check(at(90, 128, 80) && settings.elevation === 20, 'Low east preset synchronizes marker and elevation');
    preset(1); check(at(180, 80, 128) && settings.elevation === 65, 'High south preset synchronizes marker and elevation');
    preset(2); check(at(270, 32, 80), 'Low west preset synchronizes marker');
    range.focus(); range.value = '360'; range.dispatchEvent(new Event('input', { bubbles: true }));
    check(at(0, 80, 32) && range.valueAsNumber === 360, 'Focused range preserves equivalent 360° endpoint');
    compass.focus(); key('End'); const forward = key('ArrowRight');
    const wrappedForward = at(0, 80, 32); key('ArrowLeft');
    check(wrappedForward && settings.azimuth === 359 && forward.defaultPrevented, 'Compass arrows wrap north in both directions');
    key('Home'); const home = settings.azimuth === 0; key('End');
    check(home && settings.azimuth === 359, 'Home and End reach range endpoints');
    key('Home'); key('ArrowUp'); key('ArrowRight', true);
    const stepped = settings.azimuth === 11; key('ArrowDown'); key('ArrowLeft', true);
    check(stepped && settings.azimuth === 0, 'Arrow keys use 1° and Shift uses 10° steps');
    key('PageUp'); const paged = settings.azimuth === 15; key('PageDown');
    check(paged && settings.azimuth === 0, 'Page keys adjust by 15°');
    enabled.click(); const beforeDisabled = writes; key('ArrowRight');
    check(!settings.enabled && writes === beforeDisabled && compass.getAttribute('aria-disabled') === 'true' && compass.tabIndex === -1 && range.disabled, 'Disabled controls reject keyboard edits and leave tab order');
    preset(0);
    check(settings.enabled && at(90, 128, 80) && compass.tabIndex === 0 && !range.disabled, 'A preset re-enables and synchronizes the compass');
    host.querySelector<HTMLButtonElement>('[data-sun-reset]')!.click();
    check(JSON.stringify(settings) === JSON.stringify(DEFAULT_SUN) && range.valueAsNumber === 225 && compass.getAttribute('aria-valuenow') === '225', 'Reset restores all sunlight defaults and both controls');
    compass.focus(); const escape = key('Escape');
    check(panel.hidden && document.activeElement === trigger && escape.defaultPrevented && trigger.getAttribute('aria-expanded') === 'false', 'Escape closes the panel and returns focus');
    trigger.click(); compass.focus(); controls.dispose(); const beforeDisposed = writes;
    key('ArrowRight'); range.dispatchEvent(new Event('input', { bubbles: true })); trigger.click();
    const afterDispose = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(afterDispose);
    check(!host.querySelector('#sun-controls') && writes === beforeDisposed && !afterDispose.defaultPrevented, 'Dispose removes the panel and local/global input listeners');
    status.textContent = `PASS ${count} compass DOM checks`;
  } catch (error) {
    results.textContent += `FAIL ${error instanceof Error ? error.message : String(error)}\n`;
    status.textContent = 'FAILED';
  } finally {
    mount(); trigger.click(); run.disabled = false;
  }
};
