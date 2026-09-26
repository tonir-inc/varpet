import { DEFAULT_SUN, type SunSettings } from '../render/sunlight';
import { timeOfDayLighting } from '../render/time-of-day';
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
const times = [{ label: 'Morning', hour: 9 }, { label: 'Noon', hour: 12 }, { label: 'Sunset', hour: 18 }, { label: 'Night', hour: 22 }] as const;
const clockLabel = (hour: number) => {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

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
    <header class="sun-heading"><h2 id="sun-title">Sun & time</h2><button type="button" class="icon-button" data-sun-close aria-label="Close sun controls">${icon('close')}</button></header>
    <div class="sun-time-controls">
      <div class="sun-field"><label for="sun-time">Time of day <output for="sun-time" id="sun-time-value"></output></label><input id="sun-time" type="range" min="0" max="24" step="0.25" aria-describedby="sun-time-note" /><div class="sun-endpoints" aria-hidden="true"><span>00:00</span><span>12:00</span><span>24:00</span></div></div>
      <div class="sun-presets" role="group" aria-label="Time of day presets">${times.map(time => `<button type="button" class="button" data-sun-time-preset="${time.hour}">${time.label}</button>`).join('')}</div>
      <label class="sun-enabled"><span>Automatic room lights</span><input id="sun-auto-lights" type="checkbox" role="switch" aria-describedby="sun-time-note" /></label>
      <p id="sun-time-note"></p>
    </div>
    <div class="sun-sliders">
      <div class="sun-field">
        <label for="sun-azimuth">Direction <output for="sun-azimuth sun-compass" id="sun-azimuth-value"></output></label>
        <div id="sun-compass" class="sun-compass" role="slider" tabindex="0" aria-label="Sun direction compass" aria-valuemin="0" aria-valuemax="359" aria-describedby="sun-direction-note">
          <svg viewBox="0 0 160 160" aria-hidden="true" focusable="false">
            <circle class="sun-compass-face" cx="80" cy="80" r="55" />
            <circle class="sun-compass-orbit" cx="80" cy="80" r="48" />
            <path class="sun-compass-guides" d="M80 25v10 M80 125v10 M25 80h10 M125 80h10 M41 41l7 7 M112 112l7 7 M41 119l7-7 M112 48l7-7" />
            <text x="80" y="12">N</text><text x="148" y="80">E</text><text x="80" y="148">S</text><text x="12" y="80">W</text>
            <g data-sun-bearing>
              <path class="sun-compass-bearing" d="M80 80V32" />
              <circle class="sun-compass-handle" cx="80" cy="32" r="13" />
              <g class="sun-compass-glyph"><circle cx="80" cy="32" r="4" /><path d="M80 23v2 M80 39v2 M71 32h2 M87 32h2 M74 26l1.5 1.5 M84.5 36.5L86 38 M74 38l1.5-1.5 M84.5 27.5L86 26" /></g>
            </g>
            <circle class="sun-compass-center" cx="80" cy="80" r="4" />
          </svg>
        </div>
        <input id="sun-azimuth" type="range" min="0" max="360" step="1" aria-describedby="sun-direction-note" />
        <p id="sun-direction-note">Drag the sun or click a direction. The sun shines from this side of the apartment.</p>
      </div>
    </div>
    <details class="sun-advanced"><summary>More sun controls</summary><div class="sun-manual">
      <label class="sun-enabled"><span>Direct sunlight</span><input id="sun-enabled" type="checkbox" role="switch" /></label>
      <div class="sun-field"><label for="sun-elevation">Elevation <output for="sun-elevation" id="sun-elevation-value"></output></label><input id="sun-elevation" type="range" min="5" max="85" step="1" aria-describedby="sun-elevation-note" /><p id="sun-elevation-note">Changing elevation returns to manual sunlight.</p></div>
      <div class="sun-field"><label for="sun-intensity">Strength <output for="sun-intensity" id="sun-intensity-value"></output></label><input id="sun-intensity" type="range" min="0" max="200" step="5" /></div>
      <div class="sun-presets" role="group" aria-label="Sun position presets">${presets.map((preset, index) => `<button type="button" class="button" data-sun-preset="${index}">${preset.label}</button>`).join('')}</div>
    </div></details>
    <div class="sun-footer"><p id="sun-preview-note">Approximate day/night preview. Site orientation is not surveyed.</p><button type="button" class="button quiet" data-sun-reset>Reset</button></div>
  `;
  host.append(panel);
  const get = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const enabled = get<HTMLInputElement>('#sun-enabled');
  const time = get<HTMLInputElement>('#sun-time');
  const autoLights = get<HTMLInputElement>('#sun-auto-lights');
  const azimuth = get<HTMLInputElement>('#sun-azimuth');
  const compass = get<HTMLDivElement>('#sun-compass');
  const bearing = panel.querySelector<SVGGElement>('[data-sun-bearing]')!;
  const elevation = get<HTMLInputElement>('#sun-elevation');
  const intensity = get<HTMLInputElement>('#sun-intensity');
  const abort = new AbortController();
  const signal = abort.signal;
  let tabbing = false;
  let dragPointer: number | undefined;
  const endDrag = () => {
    const pointer = dragPointer;
    dragPointer = undefined;
    compass.classList.remove('dragging');
    if (pointer !== undefined && compass.hasPointerCapture(pointer)) compass.releasePointerCapture(pointer);
  };

  const refresh = (settings = options.getSun()) => {
    enabled.checked = settings.enabled;
    const hour = settings.timeOfDay;
    const timeLabel = hour == null ? 'Manual' : `${clockLabel(hour)} · ${timeOfDayLighting(hour).phase}`;
    time.value = String(hour ?? 15);
    time.setAttribute('aria-valuetext', hour == null ? 'Manual sunlight; choose a time of day' : timeLabel);
    get<HTMLOutputElement>('#sun-time-value').textContent = timeLabel;
    autoLights.checked = settings.autoLights !== false;
    get('#sun-time-note').textContent = hour == null ? 'Choose a time to preview day and night.' : autoLights.checked
      ? 'Installed lights come on at dusk. Your switch adjustments take priority.'
      : 'Room lights use their saved settings and your switch adjustments.';
    for (const [input, value] of [[azimuth, settings.azimuth], [elevation, settings.elevation], [intensity, settings.intensity]] as const) {
      // Keep the equivalent 360° endpoint while the direction slider has focus.
      if (!(input === azimuth && input.valueAsNumber === 360 && value === 0 && document.activeElement === input)) input.value = String(value);
      input.disabled = !settings.enabled;
    }
    const degrees = azimuth.valueAsNumber;
    const direction = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
    const directionLabel = `${degrees}° ${direction}`;
    bearing.setAttribute('transform', `rotate(${settings.azimuth} 80 80)`);
    compass.setAttribute('aria-valuenow', String(settings.azimuth));
    compass.setAttribute('aria-valuetext', `${settings.azimuth}° ${direction}`);
    compass.setAttribute('aria-disabled', String(!settings.enabled));
    compass.tabIndex = settings.enabled ? 0 : -1;
    if (!settings.enabled) endDrag();
    get<HTMLOutputElement>('#sun-azimuth-value').textContent = directionLabel;
    get<HTMLOutputElement>('#sun-elevation-value').textContent = `${Math.round(settings.elevation)}°`;
    get<HTMLOutputElement>('#sun-intensity-value').textContent = `${settings.intensity}%`;
    azimuth.setAttribute('aria-valuetext', directionLabel);
    elevation.setAttribute('aria-valuetext', `${settings.elevation} degrees above the horizon`);
    intensity.setAttribute('aria-valuetext', `${settings.intensity} percent`);
    trigger.title = hour != null ? `${timeLabel} · ${directionLabel}` : settings.enabled ? `Sunlight · ${directionLabel} · ${settings.elevation}° elevation` : 'Sunlight is off';
    panel.querySelectorAll<HTMLButtonElement>('[data-sun-time-preset]').forEach(button => {
      button.setAttribute('aria-pressed', String(hour === Number(button.dataset.sunTimePreset)));
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-sun-preset]').forEach(button => {
      const preset = presets[Number(button.dataset.sunPreset)]!;
      button.setAttribute('aria-pressed', String(hour == null && settings.enabled && settings.azimuth === preset.azimuth && settings.elevation === preset.elevation && settings.intensity === preset.intensity));
    });
  };

  const position = () => {
    if (panel.hidden) return;
    const anchor = trigger.getBoundingClientRect();
    const bounds = host.getBoundingClientRect();
    const viewport = window.visualViewport;
    const inset = 8;
    const originX = bounds.left + host.clientLeft;
    const originY = bounds.top + host.clientTop;
    const minX = Math.max(originX, viewport?.offsetLeft ?? 0) + inset;
    const minY = Math.max(originY, viewport?.offsetTop ?? 0) + inset;
    const maxX = Math.min(originX + host.clientWidth, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth)) - inset;
    const maxY = Math.min(originY + host.clientHeight, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) - inset;
    const above = Math.max(0, anchor.top - inset - minY);
    const below = Math.max(0, maxY - anchor.bottom - inset);
    // The same controls can live in the top toolbar or the bottom Folio dock.
    // Use the roomy side and scroll inside the panel instead of clipping it below the dock.
    const opensAbove = above > below;
    panel.dataset.side = opensAbove ? 'above' : 'below';
    panel.style.maxWidth = `${Math.max(0, maxX - minX)}px`;
    panel.style.maxHeight = `${opensAbove ? above : below}px`;
    const left = Math.max(minX, Math.min(anchor.right - panel.offsetWidth, maxX - panel.offsetWidth));
    const proposedTop = opensAbove ? anchor.top - inset - panel.offsetHeight : anchor.bottom + inset;
    const top = Math.max(minY, Math.min(proposedTop, maxY - panel.offsetHeight));
    panel.style.left = `${left - originX + host.scrollLeft}px`;
    panel.style.top = `${top - originY + host.scrollTop}px`;
  };
  const close = (restoreFocus = false) => {
    if (panel.hidden) return;
    endDrag();
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
    panel.scrollTop = 0;
    position(); time.focus({ preventScroll: true });
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
  time.addEventListener('input', () => update({ timeOfDay: time.valueAsNumber, enabled: true }), { signal });
  autoLights.addEventListener('change', () => update({ autoLights: autoLights.checked }), { signal });
  panel.querySelectorAll<HTMLButtonElement>('[data-sun-time-preset]').forEach(button => {
    button.addEventListener('click', () => update({ timeOfDay: Number(button.dataset.sunTimePreset), enabled: true }), { signal });
  });
  const pointSun = (event: PointerEvent) => {
    const bounds = compass.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    // There is no bearing at the center; avoid a jump while crossing it.
    if (Math.hypot(x, y) < 10) return;
    const degrees = Math.round(Math.atan2(x, -y) * 180 / Math.PI);
    update({ azimuth: (degrees + 360) % 360 });
  };
  compass.addEventListener('pointerdown', event => {
    if (!options.getSun().enabled || !event.isPrimary || event.button !== 0 || dragPointer !== undefined) return;
    event.preventDefault();
    compass.focus({ preventScroll: true });
    dragPointer = event.pointerId;
    compass.setPointerCapture(event.pointerId);
    compass.classList.add('dragging');
    pointSun(event);
  }, { signal });
  compass.addEventListener('pointermove', event => {
    if (event.pointerId === dragPointer) pointSun(event);
  }, { signal });
  compass.addEventListener('pointerup', event => {
    if (event.pointerId !== dragPointer) return;
    pointSun(event); endDrag();
  }, { signal });
  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
    compass.addEventListener(type, event => { if (event.pointerId === dragPointer) endDrag(); }, { signal });
  }
  compass.addEventListener('keydown', event => {
    const settings = options.getSun();
    if (!settings.enabled) return;
    const step = event.shiftKey ? 10 : 1;
    let degrees = settings.azimuth;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowUp': degrees += step; break;
      case 'ArrowLeft': case 'ArrowDown': degrees -= step; break;
      case 'PageUp': degrees += 15; break;
      case 'PageDown': degrees -= 15; break;
      case 'Home': degrees = 0; break;
      case 'End': degrees = 359; break;
      default: return;
    }
    event.preventDefault();
    update({ azimuth: (degrees + 360) % 360 });
  }, { signal });
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
  resize.observe(host); resize.observe(trigger); resize.observe(panel);
  get<HTMLDetailsElement>('.sun-advanced').addEventListener('toggle', position, { signal });
  window.addEventListener('resize', position, { signal });
  window.addEventListener('scroll', position, { signal, capture: true });
  window.visualViewport?.addEventListener('resize', position, { signal });
  window.visualViewport?.addEventListener('scroll', position, { signal });
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
    dispose() { endDrag(); abort.abort(); resize.disconnect(); panel.remove(); },
  };
}
