import { designerEventProgress } from '../adapters/designer-events';
import { designerMarkdown } from './designer-markdown';
import { designerStarters } from './designer-starters';
export { designerMarkdown } from './designer-markdown';
import { EditorStore } from '../core/store';
import type { AgentProposal, CatalogAsset, SceneDocument } from '../contracts';
import { askDesigner, type DesignerRequest } from '../adapters/designer-http';
type AskDesigner = typeof askDesigner;

interface MetricRow { label: string; value: string }
type ProposalStatus = 'pending' | 'applied' | 'dismissed' | 'stale';
export type ProposalAction = 'preview' | 'apply' | 'dismiss';
interface Message { role: 'user' | 'designer'; text: string; metrics?: MetricRow[]; proposal?: AgentProposal; status?: ProposalStatus; options?: string[]; notes?: string; suggestions?: string[]; retryRequest?: string }
interface Conversation { id: string; title: string; conversationId?: string; messages: Message[]; options: string[] }
interface History { version: 1; activeId: string; conversations: Conversation[] }
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

function appendNotes(parent: HTMLElement, value?: string): void {
  if (value === undefined) return;
  const notes = document.createElement('details'); notes.className = 'designer-proposal-notes';
  const summary = document.createElement('summary'); summary.textContent = 'Notes';
  const content = document.createElement('p'); content.textContent = value;
  notes.append(summary, content); parent.append(notes);
}

export interface DesignerPanelState {
  messages: Message[]; draft: string; busy: boolean; progress: string; options: string[];
  conversationId?: string; keep: string[]; elapsedSeconds: number;
  northDeg?: number; northPersisted: boolean; northError: string;
  activeHistoryId: string; conversations: { id: string; title: string }[]; historyPersisted: boolean;
}
interface ConversationOptions {
  ask: AskDesigner;
  snapshot: () => Pick<DesignerRequest, 'scene' | 'revision' | 'catalog' | 'catalogCurrency'>;
  onProposal: (proposal: AgentProposal) => void;
  onChange?: (state: DesignerPanelState) => void;
  canRequest?: () => boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => number;
  history?: boolean;
  onResetReview?: () => void;
  onProposalAction?: (proposal: AgentProposal, action: ProposalAction) => { ok: boolean; message?: string };
}

/** Owns chat state only. A proposal can only leave through the editor's review callback. */
export function createDesignerConversation(options: ConversationOptions) {
  const state: DesignerPanelState = { messages: [], draft: '', busy: false, progress: '', options: [], keep: [], elapsedSeconds: 0, northPersisted: false, northError: '', activeHistoryId: '', conversations: [], historyPersisted: false };
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
  const histories = new Map<string, History>();
  const emptyConversation = (): Conversation => ({ id: crypto.randomUUID(), title: 'New conversation', messages: [], options: [] });
  const historyKey = () => `varpet.designer.history:${encodeURIComponent(settingsScene)}`;
  let history: History;
  const loadHistory = () => {
    if (!options.history) return;
    let saved = histories.get(settingsScene);
    if (!saved) {
      try {
        const raw = options.storage?.getItem(historyKey());
        if (raw) {
          const data = JSON.parse(raw) as History;
          if (data.version !== 1 || !Array.isArray(data.conversations) || !data.conversations.length) throw Error('Invalid history');
          for (const thread of data.conversations) {
            if (!thread || typeof thread.id !== 'string' || typeof thread.title !== 'string' || !Array.isArray(thread.messages) || !Array.isArray(thread.options)
              || thread.options.some(item => typeof item !== 'string') || (thread.conversationId !== undefined && typeof thread.conversationId !== 'string')) throw Error('Invalid conversation');
            for (const message of thread.messages) {
              if (!message || !['user', 'designer'].includes(message.role) || typeof message.text !== 'string') throw Error('Invalid message');
              if (message.notes !== undefined && (typeof message.notes !== 'string' || !message.notes.trim() || message.notes.length > 1600)) throw Error('Invalid notes');
              if (message.metrics && (!Array.isArray(message.metrics) || message.metrics.some(row => !row || typeof row.label !== 'string' || typeof row.value !== 'string'))) throw Error('Invalid metrics');
              if (message.suggestions && (!Array.isArray(message.suggestions) || message.suggestions.length > 4 || message.suggestions.some(value => typeof value !== 'string' || !value.trim() || value.length > 300))) throw Error('Invalid suggestions');
              if (message.retryRequest !== undefined && (typeof message.retryRequest !== 'string' || !message.retryRequest.trim() || message.retryRequest.length > 20000)) throw Error('Invalid retry request');
              if (message.options && (!Array.isArray(message.options) || message.options.some(option => typeof option !== 'string'))) throw Error('Invalid options');
              if (message.proposal) {
                if (typeof message.proposal.id !== 'string' || typeof message.proposal.title !== 'string' || typeof message.proposal.description !== 'string') throw Error('Invalid proposal');
                // The editor revision is session-local. Reloaded commands must never become executable again.
                if (!['applied', 'dismissed'].includes(message.status ?? '')) message.status = 'stale';
              }
            }
          }
          if (!data.conversations.some(thread => thread.id === data.activeId)) data.activeId = data.conversations[0]!.id;
          saved = data; state.historyPersisted = true;
        }
      } catch { state.historyPersisted = false; }
      if (!saved) { const first = emptyConversation(); saved = { version: 1, activeId: first.id, conversations: [first] }; }
      histories.set(settingsScene, saved);
    }
    history = saved;
    const selected = history.conversations.find(thread => thread.id === history.activeId)!;
    state.activeHistoryId = selected.id; state.messages = selected.messages; state.options = selected.options;
    state.conversationId = selected.conversationId;
    state.conversations = history.conversations.map(({ id, title }) => ({ id, title }));
  };
  const persist = () => {
    if (!options.history) return;
    const selected = history.conversations.find(thread => thread.id === state.activeHistoryId)!;
    selected.messages = state.messages; selected.options = state.options; selected.conversationId = state.conversationId;
    selected.title = state.messages.find(message => message.role === 'user')?.text.slice(0, 64) ?? 'New conversation';
    state.conversations = history.conversations.map(({ id, title }) => ({ id, title }));
    state.historyPersisted = false;
    try {
      if (options.storage) { options.storage.setItem(historyKey(), JSON.stringify(history)); state.historyPersisted = true; }
    } catch { /* Keep complete history in memory when storage is full or blocked. */ }
  };
  loadHistory(); persist();
  const publish = (save = true) => { if (!disposed) { if (save) persist(); options.onChange?.(structuredClone(state)); } };
  const reply = (text: string, metrics?: MetricRow[], notes?: string) => state.messages.push({ role: 'designer', text, ...(metrics ? { metrics } : {}), ...(notes === undefined ? {} : { notes }) });
  const controller = {
    get state() { return structuredClone(state); },
    refreshSettings() {
      const { scene, revision } = options.snapshot();
      if (disposed) return;
      if (scene.id !== settingsScene) {
        if (options.history) { controller.cancel(); persist(); options.onResetReview?.(); state.keep = []; state.historyPersisted = false; }
        settingsScene = scene.id; loadNorth(); loadHistory();
      }
      if (options.history) {
        for (const thread of history.conversations) for (const message of thread.messages) {
          if (message.status === 'pending' && message.proposal?.command.baseRevision !== revision) message.status = 'stale';
        }
      }
      publish();
    },
    newConversation() {
      if (disposed || !options.history) return;
      controller.cancel(); persist(); options.onResetReview?.();
      const next = emptyConversation(); history.conversations.unshift(next); history.activeId = next.id;
      loadHistory(); state.keep = []; publish();
    },
    selectConversation(id: string) {
      if (disposed || !options.history || id === state.activeHistoryId || !history.conversations.some(thread => thread.id === id)) return;
      controller.cancel(); persist(); options.onResetReview?.(); history.activeId = id; loadHistory(); state.keep = []; controller.refreshSettings();
    },
    act(id: string, action: ProposalAction) {
      if (disposed || state.busy || !options.history) return false;
      controller.refreshSettings();
      const message = state.messages.find(item => item.proposal?.id === id);
      if (!message?.proposal || message.status !== 'pending') return false;
      try {
        const result = options.onProposalAction?.(structuredClone(message.proposal), action);
        if (!result?.ok) { reply(result?.message ?? 'This proposal cannot be applied right now.'); publish(); return false; }
        if (action !== 'preview') message.status = action === 'apply' ? 'applied' : 'dismissed';
        publish(); return true;
      } catch (error) { reply(error instanceof Error ? error.message : 'The editor could not complete this action.'); publish(); return false; }
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
      state.elapsedSeconds = Math.max(0, Math.floor((now() - started) / 1000)); publish(false);
    },
    suggest(): Promise<void> { return controller.send('Suggest one improvement for this room'); },
    setKeep(id: string, keep: boolean) {
      if (disposed || state.busy) return;
      const ids = new Set(state.keep);
      if (keep && options.snapshot().scene.objects.some(object => object.id === id)) ids.add(id);
      else ids.delete(id);
      state.keep = [...ids]; publish();
    },
    retry(): Promise<void> { const request = state.messages.at(-1)?.retryRequest; return request ? controller.send(request) : Promise.resolve(); },
    followUp(text: string, proposal?: AgentProposal, status?: ProposalStatus): Promise<void> {
      return controller.send(proposal ? `${text}\n\nAbout your proposal “${proposal.title}” (${status ?? 'pending'}).` : text);
    },
    async send(message: string) {
      const request = message.trim();
      if (disposed || state.busy || !request) return;
      controller.refreshSettings();
      if (state.northError) { reply(state.northError); publish(); return; }
      if (options.canRequest?.() === false) { reply('Finish the current preview or request, then try again.'); publish(); return; }
      const { scene, revision, catalog, catalogCurrency } = options.snapshot();
      const abortController = new AbortController(); active = abortController;
      state.keep = state.keep.filter(id => scene.objects.some(object => object.id === id));
      state.messages.push({ role: 'user', text: request });
      started = now(); state.elapsedSeconds = 0; state.draft = '';
      state.busy = true; state.progress = 'Sending your request to the designer…'; state.options = []; publish();
      try {
        const result = await options.ask({ events: true, scene: structuredClone(scene), revision, request,
          ...(catalog === undefined ? {} : { catalog: structuredClone(catalog) }), ...(catalogCurrency === undefined ? {} : { catalogCurrency }),
          conversationId: state.conversationId, keep: [...state.keep], ...(state.northDeg === undefined ? {} : { northDeg: state.northDeg }) }, {
          signal: abortController.signal,
          onProgress: message => { if (active === abortController && !disposed) { state.progress = message; publish(false); } },
          onEvent: event => { if (active === abortController && !disposed) { state.progress = designerEventProgress(event); publish(false); } },
          onMessageDelta: delta => { if (active === abortController && !disposed) { state.draft = (state.draft + delta).slice(0, 4000); publish(false); } },
        });
        if (disposed || active !== abortController) return;
        if (result.type !== 'error') state.conversationId = result.conversationId;
        if (result.type === 'proposal') {
          if (options.history) state.messages.push({ role: 'designer', text: result.proposal.description, proposal: structuredClone(result.proposal),
            status: result.proposal.command.baseRevision === options.snapshot().revision ? 'pending' : 'stale', metrics: proposalMetrics(result.metrics),
            ...(result.notes === undefined ? {} : { notes: result.notes }) });
          else reply(`${result.proposal.title}\n${result.proposal.description}\nReview the proposed change below before applying it.`, proposalMetrics(result.metrics), result.notes);
          options.onProposal(result.proposal);
        } else if (result.type === 'question') {
          reply(result.question); state.options = [...result.options];
          if (options.history) state.messages.at(-1)!.options = [...result.options];
        } else {
          reply(result.message);
          if (result.type === 'message') state.messages.at(-1)!.suggestions = result.suggestions ?? ['Show me another option', 'Make it warmer', 'What would it cost?'];
          if (result.type === 'error') state.messages.at(-1)!.retryRequest = request;
        }
      } catch (error) {
        if (disposed || active !== abortController) return;
        reply(error instanceof Error ? error.message : 'The designer could not finish. Please try again.');
        state.messages.at(-1)!.retryRequest = request;
      } finally {
        if (!disposed && active === abortController) {
          active = undefined; state.busy = false; state.progress = ''; state.draft = ''; publish();
        }
      }
    },
    cancel() {
      if (!active) return;
      const controller = active; active = undefined; controller.abort();
      state.busy = false; state.progress = ''; state.draft = ''; reply('Request cancelled. You can try another request.'); publish();
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
    if (/^(why|what|how|explain|tell me)\b/i.test(req.request)) return { type: 'message', conversationId,
      message: 'Recorded demo: **minimalism** means fewer competing elements, useful furniture and a calm palette. It can still feel warm. We can talk through an idea before you decide whether to change anything.',
      suggestions: ['Tell me more', 'Make it cozier'] };
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

function mountMockDesignerPanel(host: HTMLElement, options: MountOptions) {
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
        const text = document.createElement('div'); text.className = 'designer-message-copy';
        if (message.role === 'designer') text.innerHTML = designerMarkdown(message.text); else text.textContent = message.text;
        item.append(author, text);
        if (message.metrics) {
          const numbers = document.createElement('dl'); numbers.className = 'designer-metrics';
          for (const row of message.metrics) {
            const label = document.createElement('dt'), value = document.createElement('dd');
            label.textContent = row.label; value.textContent = row.value; numbers.append(label, value);
          }
          item.append(numbers);
          if (message.notes === undefined) { const note = document.createElement('small'); note.textContent = 'Service estimates. Paint and labour are not priced here.'; item.append(note); }
        }
        appendNotes(item, message.notes);
        if (message.retryRequest) {
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button designer-retry'; retry.textContent = 'Retry'; retry.onclick = () => { void controller.send(message.retryRequest!); }; item.append(retry);
        }
        log.append(item);
      }
      displayedMessages = state.messages.length;
      if (nearBottom) log.scrollTop = log.scrollHeight;
      choices.replaceChildren();
      for (const option of state.options.length ? state.options : state.messages.at(-1)?.suggestions ?? []) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button';
        button.textContent = option; button.disabled = state.busy; button.onclick = () => { void controller.send(option); };
        choices.append(button);
      }
      find<HTMLElement>('.designer-progress-stage').textContent = state.progress;
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

/** Preview all editor operations using the same checks, without changing the user's store. */
export function previewDesignerProposal(scene: SceneDocument, revision: number, proposal: AgentProposal, catalog: CatalogAsset[]): SceneDocument {
  if (proposal.command.baseRevision !== revision) throw new Error('This proposal is stale. Ask for a fresh proposal.');
  const preview = new EditorStore(scene, catalog);
  const result = preview.execute({ ...structuredClone(proposal.command), baseRevision: preview.revision }, true);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return preview.scene;
}

/** Live product surface; the original mock panel stays inside Assistant unchanged. */
export function mountDesignerPanel(host: HTMLElement, options: MountOptions) {
  if (!options.live) return { ...mountMockDesignerPanel(host, options), open() {} };
  host.classList.add('designer-column'); host.setAttribute('aria-label', 'Designer');
  host.innerHTML = `<header class="designer-chat-header"><div><strong>Your designer</strong><small>Design your home together</small></div><button type="button" class="button quiet designer-collapse" aria-label="Collapse designer" aria-expanded="true">‹</button></header>
    <div class="designer-chat-body"><div class="designer-history-bar"><button class="button designer-new" type="button">+ New conversation</button><details class="designer-history"><summary>Recent conversations</summary><div class="designer-history-list"></div></details></div>
    <div class="designer-chat-scroll"><div class="designer-greeting"><span class="designer-greeting-icon" aria-hidden="true">✦</span><h2>What would make this feel like home?</h2><p>Tell me what you have in mind. We can explore a change together, and you decide what to apply.</p></div>
      <details class="designer-starters" open><summary>Ideas for this flat</summary><div class="designer-examples"></div></details>
      <div class="designer-messages" role="log" aria-label="Designer conversation" aria-live="polite"></div>
      <div class="designer-progress" hidden><span class="designer-progress-stage" role="status"></span><span class="designer-elapsed" aria-live="off"></span><small>You can cancel while the designer works.</small></div></div>
    <div class="designer-composer"><details class="designer-context"><summary>Room context · north & keep pieces</summary>
      <div class="designer-north"><label for="designer-north">North angle °</label><input id="designer-north" type="number" min="0" max="359.999999" step="any" placeholder="Unknown" aria-describedby="designer-north-help"/><small id="designer-north-help">Clockwise from plan-up: 0° ↑, 90° →. Leave blank if unknown.</small><small class="designer-north-status" role="status"></small></div>
      <details class="designer-keeps"><summary>Keep pieces in place</summary><div class="designer-keep-list"></div></details></details>
      <form class="designer-form"><label for="designer-request">Message your designer</label><textarea id="designer-request" rows="2" maxlength="20000" placeholder="Ask a question or explore a change…" required></textarea><div class="designer-actions"><button type="submit" class="button primary">Send</button><button type="button" class="button quiet designer-cancel" hidden>Cancel</button></div></form>
      <small class="designer-compose-hint">Enter to send · Shift+Enter for a new line</small><small class="designer-storage-status"></small></div></div>`;
  const find = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const log = find<HTMLElement>('.designer-messages'), scroller = find<HTMLElement>('.designer-chat-scroll');
  const input = find<HTMLTextAreaElement>('textarea'), form = find<HTMLFormElement>('form');
  const north = find<HTMLInputElement>('#designer-north');
  const collapse = find<HTMLButtonElement>('.designer-collapse');
  let storage = options.storage;
  if (!storage) { try { storage = window.localStorage; } catch { /* Session-only chat. */ } }
  let messageKey = '', historyKey = '', previousBusy = false, activeThread = '', collapsed = false, hasMessages = false, contextualStarters = false;
  let ticker: ReturnType<typeof setInterval> | undefined;
  const button = (label: string, action: () => void, className = 'button') => {
    const item = document.createElement('button'); item.type = 'button'; item.className = className; item.textContent = label; item.onclick = action; return item;
  };
  const setCollapsed = (value: boolean) => {
    collapsed = value; host.classList.toggle('designer-collapsed', value); find<HTMLElement>('.designer-chat-body').hidden = value;
    collapse.textContent = value ? 'Designer ›' : '‹'; collapse.setAttribute('aria-label', value ? 'Open designer' : 'Collapse designer'); collapse.setAttribute('aria-expanded', String(!value));
  };
  const render = (state: DesignerPanelState) => {
    const switched = activeThread !== state.activeHistoryId; activeThread = state.activeHistoryId;
    if (switched) input.value = '';
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 60;
    const nextKey = JSON.stringify([state.messages, state.options, state.busy, state.draft]);
    if (nextKey !== messageKey) {
      messageKey = nextKey; log.replaceChildren();
      state.messages.forEach((message, index) => {
        const item = document.createElement('article'); item.className = `designer-message designer-message-${message.role}`;
        const author = document.createElement('strong'); author.textContent = message.role === 'user' ? 'You' : 'Designer'; item.append(author);
        if (message.proposal) { const title = document.createElement('h3'); title.textContent = message.proposal.title; item.append(title); item.classList.add('designer-proposal-card'); }
        const text = document.createElement('div'); text.className = 'designer-message-copy';
        if (message.role === 'designer') text.innerHTML = designerMarkdown(message.text); else text.textContent = message.text; item.append(text);
        if (message.metrics) {
          const metrics = document.createElement('dl'); metrics.className = 'designer-metrics';
          for (const row of message.metrics) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = row.label; dd.textContent = row.value; metrics.append(dt, dd); }
          item.append(metrics);
          if (message.notes === undefined) { const note = document.createElement('small'); note.textContent = 'Service estimates. Paint and labour are not priced here.'; item.append(note); }
        }
        appendNotes(item, message.notes);
        if (message.proposal) {
          const status = document.createElement('p'); status.className = 'designer-proposal-status'; status.setAttribute('role', 'status');
          status.textContent = { pending: 'Ready for your review', applied: 'Applied', dismissed: 'Dismissed', stale: 'Stale · the scene changed or was reopened. Ask for a fresh proposal.' }[message.status ?? 'stale']; item.append(status);
          if (message.status === 'pending') {
            const actions = document.createElement('div'); actions.className = 'designer-proposal-actions';
            for (const action of ['preview', 'apply', 'dismiss'] as const) {
              const control = button(action[0]!.toUpperCase() + action.slice(1), () => controller.act(message.proposal!.id, action), `button ${action === 'apply' ? 'primary' : 'quiet'}`);
              control.disabled = state.busy; actions.append(control);
            }
            item.append(actions);
          }
        }
        const suggestions = message.proposal ? ['Show me another option', 'Why this layout?', 'Make it warmer', 'What would it cost?'] : index === state.messages.length - 1 ? message.suggestions : undefined;
        if (suggestions?.length) {
          const chips = document.createElement('div'); chips.className = 'designer-suggestions'; chips.setAttribute('aria-label', 'Continue the conversation');
          for (const suggestion of suggestions) {
            const chip = button(suggestion, () => { void controller.followUp(suggestion, message.proposal, message.status); }, 'button quiet designer-suggestion');
            chip.disabled = state.busy; chips.append(chip);
          }
          item.append(chips);
        }
        if (message.retryRequest && index === state.messages.length - 1) {
          item.classList.add('designer-message-error');
          const retry = button('Retry', () => { void controller.retry(); }, 'button designer-retry'); retry.disabled = state.busy; item.append(retry);
        }
        if (message.options && index === state.messages.length - 1 && state.options.length) {
          const choices = document.createElement('div'); choices.className = 'designer-options';
          for (const choice of state.options) { const control = button(choice, () => { void controller.send(choice); }); control.disabled = state.busy; choices.append(control); }
          item.append(choices);
        }
        log.append(item);
      });
      if (state.draft) {
        const draft = document.createElement('article'); draft.className = 'designer-message designer-message-designer designer-draft'; draft.setAttribute('aria-live', 'off');
        const author = document.createElement('strong'); author.textContent = 'Designer';
        const copy = document.createElement('div'); copy.className = 'designer-message-copy'; copy.innerHTML = designerMarkdown(state.draft); draft.append(author, copy); log.append(draft);
      }
      if (nearBottom || switched) scroller.scrollTop = scroller.scrollHeight;
    }
    find<HTMLElement>('.designer-greeting').hidden = state.messages.length > 0 || contextualStarters;
    if (switched || hasMessages !== (state.messages.length > 0)) find<HTMLDetailsElement>('.designer-starters').open = !state.messages.length;
    hasMessages = state.messages.length > 0;
    const nextHistoryKey = JSON.stringify([state.conversations, state.activeHistoryId]);
    if (historyKey !== nextHistoryKey) {
      historyKey = nextHistoryKey; const list = find<HTMLElement>('.designer-history-list'); list.replaceChildren();
      for (const thread of state.conversations) {
        const control = button(thread.title, () => { controller.selectConversation(thread.id); renderKeeps(); find<HTMLDetailsElement>('.designer-history').open = false; });
        control.setAttribute('aria-current', String(thread.id === state.activeHistoryId)); list.append(control);
      }
    }
    const progress = find<HTMLElement>('.designer-progress'); progress.hidden = !state.busy;
    find<HTMLElement>('.designer-progress-stage').textContent = state.progress;
    find<HTMLElement>('.designer-elapsed').textContent = `${state.elapsedSeconds} s elapsed`;
    find<HTMLButtonElement>('.designer-cancel').hidden = !state.busy;
    find<HTMLButtonElement>('[type="submit"]').disabled = state.busy; input.disabled = state.busy;
    for (const control of host.querySelectorAll<HTMLButtonElement>('.designer-examples button')) control.disabled = state.busy;
    if (document.activeElement !== north && !state.northError) north.value = state.northDeg === undefined ? '' : String(state.northDeg);
    north.disabled = state.busy; north.setCustomValidity(state.northError);
    find<HTMLElement>('.designer-north-status').textContent = state.northError || (state.northDeg === undefined ? 'Sun direction unknown.' : state.northPersisted ? 'Saved for this scene.' : 'For this session only.');
    find<HTMLElement>('.designer-storage-status').textContent = state.historyPersisted ? 'Conversations saved on this device.' : 'Conversations stay in this session until browser storage is available.';
    for (const control of host.querySelectorAll<HTMLInputElement>('.designer-keep-list input')) control.disabled = state.busy;
    if (previousBusy !== state.busy) {
      if (ticker !== undefined) clearInterval(ticker);
      ticker = state.busy ? setInterval(() => controller.tick(), 1000) : undefined;
      options.onBusyChange?.(state.busy);
      if (!state.busy && !collapsed) input.focus();
    }
    previousBusy = state.busy;
  };
  const controller = createDesignerConversation({ ...options, storage, history: true, ask: options.ask ?? askDesigner, onChange: render });
  const renderKeeps = () => {
    const list = find<HTMLElement>('.designer-keep-list'); list.replaceChildren();
    for (const object of options.snapshot().scene.objects) {
      const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = controller.state.keep.includes(object.id); checkbox.disabled = controller.state.busy;
      checkbox.onchange = () => controller.setKeep(object.id, checkbox.checked); label.append(checkbox, document.createTextNode(object.name)); list.append(label);
    }
  };
  let starterKey = '';
  const renderStarters = () => {
    const { scene, catalog } = options.snapshot();
    const suggestions = designerStarters(scene, catalog, controller.state.northDeg);
    contextualStarters = suggestions.some(item => !item.id.startsWith('example:'));
    find<HTMLElement>('.designer-greeting').hidden = controller.state.messages.length > 0 || contextualStarters;
    const key = JSON.stringify(suggestions);
    if (key === starterKey) return;
    starterKey = key;
    const list = find<HTMLElement>('.designer-examples'); list.replaceChildren();
    for (const suggestion of suggestions) {
      const control = button(suggestion.label, () => { void controller.send(suggestion.request); }, 'designer-example');
      control.disabled = controller.state.busy; list.append(control);
    }
  };
  collapse.onclick = () => setCollapsed(!collapsed);
  find<HTMLButtonElement>('.designer-new').onclick = () => { controller.newConversation(); renderKeeps(); input.focus(); };
  find<HTMLButtonElement>('.designer-cancel').onclick = () => controller.cancel();
  north.onchange = () => { controller.setNorth(north.validity.badInput ? 'invalid' : north.value); north.reportValidity(); renderStarters(); };
  form.onsubmit = event => { event.preventDefault(); const request = input.value; if (request.trim() && !controller.state.busy) { void controller.send(request); if (controller.state.busy) input.value = ''; } };
  input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } };
  render(controller.state); renderKeeps(); renderStarters();
  const unsubscribe = options.subscribe?.(() => { controller.refreshSettings(); renderKeeps(); renderStarters(); });
  return { controller, open() { setCollapsed(false); input.focus(); }, dispose() { if (ticker !== undefined) clearInterval(ticker); controller.dispose(); unsubscribe?.(); host.replaceChildren(); } };
}
