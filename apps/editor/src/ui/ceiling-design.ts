import type { CeilingDesign, Operation, SceneDocument } from '../contracts';
import { CEILING_PRESETS, buildCeilingDesignOperations, defaultCeilingDesign } from '../core/ceiling-design';
import { hasRoomCeiling, roomCeilingHeight } from '../core/heights';
import { buildCeilingSwitchOperations } from '../core/generated-ceilings';
import './ceiling-design.css';

export interface CeilingUIOptions {
  getScene(): SceneDocument;
  execute(operations: Operation[], label: string): boolean;
  select(id: string): void;
  inspect(id: string, evening: boolean): void;
  notice(message: string, error?: boolean): void;
  toggleSwitch?(id: string): void;
  getSwitchLevel?(id: string): number;
}

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function createCeilingUI(container: HTMLElement, options: CeilingUIOptions) {
  let roomId = '';
  let draft: CeilingDesign = defaultCeilingDesign('quiet');
  let sourceKey = '';
  let dirty = false;
  let evening = true;
  const readDesign = () => options.getScene().project?.metadata[roomId]?.ceilingDesign;

  function syncLighting() {
    container.querySelectorAll<HTMLButtonElement>('[data-ceiling-switch]').forEach(button => {
      const on = (options.getSwitchLevel?.(button.dataset.ceilingSwitch!) ?? (readDesign()?.enabled ? 1 : 0)) > 0;
      button.textContent = on ? 'Turn off' : 'Turn on';
      button.setAttribute('aria-pressed', String(on));
    });
  }

  function error(message: string) {
    const output = container.querySelector<HTMLElement>('[data-ceiling-error]');
    if (output) { output.textContent = message; output.hidden = false; }
    options.notice(message, true);
  }
  function render() {
    const scene = options.getScene();
    const rooms = scene.rooms.filter(room => hasRoomCeiling(scene, room) && scene.project?.metadata[room.id]?.phase !== 'remove');
    if (!rooms.some(room => room.id === roomId)) { roomId = rooms[0]?.id ?? ''; sourceKey = ''; dirty = false; }
    container.classList.add('ceiling-library');
    if (!roomId) {
      container.innerHTML = '<p class="ceiling-intro">Add an interior room in Renovate to start designing its ceiling.</p>';
      return;
    }
    const room = rooms.find(room => room.id === roomId)!;
    const saved = readDesign();
    const key = JSON.stringify([scene.id, roomId, saved]);
    // History/import updates replace the draft; unrelated scene refreshes preserve typing.
    if (key !== sourceKey) { draft = saved ? { ...saved } : defaultCeilingDesign('quiet'); sourceKey = key; dirty = false; }
    const locked = scene.project?.metadata[roomId]?.locked;
    const switches = scene.project?.components.filter(component => component.kind === 'switch' && component.phase !== 'remove' && scene.project?.metadata[component.id]?.phase !== 'remove' && component.control?.targets.includes(roomId)) ?? [];
    container.innerHTML = `
      <p class="ceiling-intro">Shape the ceiling and the light beneath it. Choose a room, then make the design your own.</p>
      <label class="text-field">Room<select data-ceiling-room>${rooms.map(r => `<option value="${esc(r.id)}" ${r.id === roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <div class="ceiling-room-meta"><span>${roomCeilingHeight(scene, room).toFixed(2)} m ceiling</span><span>${saved ? 'Design applied' : 'Original ceiling'}</span></div>
      <form data-ceiling-form>
        <fieldset class="ceiling-presets" ${locked ? 'disabled' : ''}><legend>Choose a composition</legend>
          ${CEILING_PRESETS.map(preset => `<label class="ceiling-preset"><input type="radio" name="ceiling-style" value="${preset.id}" ${draft.style === preset.id ? 'checked' : ''}><span><strong>${esc(preset.name)}</strong><small>${esc(preset.description)}</small></span></label>`).join('')}
        </fieldset>
        <fieldset class="ceiling-settings" ${locked ? 'disabled' : ''}><legend>Make it yours</legend>
          <label class="ceiling-range"><span>Brightness <output data-output="brightness">${draft.brightness}%</output></span><input aria-label="Ceiling brightness" name="brightness" type="range" min="0" max="100" step="1" value="${draft.brightness}"></label>
          <label class="ceiling-range"><span>Light warmth <output data-output="temperature">${draft.temperature} K</output></span><input aria-label="Ceiling light warmth" name="temperature" type="range" min="2200" max="6500" step="100" value="${draft.temperature}"><small><span>Warm</span><span>Cool</span></small></label>
          <div class="ceiling-dimensions"><label class="text-field">${draft.style === 'soft-glow' ? 'Panel drop' : 'Fixture drop'} (m)<input name="drop" type="number" step="0.01" min="${draft.style === 'soft-glow' ? '.1' : '0'}" max=".6" value="${draft.drop}" required></label><label class="text-field">Inset (m)<input name="inset" type="number" step="0.05" min=".15" max="2" value="${draft.inset}" required></label></div>
          <label class="ceiling-toggle"><input name="enabled" type="checkbox" ${draft.enabled ? 'checked' : ''}>Start with lights on</label>
          <button type="submit" class="button primary full">${dirty ? 'Apply changes' : 'Apply ceiling design'}</button>
        </fieldset>
        <p class="ceiling-error" data-ceiling-error role="alert" hidden></p>
      </form>
      ${locked ? '<p class="ceiling-note">This room is locked. Unlock it in Renovate to change its ceiling.</p>' : ''}
      ${saved ? `<div class="ceiling-preview"><strong>Room switches</strong><p>Try the lights here, tap a wall switch in Inside, or click a selected switch in 3D. Switching is a temporary preview.</p>${switches.map(component => `<div class="ceiling-switch"><span>${esc(component.name)}</span><button type="button" class="button" data-ceiling-switch="${esc(component.id)}" aria-pressed="${(options.getSwitchLevel?.(component.id) ?? (saved.enabled ? 1 : 0)) > 0}" ${!options.toggleSwitch ? 'disabled' : ''}>${(options.getSwitchLevel?.(component.id) ?? (saved.enabled ? 1 : 0)) > 0 ? 'Turn off' : 'Turn on'}</button></div>`).join('')}${!switches.length ? `<button type="button" class="button full" data-ceiling-add-switch ${locked ? 'disabled' : ''}>Add a wall switch</button><p class="ceiling-note">Adds a proposed switch on an available wall in this room.</p>` : ''}</div>` : ''}
      <div class="ceiling-preview"><strong>See it from inside</strong><p>Look up to explore the ceiling. Evening makes the lighting easier to compare.</p><label class="ceiling-toggle"><input data-ceiling-evening type="checkbox" ${evening ? 'checked' : ''}>Evening preview</label><button type="button" class="button full" data-ceiling-inspect>View this room</button></div>
      <button type="button" class="button quiet full" data-ceiling-remove ${!saved || locked ? 'disabled' : ''}>Restore original ceiling</button>
      <p class="ceiling-note">Presets fit inside the room and follow its height. Applied designs save with your apartment. Individual fixture placement comes later.</p>`;

    container.querySelector<HTMLSelectElement>('[data-ceiling-room]')!.onchange = event => {
      roomId = (event.target as HTMLSelectElement).value; sourceKey = ''; dirty = false;
      options.select(roomId); render();
    };
    container.querySelectorAll<HTMLInputElement>('[name="ceiling-style"]').forEach(input => input.onchange = () => {
      draft = defaultCeilingDesign(input.value as CeilingDesign['style']); dirty = true; render();
    });
    const form = container.querySelector<HTMLFormElement>('[data-ceiling-form]')!;
    form.oninput = event => {
      const input = event.target as HTMLInputElement;
      if (input.name === 'ceiling-style') return;
      if (input.name === 'enabled') draft.enabled = input.checked;
      else if (['brightness', 'temperature', 'drop', 'inset'].includes(input.name)) {
        const field = input.name as 'brightness' | 'temperature' | 'drop' | 'inset';
        draft[field] = input.valueAsNumber;
        const output = form.querySelector<HTMLOutputElement>(`[data-output="${field}"]`);
        if (output) output.value = `${draft[field]}${field === 'brightness' ? '%' : ' K'}`;
      }
      dirty = true;
      form.querySelector<HTMLButtonElement>('[type="submit"]')!.textContent = 'Apply changes';
    };
    form.onsubmit = event => {
      event.preventDefault();
      try {
        const operations = buildCeilingDesignOperations(options.getScene(), roomId, { ...draft });
        if (!operations.length) {
          dirty = false; sourceKey = ''; render();
          options.notice('This ceiling design is already applied.');
          return;
        }
        if (options.execute(operations, `Apply ${CEILING_PRESETS.find(p => p.id === draft.style)!.name} ceiling`)) {
          dirty = false; sourceKey = ''; render();
        }
      } catch (cause) { error(cause instanceof Error ? cause.message : 'This ceiling design could not be applied.'); }
    };
    container.querySelector<HTMLInputElement>('[data-ceiling-evening]')!.onchange = event => { evening = (event.target as HTMLInputElement).checked; };
    container.querySelector<HTMLButtonElement>('[data-ceiling-inspect]')!.onclick = () => options.inspect(roomId, evening);
    container.querySelector<HTMLButtonElement>('[data-ceiling-remove]')!.onclick = () => {
      try { if (options.execute(buildCeilingDesignOperations(options.getScene(), roomId, null), 'Restore original ceiling')) { sourceKey = ''; render(); } }
      catch (cause) { error(cause instanceof Error ? cause.message : 'Could not restore the ceiling.'); }
    };
    container.querySelectorAll<HTMLButtonElement>('[data-ceiling-switch]').forEach(button => button.onclick = () => {
      options.toggleSwitch?.(button.dataset.ceilingSwitch!); syncLighting();
    });
    const addSwitch = container.querySelector<HTMLButtonElement>('[data-ceiling-add-switch]');
    if (addSwitch) addSwitch.onclick = () => {
      try {
        const operations = buildCeilingSwitchOperations(options.getScene(), roomId);
        if (!operations.length) { options.notice('No clear wall position is available for a switch. Place and connect one in Renovate → Systems.', true); return; }
        if (options.execute(operations, 'Add ceiling light switch')) render();
      } catch (cause) { options.notice(cause instanceof Error ? cause.message : 'Could not add a switch.', true); }
    };
  }
  render();
  return {
    render,
    syncLighting,
    setSelection(id: string | null) {
      const scene = options.getScene();
      if (id && id !== roomId && scene.rooms.some(room => room.id === id && hasRoomCeiling(scene, room))) { roomId = id; sourceKey = ''; render(); }
    },
    dispose() { container.replaceChildren(); },
  };
}
