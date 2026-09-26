import type { AgentProposal, SceneDocument } from '../contracts';
import { askDesigner } from '../adapters/designer-http';
type AskDesigner = typeof askDesigner;

interface MetricRow { label: string; value: string }
interface Message { role: 'user' | 'designer'; text: string; metrics?: MetricRow[] }
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Read the service's scoreLayout shape without inventing absent measurements. */
function proposalMetrics(value: unknown): MetricRow[] {
  const score = record(value), before = record(record(score.before).space), after = record(record(score.after).space);
  const area = (value: unknown) => measured(value) ? value.toFixed(2) : 'Unknown';
  const rooms = after.rooms;
  const paths = Array.isArray(rooms) ? rooms.flatMap(room => Array.isArray(record(room).walkways) ? record(room).walkways as unknown[] : [null]) : [];
  const knownPaths = paths.length > 0 && paths.every(path => measured(record(path).width_m));
  const width = knownPaths ? paths.reduce<number>((min, path) => Math.min(min, record(path).width_m as number), Infinity) : undefined;
  const blocked = paths.some(path => record(path).reachable === false);
  return [
    { label: 'Open floor · before → after', value: `${area(before.free_area_m2)} → ${area(after.free_area_m2)}${measured(before.free_area_m2) || measured(after.free_area_m2) ? ' m²' : ''}` },
    { label: 'Narrowest walkway · proposed', value: width === undefined ? 'Unknown' : `${width.toFixed(2)} m${blocked ? ' (blocked)' : ''}` },
    { label: 'Cost · furniture purchases', value: measured(score.cost_dram) && Number.isSafeInteger(score.cost_dram) ? `${score.cost_dram.toLocaleString('en-US')} ֏` : 'Unknown' },
  ];
}

export interface DesignerPanelState {
  messages: Message[]; busy: boolean; progress: string; options: string[];
  conversationId?: string; keep: string[]; elapsedSeconds: number;
  northDeg?: number; northPersisted: boolean; northError: string;
}
interface ConversationOptions {
  ask: AskDesigner;
  snapshot: () => { scene: SceneDocument; revision: number };
  onProposal: (proposal: AgentProposal) => void;
  onChange?: (state: DesignerPanelState) => void;
  canRequest?: () => boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => number;
}

/** Owns chat state only. A proposal can only leave through the editor's review callback. */
export function createDesignerConversation(options: ConversationOptions) {
  const state: DesignerPanelState = { messages: [], busy: false, progress: '', options: [], keep: [], elapsedSeconds: 0, northPersisted: false, northError: '' };
  let active: AbortController | undefined, disposed = false;
  const now = options.now ?? (() => performance.now());
  let started = 0, settingsScene = options.snapshot().scene.id;
  const northCache = new Map<string, { value?: number; persisted: boolean }>();
  const northKey = () => `varpet.designer.north:${encodeURIComponent(settingsScene)}`;
  const loadNorth = () => {
    let saved = northCache.get(settingsScene);
    if (!saved) {
      let value: number | undefined;
      try {
        const raw = options.storage?.getItem(northKey());
        if (raw?.trim() && measured(Number(raw)) && Number(raw) < 360) value = Number(raw);
      } catch { /* Browser storage may be unavailable; keep the setting in memory. */ }
      saved = { value, persisted: value !== undefined }; northCache.set(settingsScene, saved);
    }
    state.northDeg = saved.value; state.northPersisted = saved.persisted; state.northError = '';
  };
  loadNorth();
  const publish = () => { if (!disposed) options.onChange?.(structuredClone(state)); };
  const reply = (text: string, metrics?: MetricRow[]) => state.messages.push({ role: 'designer', text, ...(metrics ? { metrics } : {}) });
  const controller = {
    get state() { return structuredClone(state); },
    refreshSettings() {
      const id = options.snapshot().scene.id;
      if (disposed || id === settingsScene) return;
      settingsScene = id; loadNorth(); publish();
    },
    setNorth(input: string) {
      if (disposed || state.busy) return false;
      controller.refreshSettings();
      const value = input.trim() ? Number(input) : undefined;
      if (value !== undefined && (!measured(value) || value >= 360)) {
        state.northError = 'Enter degrees from 0 to below 360, or leave blank if unknown.'; publish(); return false;
      }
      state.northDeg = value; state.northError = ''; state.northPersisted = false;
      try {
        if (value === undefined) options.storage?.removeItem(northKey());
        else options.storage?.setItem(northKey(), String(value));
        state.northPersisted = options.storage !== undefined && value !== undefined;
      } catch { /* Session-only value remains usable when storage is full or blocked. */ }
      northCache.set(settingsScene, { value, persisted: state.northPersisted }); publish(); return true;
    },
    tick() {
      if (disposed || !state.busy) return;
      state.elapsedSeconds = Math.max(0, Math.floor((now() - started) / 1000)); publish();
    },
    suggest(): Promise<void> { return controller.send('Suggest one improvement for this room'); },
    setKeep(id: string, keep: boolean) {
      if (disposed || state.busy) return;
      const ids = new Set(state.keep);
      if (keep && options.snapshot().scene.objects.some(object => object.id === id)) ids.add(id);
      else ids.delete(id);
      state.keep = [...ids]; publish();
    },
    async send(message: string) {
      const request = message.trim();
      if (disposed || state.busy || !request) return;
      controller.refreshSettings();
      if (state.northError) { reply(state.northError); publish(); return; }
      if (options.canRequest?.() === false) { reply('Finish the current preview or request, then try again.'); publish(); return; }
      const { scene, revision } = options.snapshot();
      const abortController = new AbortController(); active = abortController;
      state.keep = state.keep.filter(id => scene.objects.some(object => object.id === id));
      state.messages.push({ role: 'user', text: request });
      started = now(); state.elapsedSeconds = 0;
      state.busy = true; state.progress = 'Sending your request to the designer…'; state.options = []; publish();
      try {
        const result = await options.ask({ scene: structuredClone(scene), revision, request,
          conversationId: state.conversationId, keep: [...state.keep], ...(state.northDeg === undefined ? {} : { northDeg: state.northDeg }) }, {
          signal: abortController.signal,
          onProgress: message => { if (active === abortController && !disposed) { state.progress = message; publish(); } },
        });
        if (disposed || active !== abortController) return;
        if (result.type !== 'error') state.conversationId = result.conversationId;
        if (result.type === 'proposal') {
          options.onProposal(result.proposal);
          reply(`${result.proposal.title}\n${result.proposal.description}\nReview the proposed change below before applying it.`, proposalMetrics(result.metrics));
        } else if (result.type === 'question') {
          reply(result.question); state.options = [...result.options];
        } else reply(result.message);
      } catch (error) {
        if (disposed || active !== abortController) return;
        reply(error instanceof Error ? error.message : 'The designer could not finish. Please try again.');
      } finally {
        if (!disposed && active === abortController) {
          active = undefined; state.busy = false; state.progress = ''; publish();
        }
      }
    },
    cancel() {
      if (!active) return;
      const controller = active; active = undefined; controller.abort();
      state.busy = false; state.progress = ''; reply('Request cancelled. You can try another request.'); publish();
    },
    dispose() { disposed = true; active?.abort(); active = undefined; },
  };
  return controller;
}

/** Recorded UI replay, deliberately labelled as demo and never presented as measured design advice. */
export function createRecordedDesigner(delayMs = 900): AskDesigner {
  let sequence = 0;
  return async (req, opts = {}) => {
    const conversationId = req.conversationId ?? `demo-${++sequence}`;
    opts.onProgress?.('Reviewing the recorded demo layout…');
    await new Promise<void>((resolve, reject) => {
      const signal = opts.signal;
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Request cancelled.', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delayMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    if (/paint|colou?r|decor|wall/i.test(req.request)) return { type: 'decline', conversationId,
      message: 'I can help arrange furniture, but I don’t choose paint colours or move walls. Try asking for a furniture layout.' };
    if (/coz[iy]|cos[iy]/i.test(req.request)) return { type: 'question', conversationId,
      question: 'What would make this room feel better for you?', options: ['More open floor', 'A place to read', 'Space for conversation'] };
    const table = req.scene.objects.find(object => object.id === 'coffee-table');
    const metadata = req.scene.project?.metadata[table?.id ?? ''];
    if (!table || req.keep?.includes(table.id) || table.groupId || metadata?.locked || metadata?.phase === 'retain') return {
      type: 'decline', conversationId, message: 'This recorded demo moves the coffee table. It cannot run when that piece is missing, grouped, locked or marked keep.' };
    const id = `demo-panel-${req.revision}-${++sequence}`;
    return { type: 'proposal', conversationId, proposal: { id, title: 'Try a little more room by the sofa',
      description: 'Recorded demo: shift the coffee table toward the centre of the room. Review this example before applying; no live design measurements were calculated.',
      command: { id, label: 'Move the coffee table', source: 'designer', baseRevision: req.revision,
        operations: [{ type: 'update', id: table.id, patch: { position: [-3.25, 0, table.position[2] === 1.2 ? 1.48 : 1.2] } }] } } };
  };
}

interface MountOptions extends Omit<ConversationOptions, 'ask' | 'onChange'> {
  ask?: AskDesigner; live?: boolean;
  subscribe?: (listener: () => void) => () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function mountDesignerPanel(host: HTMLElement, options: MountOptions) {
  host.classList.add('designer-panel');
  host.innerHTML = `<div class="designer-panel-heading"><strong>Talk to your designer</strong><span class="mock-label">${options.live ? 'CONNECTED' : 'DEMO REPLAY'}</span></div>
    <p class="designer-panel-intro">Tell me what you want to change and what should stay.</p>
    <div class="designer-messages" role="log" aria-label="Designer conversation" aria-live="polite"></div>
    <div class="designer-options" aria-label="Choose an answer"></div>
    <div class="designer-progress" hidden><span class="designer-progress-stage" role="status"></span><span class="designer-elapsed" aria-live="off"></span><small>You can cancel while the designer works.</small></div>
    <div class="designer-north"><label for="designer-north">North angle <span>°</span></label><input id="designer-north" type="number" min="0" max="359.999999" step="any" placeholder="Unknown" aria-describedby="designer-north-help designer-north-status" />
      <small id="designer-north-help">Clockwise from plan-up: 0° ↑, 90° →. Leave blank if unknown.</small><small id="designer-north-status" role="status"></small></div>
    <details class="designer-keeps"><summary>Keep pieces in place</summary><p>These pieces stay untouched in your next request.</p><div class="designer-keep-list"></div></details>
    <form class="designer-form"><label for="designer-request">What would you like to change?</label>
      <textarea id="designer-request" name="request" rows="3" maxlength="20000" placeholder="Make the living room feel bigger…" required></textarea>
      <div class="designer-actions"><button class="button primary" type="submit">Send request</button><button class="button quiet designer-cancel" type="button" hidden>Cancel</button></div>
    </form>
    ${options.live ? '' : '<p class="designer-demo-note">Recorded examples: “Move the table”, “Make it cozier”, or “Pick paint colours”.</p>'}`;
  const find = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const log = find<HTMLDivElement>('.designer-messages'), choices = find<HTMLDivElement>('.designer-options');
  const progress = find<HTMLDivElement>('.designer-progress'), input = find<HTMLTextAreaElement>('textarea');
  const send = find<HTMLButtonElement>('[type="submit"]'), cancel = find<HTMLButtonElement>('.designer-cancel');
  const keeps = find<HTMLDivElement>('.designer-keep-list');
  const north = find<HTMLInputElement>('#designer-north'), northStatus = find<HTMLElement>('#designer-north-status');
  let displayedMessages = 0, previousBusy = false;
  let ticker: ReturnType<typeof setInterval> | undefined;
  const renderKeeps = () => {
    const state = controller.state;
    keeps.replaceChildren();
    for (const object of options.snapshot().scene.objects) {
      const label = document.createElement('label'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = state.keep.includes(object.id); checkbox.disabled = state.busy;
      checkbox.onchange = () => controller.setKeep(object.id, checkbox.checked);
      label.append(checkbox, document.createTextNode(object.name)); keeps.append(label);
    }
    if (!keeps.childElementCount) keeps.textContent = 'There are no furniture pieces yet.';
  };
  let storage = options.storage;
  if (!storage) { try { storage = window.localStorage; } catch { /* Session-only settings. */ } }
  const renderNorth = (state: DesignerPanelState) => {
    if (document.activeElement !== north && !state.northError) north.value = state.northDeg === undefined ? '' : String(state.northDeg);
    north.disabled = state.busy; north.setCustomValidity(state.northError);
    northStatus.textContent = state.northError || (state.northDeg === undefined ? 'Sun direction unknown.' : state.northPersisted ? 'Saved on this device for this scene.' : 'For this session only; browser storage is unavailable.');
  };
  const controller = createDesignerConversation({ ...options, storage, ask: options.ask ?? (options.live ? askDesigner : createRecordedDesigner()),
    onChange: state => {
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
      for (const message of state.messages.slice(displayedMessages)) {
        const item = document.createElement('div'); item.className = `designer-message designer-message-${message.role}`;
        const author = document.createElement('strong'); author.textContent = message.role === 'user' ? 'You' : 'Designer';
        const text = document.createElement('p'); text.textContent = message.text;
        item.append(author, text);
        if (message.metrics) {
          const numbers = document.createElement('dl'); numbers.className = 'designer-metrics';
          for (const row of message.metrics) {
            const label = document.createElement('dt'), value = document.createElement('dd');
            label.textContent = row.label; value.textContent = row.value; numbers.append(label, value);
          }
          const note = document.createElement('small'); note.textContent = 'Service estimates. Paint and labour are not priced here.';
          item.append(numbers, note);
        }
        log.append(item);
      }
      displayedMessages = state.messages.length;
      if (nearBottom) log.scrollTop = log.scrollHeight;
      choices.replaceChildren();
      for (const option of state.options) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button';
        button.textContent = option; button.disabled = state.busy; button.onclick = () => { void controller.send(option); };
        choices.append(button);
      }
      find<HTMLElement>('.designer-progress-stage').textContent = state.progress === 'Designer is still working' ? 'Waiting for the designer’s reply…' : state.progress;
      find<HTMLElement>('.designer-elapsed').textContent = `${state.elapsedSeconds} s elapsed`;
      progress.hidden = !state.busy;
      cancel.hidden = !state.busy; send.disabled = state.busy; input.disabled = state.busy;
      host.setAttribute('aria-busy', String(state.busy));
      for (const checkbox of keeps.querySelectorAll<HTMLInputElement>('input')) checkbox.disabled = state.busy;
      if (previousBusy !== state.busy) {
        if (ticker !== undefined) clearInterval(ticker);
        ticker = state.busy ? setInterval(() => controller.tick(), 1000) : undefined;
        options.onBusyChange?.(state.busy);
        if (!state.busy && host.getClientRects().length) input.focus();
      }
      renderNorth(state);
      previousBusy = state.busy;
    },
  });
  find<HTMLFormElement>('form').onsubmit = event => {
    event.preventDefault(); const request = input.value;
    if (request.trim() && !controller.state.busy) {
      void controller.send(request);
      if (controller.state.busy) input.value = '';
    }
  };
  input.onkeydown = event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); find<HTMLFormElement>('form').requestSubmit(); }
  };
  cancel.onclick = () => controller.cancel();
  north.onchange = () => { controller.setNorth(north.validity.badInput ? 'invalid' : north.value); north.reportValidity(); };
  renderKeeps(); renderNorth(controller.state);
  const unsubscribe = options.subscribe?.(() => { controller.refreshSettings(); renderKeeps(); renderNorth(controller.state); });
  return { controller, dispose() { if (ticker !== undefined) clearInterval(ticker); controller.dispose(); unsubscribe?.(); host.replaceChildren(); } };
}
