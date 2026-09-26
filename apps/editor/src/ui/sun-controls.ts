import { DEFAULT_SUN, type SunSettings } from '../render/sunlight';
import { icon } from './icons';
import './sun-controls.css';

interface SunControlOptions {
  getSun(): SunSettings;
  setSun(patch: Partial<SunSettings>): void;
}

export interface SunControls {
  refresh(settings?: SunSettings): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const presets = [
  { label: 'Low east', azimuth: 90, elevation: 20, intensity: 100 },
  { label: 'High south', azimuth: 180, elevation: 65, intensity: 100 },
  { label: 'Low west', azimuth: 270, elevation: 20, intensity: 100 },
] as const;

/** Temporary renderer controls; changing sunlight never edits the apartment document. */
export function createSunControls(trigger: HTMLButtonElement, host: HTMLElement, options: SunControlOptions): SunControls {
  const panel = document.createElement('section');
  panel.id = 'sun-controls';
  panel.className = 'sun-popover';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'sun-title');
  panel.setAttribute('aria-describedby', 'sun-preview-note');
  panel.innerHTML = `
    <header class="sun-heading"><h2 id="sun-title">Sunlight</h2><button type="button" class="icon-button" data-sun-close aria-label="Close sun controls">${icon('close')}</button></header>
    <label class="sun-enabled"><span>Direct sunlight</span><input id="sun-enabled" type="checkbox" role="switch" /></label>
    <div class="sun-sliders">
      <div class="sun-field"><label for="sun-azimuth">Direction <output for="sun-azimuth" id="sun-azimuth-value"></output></label><input id="sun-azimuth" type="range" min="0" max="360" step="1" aria-describedby="sun-direction-note" /><p id="sun-direction-note">0° N · 90° E · 180° S · 270° W</p></div>
      <div class="sun-field"><label for="sun-elevation">Elevation <output for="sun-elevation" id="sun-elevation-value"></output></label><input id="sun-elevation" type="range" min="5" max="85" step="1" /><div class="sun-endpoints" aria-hidden="true"><span>Low · 5°</span><span>High · 85°</span></div></div>
      <div class="sun-field"><label for="sun-intensity">Strength <output for="sun-intensity" id="sun-intensity-value"></output></label><input id="sun-intensity" type="range" min="0" max="200" step="5" /></div>
    </div>
    <div class="sun-presets" role="group" aria-label="Sun position presets">${presets.map((preset, index) => `<button type="button" class="button" data-sun-preset="${index}">${preset.label}</button>`).join('')}</div>
    <div class="sun-footer"><p id="sun-preview-note">Temporary visual preview. Site orientation is not surveyed.</p><button type="button" class="button quiet" data-sun-reset>Reset</button></div>
  `;
  host.append(panel);
  const get = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const enabled = get<HTMLInputElement>('#sun-enabled');
  const azimuth = get<HTMLInputElement>('#sun-azimuth');
  const elevation = get<HTMLInputElement>('#sun-elevation');
  const intensity = get<HTMLInputElement>('#sun-intensity');
  const abort = new AbortController();
  const signal = abort.signal;
  let tabbing = false;

  const refresh = (settings = options.getSun()) => {
    enabled.checked = settings.enabled;
    for (const [input, value] of [[azimuth, settings.azimuth], [elevation, settings.elevation], [intensity, settings.intensity]] as const) {
      // Keep the equivalent 360° endpoint while the direction slider has focus.
      if (!(input === azimuth && input.valueAsNumber === 360 && value === 0 && document.activeElement === input)) input.value = String(value);
      input.disabled = !settings.enabled;
    }
    const degrees = azimuth.valueAsNumber;
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
    const directionLabel = `${degrees}° ${compass}`;
    get<HTMLOutputElement>('#sun-azimuth-value').textContent = directionLabel;
    get<HTMLOutputElement>('#sun-elevation-value').textContent = `${settings.elevation}°`;
    get<HTMLOutputElement>('#sun-intensity-value').textContent = `${settings.intensity}%`;
    azimuth.setAttribute('aria-valuetext', directionLabel);
    elevation.setAttribute('aria-valuetext', `${settings.elevation} degrees above the horizon`);
    intensity.setAttribute('aria-valuetext', `${settings.intensity} percent`);
    trigger.title = settings.enabled ? `Sunlight · ${directionLabel} · ${settings.elevation}° elevation` : 'Sunlight is off';
    panel.querySelectorAll<HTMLButtonElement>('[data-sun-preset]').forEach(button => {
      const preset = presets[Number(button.dataset.sunPreset)]!;
      button.setAttribute('aria-pressed', String(settings.enabled && settings.azimuth === preset.azimuth && settings.elevation === preset.elevation && settings.intensity === preset.intensity));
    });
  };

  const position = () => {
    if (panel.hidden) return;
    const anchor = trigger.getBoundingClientRect();
    const bounds = host.getBoundingClientRect();
    const inset = 8;
    panel.style.maxWidth = `${Math.max(0, bounds.width - inset * 2)}px`;
    const left = Math.max(inset, Math.min(anchor.right - bounds.left - panel.offsetWidth, bounds.width - panel.offsetWidth - inset));
    const top = Math.max(inset, anchor.bottom - bounds.top + inset);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${Math.max(0, bounds.height - top - inset)}px`;
  };
  const close = (restoreFocus = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('active');
    if (restoreFocus && !trigger.hidden) trigger.focus({ preventScroll: true });
  };
  trigger.addEventListener('click', () => {
    if (!panel.hidden) { close(true); return; }
    refresh(); panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('active');
    position(); enabled.focus({ preventScroll: true });
  }, { signal });
  get<HTMLButtonElement>('[data-sun-close]').addEventListener('click', () => close(true), { signal });
  // Handle Escape before editor shortcuts, including when focus is on a range.
  window.addEventListener('keydown', event => {
    if (panel.hidden || event.key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation(); close(true);
  }, { signal, capture: true });
  panel.addEventListener('keydown', event => { tabbing = event.key === 'Tab'; event.stopPropagation(); }, { signal });
  panel.addEventListener('pointerdown', () => { tabbing = false; }, { signal });
  // Tabbing beyond the document reaches browser chrome without a new focusin.
  // A pointer on non-focusable panel content can also have no relatedTarget.
  panel.addEventListener('focusout', event => { if (tabbing && !event.relatedTarget) close(); tabbing = false; }, { signal });
  document.addEventListener('pointerdown', event => {
    if (!(event.target instanceof Node) || panel.contains(event.target) || trigger.contains(event.target)) return;
    close();
  }, { signal, capture: true });
  document.addEventListener('focusin', event => {
    if (!(event.target instanceof Node) || panel.contains(event.target) || trigger.contains(event.target)) return;
    close();
  }, { signal });
  const update = (patch: Partial<SunSettings>) => { options.setSun(patch); refresh(); };
  enabled.addEventListener('change', () => update({ enabled: enabled.checked }), { signal });
  azimuth.addEventListener('input', () => update({ azimuth: azimuth.valueAsNumber }), { signal });
  elevation.addEventListener('input', () => update({ elevation: elevation.valueAsNumber }), { signal });
  intensity.addEventListener('input', () => update({ intensity: intensity.valueAsNumber }), { signal });
  panel.querySelectorAll<HTMLButtonElement>('[data-sun-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const { azimuth, elevation, intensity } = presets[Number(button.dataset.sunPreset)]!;
      update({ enabled: true, azimuth, elevation, intensity });
    }, { signal });
  });
  get<HTMLButtonElement>('[data-sun-reset]').addEventListener('click', () => update(DEFAULT_SUN), { signal });
  const resize = new ResizeObserver(position);
  resize.observe(host); resize.observe(trigger);
  window.addEventListener('resize', position, { signal });
  refresh();
  return {
    refresh,
    setVisible(visible) {
      if (!visible) {
        const wasFocused = panel.contains(document.activeElement) || document.activeElement === trigger;
        close();
        if (wasFocused) host.querySelector<HTMLButtonElement>('#plan-view')?.focus({ preventScroll: true });
      }
      trigger.hidden = !visible;
      if (visible) position();
    },
    dispose() { abort.abort(); resize.disconnect(); panel.remove(); },
  };
}
