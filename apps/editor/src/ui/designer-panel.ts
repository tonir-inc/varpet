import { designerEventProgress } from '../adapters/designer-events';
import { designerMarkdown } from './designer-markdown';
import { designerStarters, type DesignerStarter } from './designer-starters';
import { applyDesignerEvent, designerClock, designerStepsSummary, finishDesignerSteps, validDesignerTurnSteps, type DesignerStep, type DesignerTurnSteps } from './designer-steps';
import { designerIcon, designerIconButton } from './designer-icons';
export { designerMarkdown } from './designer-markdown';
import { EditorStore } from '../core/store';
import type { AgentProposal, CatalogAsset, SceneDocument } from '../contracts';
import { askDesigner, type DesignerHealth, type DesignerPartial, type DesignerPreview, type DesignerRequest } from '../adapters/designer-http';
type AskDesigner = typeof askDesigner;

interface MetricRow { label: string; value: string }
type ProposalStatus = 'pending' | 'applied' | 'undone' | 'dismissed' | 'stale';
export type ProposalAction = 'preview' | 'apply' | 'dismiss';
interface Message { role: 'user' | 'designer'; text: string; metrics?: MetricRow[]; proposal?: AgentProposal; status?: ProposalStatus; options?: string[]; notes?: string; suggestions?: string[]; retryRequest?: string; steps?: DesignerTurnSteps; preview?: DesignerPreview;
  /** `id|assetId` of the pieces an applied proposal brought that were not in the flat before: they say whether it is still in. */
  marks?: string[] }
interface Conversation { id: string; title: string; conversationId?: string; messages: Message[]; options: string[] }
interface History { version: 1; activeId: string; conversations: Conversation[] }
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const metres = (value: unknown) => measured(value) ? `${value.toFixed(2)} m` : undefined;
const squareMetres = (value: unknown) => measured(value) ? `${value.toFixed(1)} m²` : 'Unknown';

/** The spike designer's measurements: free floor and the narrowest walkway per designed room, budget used. */
function spaceMetrics(score: Record<string, unknown>, space: Record<string, unknown>): MetricRow[] {
  const rooms = (space.rooms as unknown[]).map(record).filter(room => room.designed === true);
  const rows: MetricRow[] = [{ label: 'Open floor · before → after', value: `${squareMetres(space.free_before_m2).replace(' m²', '')} → ${squareMetres(space.free_after_m2)}` }];
  const walkable = rooms.filter(room => measured(room.narrowest_m));
  const narrowest = walkable.sort((a, b) => (a.narrowest_m as number) - (b.narrowest_m as number))[0];
  const blocked = rooms.filter(room => measured(room.blocked) && (room.blocked as number) > 0);
  rows.push({ label: 'Narrowest walkway', value: narrowest ? `${metres(narrowest.narrowest_m)} · ${String(narrowest.name)}${blocked.length ? ` · ${blocked.length} room${blocked.length === 1 ? '' : 's'} with a blocked path` : ''}` : rooms.length ? 'No walkway to measure' : 'Unknown' });
  for (const room of rooms.slice(0, 8)) {
    const walkway = metres(room.narrowest_m);
    rows.push({ label: String(room.name ?? room.id), value: `${squareMetres(room.free_after_m2)} open${walkway ? ` · walkway ${walkway}` : ''}` });
  }
  const cost = measured(score.cost_dram) && Number.isSafeInteger(score.cost_dram) ? score.cost_dram : undefined;
  const budget = measured(score.budget_dram) && Number.isSafeInteger(score.budget_dram) && score.budget_dram > 0 ? score.budget_dram : undefined;
  rows.push(budget !== undefined
    ? { label: 'Budget used', value: cost === undefined ? `Unknown of ${budget.toLocaleString('en-US')} ֏` : `${cost.toLocaleString('en-US')} of ${budget.toLocaleString('en-US')} ֏ (${Math.round(cost / budget * 100)}%)` }
    : { label: 'Furniture total', value: cost === undefined ? 'Unknown' : `${cost.toLocaleString('en-US')} ֏ · no budget given` });
  return rows;
}

/** Read the service's scoreLayout shape without inventing absent measurements. */
function proposalMetrics(value: unknown): MetricRow[] {
  const space = record(record(value).space);
  if (Array.isArray(space.rooms)) return spaceMetrics(record(value), space);
  const score = record(value), before = record(record(score.before).space), after = record(record(score.after).space);
  const area = (value: unknown) => measured(value) ? value.toFixed(2) : 'Unknown';
  const rooms = after.rooms;
  const paths = Array.isArray(rooms) ? rooms.flatMap(room => Array.isArray(record(room).walkways) ? record(room).walkways as unknown[] : [null]) : [];
  const knownPaths = paths.length > 0 && paths.every(path => measured(record(path).width_m));
  const width = knownPaths ? paths.reduce<number>((min, path) => Math.min(min, record(path).width_m as number), Infinity) : undefined;
  // A route blocked before the change is not the proposal's doing (the designer's checks reject new blocks).
  const routes = (side: Record<string, unknown>) => Array.isArray(side.rooms) ? side.rooms.flatMap(room => {
    const walkways = record(room).walkways;
    return Array.isArray(walkways) ? walkways.map(path => ({ room: record(room).room_id, path: record(path) })) : [];
  }) : [];
  const key = ({ room, path }: { room: unknown; path: Record<string, unknown> }) =>
    typeof room === 'string' && typeof path.from === 'string' && typeof path.to === 'string' ? JSON.stringify([room, ...[path.from, path.to].sort()]) : undefined;
  const blockedBefore = new Set(routes(before).filter(route => route.path.reachable === false).map(key).filter(Boolean));
  const blockedAfter = routes(after).filter(route => route.path.reachable === false);
  const blocked = blockedAfter.length > 0;
  const preexisting = blocked && blockedAfter.every(route => blockedBefore.has(key(route)));
  return [
    { label: 'Open floor · before → after', value: `${area(before.free_area_m2)} → ${area(after.free_area_m2)}${measured(before.free_area_m2) || measured(after.free_area_m2) ? ' m²' : ''}` },
    { label: 'Narrowest walkway · proposed', value: width === undefined ? 'Unknown' : `${width.toFixed(2)} m${preexisting ? ' (already blocked before this change)' : blocked ? ' (blocked)' : ''}` },
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
  /** Steps of the turn in flight; they move onto the reply when it lands. */
  steps: DesignerStep[];
  /** The designer's latest render of the turn in flight; it moves onto the reply when it lands. */
  preview?: DesignerPreview;
  /** A message typed while the designer works; sent when the turn ends. */
  queued: string;
  /** Checked rooms the designer has finished while it works on the rest: preview only. */
  partial?: { proposal: AgentProposal; rooms: string[] };
  /** The customer is looking at `partial` in the editor; newer partials and the final design replace it there. */
  previewingPartial: boolean;
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
  /** The service could not be reached: the host re-checks its health. */
  onUnreachable?: () => void;
  onProposalAction?: (proposal: AgentProposal, action: ProposalAction) => { ok: boolean; message?: string };
  /** Whether the editor still shows a proposal preview (the customer may have left it). */
  isPreviewing?: () => boolean;
}

/** Is an applied proposal still in the flat? Judged by the pieces it brought (`marks`, recorded at Apply: a re-hung
 * piece with the same product says nothing); without marks, by every piece it adds. A proposal that adds nothing
 * keeps its status. */
export function proposalInScene(proposal: AgentProposal, scene: SceneDocument, marks?: string[]): 'applied' | 'undone' | undefined {
  const keys = marks ?? proposal.command.operations.flatMap(operation => operation.type === 'add' ? [`${operation.object.id}|${operation.object.assetId}`] : []);
  if (!keys.length) return undefined;
  const present = new Set(scene.objects.map(object => `${object.id}|${object.assetId}`));
  return keys.some(key => present.has(key)) ? 'applied' : 'undone';
}

/** A turn without typed events still reads as steps: each new progress line closes the previous one. */
export function progressStep(steps: DesignerStep[], message: string, at: number): DesignerStep[] {
  const label = message.trim();
  if (!label || steps.at(-1)?.label === label) return steps;
  const next = steps.map(step => step.status === 'running' && step.key.startsWith('progress:') ? { ...step, status: 'done' as const, end: at } : { ...step });
  next.push({ key: `progress:${next.length}:${label}`, label, status: 'running', at, timed: true });
  return next.slice(-60);
}
const unreachable = /failed to fetch|networkerror|load failed|fetch failed|err_connection/i;
export const DESIGNER_START_HINT = 'cd harness && uv run python designer_service.py';

/** Owns chat state only. A proposal can only leave through the editor's review callback. */
export function createDesignerConversation(options: ConversationOptions) {
  const state: DesignerPanelState = { messages: [], draft: '', busy: false, progress: '', options: [], steps: [], queued: '', previewingPartial: false, keep: [], elapsedSeconds: 0, northPersisted: false, northError: '', activeHistoryId: '', conversations: [], historyPersisted: false };
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
              // Steps are a record of work, not a decision: a damaged one is dropped, the message is kept.
              if (message.steps !== undefined && !validDesignerTurnSteps(message.steps)) delete message.steps;
              if (message.notes !== undefined && (typeof message.notes !== 'string' || !message.notes.trim() || message.notes.length > 1600)) throw Error('Invalid notes');
              if (message.metrics && (!Array.isArray(message.metrics) || message.metrics.some(row => !row || typeof row.label !== 'string' || typeof row.value !== 'string'))) throw Error('Invalid metrics');
              if (message.suggestions && (!Array.isArray(message.suggestions) || message.suggestions.length > 4 || message.suggestions.some(value => typeof value !== 'string' || !value.trim() || value.length > 300))) throw Error('Invalid suggestions');
              if (message.retryRequest !== undefined && (typeof message.retryRequest !== 'string' || !message.retryRequest.trim() || message.retryRequest.length > 20000)) throw Error('Invalid retry request');
              if (message.options && (!Array.isArray(message.options) || message.options.some(option => typeof option !== 'string'))) throw Error('Invalid options');
              if (message.proposal) {
                if (typeof message.proposal.id !== 'string' || typeof message.proposal.title !== 'string' || typeof message.proposal.description !== 'string') throw Error('Invalid proposal');
                // The editor revision is session-local. Reloaded commands must never become executable again.
                if (!['applied', 'undone', 'dismissed'].includes(message.status ?? '')) message.status = 'stale';
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
  /** The turn's steps travel with the reply that ended it, so a finished turn reads as one collapsed line. */
  const settleSteps = () => {
    const last = state.messages.at(-1);
    // A progress line still running when the reply lands was the last thing the designer did: it finished.
    const at = Math.max(0, (now() - started) / 1000);
    state.steps = state.steps.map(step => step.status === 'running' && step.key.startsWith('progress:') ? { ...step, status: 'done', end: at } : step);
    if (state.steps.length && last?.role === 'designer') {
      const at = Math.max(0, (now() - started) / 1000);
      last.steps = { steps: finishDesignerSteps(state.steps, at), seconds: Math.floor(at) };
    }
    if (state.preview && last?.role === 'designer') last.preview = state.preview;
    state.steps = []; delete state.preview; delete state.partial;
  };
  const controller = {
    get state() { return structuredClone(state); },
    refreshSettings() {
      const { scene, revision } = options.snapshot();
      if (disposed) return;
      if (scene.id !== settingsScene) {
        if (options.history) { state.queued = ''; controller.cancel(); persist(); options.onResetReview?.(); state.keep = []; state.historyPersisted = false; }
        settingsScene = scene.id; loadNorth(); loadHistory();
      }
      if (options.history) {
        for (const thread of history.conversations) for (const message of thread.messages) {
          if (message.status === 'pending' && message.proposal?.command.baseRevision !== revision) message.status = 'stale';
        }
        // Undo and Redo move an applied proposal out of the flat and back: follow what the scene holds now.
        for (const message of state.messages) {
          if ((message.status !== 'applied' && message.status !== 'undone') || !message.proposal) continue;
          const status = proposalInScene(message.proposal, scene, message.marks);
          if (status) message.status = status;
        }
      }
      publish();
    },
    newConversation() {
      if (disposed || !options.history) return;
      state.queued = ''; controller.cancel(); persist(); options.onResetReview?.();
      const next = emptyConversation(); history.conversations.unshift(next); history.activeId = next.id;
      loadHistory(); state.keep = []; publish();
    },
    selectConversation(id: string) {
      if (disposed || !options.history || id === state.activeHistoryId || !history.conversations.some(thread => thread.id === id)) return;
      state.queued = ''; controller.cancel(); persist(); options.onResetReview?.(); history.activeId = id; loadHistory(); state.keep = []; controller.refreshSettings();
    },
    act(id: string, action: ProposalAction) {
      if (disposed || state.busy || !options.history) return false;
      controller.refreshSettings();
      const message = state.messages.find(item => item.proposal?.id === id);
      if (!message?.proposal || message.status !== 'pending') return false;
      try {
        const before = new Set(options.snapshot().scene.objects.map(object => `${object.id}|${object.assetId}`));
        const result = options.onProposalAction?.(structuredClone(message.proposal), action);
        if (action === 'apply' && result?.ok) message.marks = message.proposal.command.operations
          .flatMap(operation => operation.type === 'add' ? [`${operation.object.id}|${operation.object.assetId}`] : []).filter(key => !before.has(key));
        if (!result?.ok) { reply(result?.message ?? 'This proposal cannot be applied right now.'); publish(); return false; }
        if (action !== 'preview') message.status = action === 'apply' ? 'applied' : 'dismissed';
        publish(); return true;
      } catch (error) { reply(error instanceof Error ? error.message : 'The editor could not complete this action.'); publish(); return false; }
    },
    /** Look at the rooms finished so far while the designer continues. */
    previewPartial() {
      if (disposed || !state.partial) return false;
      try {
        const result = options.onProposalAction?.(structuredClone(state.partial.proposal), 'preview');
        state.previewingPartial = result?.ok === true; publish(false); return state.previewingPartial;
      } catch { state.previewingPartial = false; publish(false); return false; }
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
      let restart: string | undefined;
      state.keep = state.keep.filter(id => scene.objects.some(object => object.id === id));
      state.messages.push({ role: 'user', text: request });
      started = now(); state.elapsedSeconds = 0; state.draft = ''; state.steps = []; delete state.preview; delete state.partial;
      let typedEvents = false, autoPreview: string | undefined;
      state.busy = true; state.progress = 'Sending your request to the designer…'; state.options = []; publish();
      try {
        const result = await options.ask({ events: true, scene: structuredClone(scene), revision, request,
          ...(catalog === undefined ? {} : { catalog: structuredClone(catalog) }), ...(catalogCurrency === undefined ? {} : { catalogCurrency }),
          conversationId: state.conversationId, keep: [...state.keep], ...(state.northDeg === undefined ? {} : { northDeg: state.northDeg }) }, {
          signal: abortController.signal,
          onProgress: message => { if (active === abortController && !disposed) {
            state.progress = message; if (!typedEvents) state.steps = progressStep(state.steps, message, (now() - started) / 1000); publish(false);
          } },
          onPreview: preview => { if (active === abortController && !disposed) { state.preview = preview; publish(false); } },
          onPartial: partial => { if (active === abortController && !disposed) {
            state.partial = { proposal: structuredClone(partial.proposal), rooms: [...partial.rooms] };
            // Already looking at the rooms so far: follow the designer as more rooms are finished.
            if (state.previewingPartial && options.isPreviewing?.() !== false) controller.previewPartial(); else { state.previewingPartial = false; publish(false); }
          } },
          onEvent: event => { if (active === abortController && !disposed) {
            if (!typedEvents) { typedEvents = true; state.steps = []; }
            state.progress = designerEventProgress(event); state.steps = applyDesignerEvent(state.steps, event, (now() - started) / 1000); publish(false);
          } },
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
          if (state.previewingPartial && options.isPreviewing?.() !== false && options.history) autoPreview = result.proposal.id;
        } else if (result.type === 'question') {
          reply(result.question); state.options = [...result.options];
          if (options.history) state.messages.at(-1)!.options = [...result.options];
        } else if (result.type === 'error' && /unknown conversationid/i.test(result.message) && state.conversationId) {
          // The service restarted and forgot this thread: say so and start a fresh one with the same words.
          state.conversationId = undefined;
          reply('The designer service restarted, so I am starting a fresh design thread for this request.');
          restart = request;
        } else {
          reply(result.type === 'error' && unreachable.test(result.message) ? `I can’t reach the designer service. Start it with \`${DESIGNER_START_HINT}\`, then press Retry.` : result.message);
          if (result.type === 'message') state.messages.at(-1)!.suggestions = result.suggestions ?? ['Show me another option', 'Make it warmer', 'What would it cost?'];
          if (result.type === 'error') { state.messages.at(-1)!.retryRequest = request; options.onUnreachable?.(); }
        }
      } catch (error) {
        if (disposed || active !== abortController) return;
        reply(error instanceof Error ? error.message : 'The designer could not finish. Please try again.');
        state.messages.at(-1)!.retryRequest = request;
      } finally {
        if (!disposed && active === abortController) {
          active = undefined; state.busy = false; state.progress = ''; state.draft = ''; state.previewingPartial = false; settleSteps(); publish();
          if (autoPreview) controller.act(autoPreview, 'preview');
          // After publish, so the host has already seen the turn end and will accept the next request.
          const next = restart ?? state.queued;
          if (restart) {
            const index = state.messages.map(message => message.role === 'user' && message.text === restart).lastIndexOf(true);
            if (index >= 0) state.messages.splice(index, 1);
            publish();
          }
          else if (next) state.queued = '';
          if (next) void controller.send(next);
        }
      }
    },
    /** Type while the designer works: the message waits and goes out when the turn ends. */
    queue(message: string): Promise<void> {
      const text = message.trim();
      if (disposed || !text) return Promise.resolve();
      if (!state.busy) return controller.send(text);
      state.queued = (state.queued ? `${state.queued}\n\n${text}` : text).slice(0, 20000); publish(false);
      return Promise.resolve();
    },
    unqueue() { if (disposed || !state.queued) return; state.queued = ''; publish(false); },
    /** Stop means stop: a queued message is not sent; it is returned so the composer can offer it again. */
    cancel(): string {
      if (!active) return '';
      const controller = active; active = undefined; controller.abort();
      const unsent = state.queued; state.queued = '';
      state.busy = false; state.progress = ''; state.draft = ''; reply('Request cancelled. You can try another request.'); settleSteps(); publish();
      return unsent;
    },
    dispose() { disposed = true; active?.abort(); active = undefined; state.queued = ''; },
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

/** Preview all editor operations using the same checks, without changing the user's store. */
export function previewDesignerProposal(scene: SceneDocument, revision: number, proposal: AgentProposal, catalog: CatalogAsset[]): SceneDocument {
  if (proposal.command.baseRevision !== revision) throw new Error('This proposal is stale. Ask for a fresh proposal.');
  const preview = new EditorStore(scene, catalog);
  const result = preview.execute({ ...structuredClone(proposal.command), baseRevision: preview.revision }, true);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return preview.scene;
}

interface MountOptions extends Omit<ConversationOptions, 'ask' | 'onChange'> {
  ask?: AskDesigner; live?: boolean;
  /** Live mode: is the designer service reachable (and warm)? Polled; an offline service is said plainly. */
  health?: () => Promise<DesignerHealth>;
  subscribe?: (listener: () => void) => () => void;
  onBusyChange?: (busy: boolean) => void;
}

/** What the buyer is pointing at: their own selection, shown as a yellow chip above the composer. */
export interface DesignerContext { id: string; label: string }

/** Composer text only; options, retries and suggestions are sent verbatim so they are never prefixed twice. */
export function designerContextRequest(request: string, context?: DesignerContext | null): string {
  const text = request.trim(), label = context?.label?.trim();
  if (!text || !label) return text;
  const noun = /^[A-Z][a-z]/.test(label) ? label[0]!.toLowerCase() + label.slice(1) : label;
  return `About the ${noun}: ${text}`;
}

export interface DesignerProduct { id: string; name: string; price?: number; estimate?: boolean }

/** Pieces a proposal adds, priced only from what the editor already holds. */
export function proposalProducts(proposal: AgentProposal, catalog: CatalogAsset[] = [], estimates: CatalogAsset[] = []): DesignerProduct[] {
  const assets = new Map(catalog.map(asset => [asset.id, asset])), custom = new Map(estimates.map(asset => [asset.id, asset]));
  return proposal.command.operations.flatMap(operation => {
    if (operation.type !== 'add') return [];
    const known = assets.get(operation.object.assetId), estimate = known ? undefined : custom.get(operation.object.assetId);
    const asset = known ?? estimate;
    const price = asset && Number.isFinite(asset.price) && asset.price > 0 ? asset.price : undefined;
    return [{ id: operation.object.id, name: operation.object.name?.trim() || asset?.name || 'New piece',
      ...(price === undefined ? {} : { price, ...(estimate ? { estimate: true } : {}) }) }];
  }).slice(0, 12);
}

/** Replies the recorded demo understands. Nothing here reaches a model. */
const recordedStarters: DesignerStarter[] = ['Move the table', 'Make it cozier', 'Pick paint colours', 'Why minimalism?']
  .map((label, index) => ({ id: `example:recorded-${index}`, label, request: label }));
const stepMarks = { done: ['check', 'Done'], failed: ['cross', 'Failed'], unfinished: ['wait', 'Not finished when the designer replied'] } as const;
const money = (value: number) => `${value.toLocaleString('en-US')} ֏`;

/** The designer column. Live talks to the service; demo replays recorded answers and reviews in the Assistant panel. */
export function mountDesignerPanel(host: HTMLElement, options: MountOptions) {
  const live = options.live === true;
  const estimates = new Map<string, CatalogAsset>();
  const baseAsk = options.ask ?? (live ? askDesigner : createRecordedDesigner());
  // Custom pieces arrive with the reply, not the catalog; remember them so their chips can show an estimate.
  const ask: AskDesigner = async (request, askOptions) => {
    const reply = await baseAsk(request, askOptions);
    if (reply.type === 'proposal') for (const asset of reply.assets ?? []) estimates.set(asset.id, asset);
    return reply;
  };
  host.classList.add('designer-column'); host.setAttribute('aria-label', 'Designer');
  host.innerHTML = `<header class="designer-chat-header"><h2 class="designer-title"><span class="designer-dot" aria-hidden="true"></span>Designer</h2>${live ? '' : '<span class="mock-label">Demo replay</span>'}<div class="designer-header-actions"></div></header>
    <div class="designer-service-status" role="status" hidden></div>
    <div class="designer-chat-body"><div class="designer-history-bar"${live ? '' : ' hidden'}><details class="designer-history"><summary>Recent conversations</summary><div class="designer-history-list"></div></details></div>
    <div class="designer-chat-scroll"><div class="designer-greeting"><span class="designer-greeting-icon" aria-hidden="true">${designerIcon('sparkles', 22)}</span><h2>What would make this feel like home?</h2><p>Tell me what you have in mind. We can explore a change together, and you decide what to apply.</p></div>
      <details class="designer-starters" open><summary>${live ? 'Ideas for this flat' : 'Recorded examples'}</summary><div class="designer-examples"></div></details>
      <div class="designer-messages" role="log" aria-label="Designer conversation" aria-live="polite"></div></div>
    <span class="designer-progress-stage designer-visually-hidden" role="status"></span>
    <div class="designer-composer"><details class="designer-context"><summary>Room context · north and pieces to keep</summary>
      <div class="designer-north"><label for="designer-north">North angle °</label><input id="designer-north" type="number" min="0" max="359.999999" step="any" placeholder="Unknown" aria-describedby="designer-north-help"/><small id="designer-north-help">Clockwise from plan-up: 0° ↑, 90° →. Leave blank if unknown.</small><small class="designer-north-status" role="status"></small></div>
      <details class="designer-keeps"><summary>Keep pieces in place</summary><div class="designer-keep-list"></div></details></details>
      <div class="designer-about" hidden><span class="designer-about-chip"><span>About: <strong class="designer-about-label"></strong></span></span></div>
      <form class="designer-form"><label for="designer-request" class="designer-visually-hidden">Message your designer</label>
        <div class="designer-input"><textarea id="designer-request" rows="1" maxlength="20000" placeholder="Ask anything" required></textarea>
        <div class="designer-actions"><button type="submit" class="designer-icon-button designer-send" aria-label="Send" title="Send">${designerIcon('send')}</button><button type="button" class="designer-icon-button designer-cancel" aria-label="Stop the designer" title="Stop" hidden>${designerIcon('stop')}</button></div></div></form>
      <small class="designer-compose-hint">Enter to send · Shift+Enter for a new line</small><small class="designer-storage-status"></small></div></div>`;
  const find = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const log = find<HTMLElement>('.designer-messages'), scroller = find<HTMLElement>('.designer-chat-scroll');
  const input = find<HTMLTextAreaElement>('textarea'), form = find<HTMLFormElement>('form');
  const north = find<HTMLInputElement>('#designer-north'), stage = find<HTMLElement>('.designer-progress-stage');
  const sendButton = find<HTMLButtonElement>('.designer-send'), stopButton = find<HTMLButtonElement>('.designer-cancel');
  let storage = options.storage;
  if (!storage) { try { storage = window.localStorage; } catch { /* Session-only chat. */ } }
  let messageKey = '', historyKey = '', previousBusy = false, activeThread = '', collapsed = false, hasMessages = false, contextualStarters = false;
  let ticker: ReturnType<typeof setInterval> | undefined, context: DesignerContext | null = null;
  const openSteps = new Set<string>();
  const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const button = (label: string, action: () => void, className = 'button') => {
    const item = document.createElement('button'); item.type = 'button'; item.className = className; item.textContent = label; item.onclick = action; return item;
  };
  const newChat = designerIconButton('plus', 'New conversation', () => { controller.newConversation(); renderKeeps(); input.focus(); }, 'designer-new');
  newChat.hidden = !live;
  const collapse = designerIconButton('panel-close', 'Collapse designer', () => setCollapsed(!collapsed), 'designer-collapse');
  collapse.setAttribute('aria-expanded', 'true');
  find<HTMLElement>('.designer-header-actions').append(newChat, collapse);
  const clearContext = designerIconButton('close', 'Clear context', () => setContext(null), 'designer-about-clear');
  find<HTMLElement>('.designer-about-chip').append(clearContext);
  const jump = designerIconButton('down', 'Jump to latest', () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' }), 'designer-jump');
  jump.hidden = true; scroller.append(jump);
  const updateJump = () => { jump.hidden = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120; };
  scroller.addEventListener('scroll', updateJump, { passive: true });

  const grow = () => { input.style.height = 'auto'; if (input.value) input.style.height = `${Math.min(input.scrollHeight + 2, 160)}px`; };
  const setInput = (value: string) => { input.value = value; grow(); };
  const setCollapsed = (value: boolean) => {
    collapsed = value; host.classList.toggle('designer-collapsed', value); find<HTMLElement>('.designer-chat-body').hidden = value;
    const label = value ? 'Open designer' : 'Collapse designer';
    collapse.setAttribute('aria-label', label); collapse.title = label; collapse.setAttribute('aria-expanded', String(!value));
  };
  function setContext(next: DesignerContext | null) {
    const label = typeof next?.label === 'string' ? next.label.trim().slice(0, 120) : '';
    context = next && typeof next.id === 'string' && label ? { id: next.id, label } : null;
    find<HTMLElement>('.designer-about').hidden = !context;
    find<HTMLElement>('.designer-about-label').textContent = context?.label ?? '';
  }

  /** One step row. The ring's phase follows the clock so a rebuilt row does not visibly restart. */
  const stepRow = (step: DesignerStep, current: boolean) => {
    const row = document.createElement('li'); row.className = `designer-step designer-step-${step.status}`;
    const mark = document.createElement('span'); mark.className = 'designer-step-mark';
    if (step.status === 'running') {
      const ring = document.createElement('span'); ring.className = 'designer-ring'; ring.style.animationDelay = `-${Math.round(performance.now() % 900)}ms`;
      mark.append(ring); mark.title = 'Working';
    } else { const [name, title] = stepMarks[step.status]; mark.innerHTML = designerIcon(name, 14); mark.title = title; }
    const hidden = document.createElement('span'); hidden.className = 'designer-visually-hidden'; hidden.textContent = `${mark.title}: `;
    const label = document.createElement('span'); label.className = 'designer-step-label'; label.append(hidden, step.label);
    if (step.timed && (step.status === 'running' || step.end !== undefined)) {
      const time = document.createElement('span'); time.className = 'designer-step-time'; time.dataset.at = String(step.at);
      if (step.end !== undefined) { time.dataset.end = String(step.end); time.textContent = designerClock(step.end - step.at); }
      label.append(' · ', time);
    }
    row.append(mark, label);
    if (current) { const elapsed = document.createElement('span'); elapsed.className = 'designer-elapsed'; elapsed.setAttribute('aria-hidden', 'true'); row.append(elapsed); }
    return row;
  };
  const stepList = (steps: DesignerStep[], current = -1) => {
    const list = document.createElement('ol'); list.className = 'designer-step-list';
    steps.forEach((step, index) => list.append(stepRow(step, index === current))); return list;
  };

  const previewFigure = (preview: DesignerPreview) => {
    const figure = document.createElement('figure'); figure.className = 'designer-preview';
    const image = document.createElement('img'); image.src = preview.image; image.alt = preview.caption ?? 'The designer\'s render'; image.loading = 'lazy';
    figure.append(image);
    if (preview.caption) { const caption = document.createElement('figcaption'); caption.textContent = preview.caption; figure.append(caption); }
    return figure;
  };
  const partialCard = (state: DesignerPanelState) => {
    const card = document.createElement('div'); card.className = 'designer-partial';
    const title = document.createElement('strong'); title.textContent = `Ready to look at: ${state.partial!.rooms.join(', ')}`;
    const note = document.createElement('small'); note.textContent = state.previewingPartial ? 'Showing these rooms in the editor · the view follows as more rooms are done' : 'Checked · the designer keeps working on the rest';
    card.append(title, note);
    if (!state.previewingPartial || options.isPreviewing?.() === false) card.append(button('Preview these rooms', () => { controller.previewPartial(); }, 'button quiet designer-partial-preview'));
    return card;
  };
  // The turn in flight lives outside the message key: the clock ticks every second and must not rebuild the log.
  const liveTurn = document.createElement('div'); liveTurn.className = 'designer-progress designer-turn'; liveTurn.setAttribute('aria-live', 'off'); liveTurn.hidden = true;
  let liveKey = '';
  const liveSteps = (state: DesignerPanelState): DesignerStep[] => {
    const steps = [...state.steps];
    if (!steps.some(step => step.status === 'running')) steps.push({ key: 'now', status: 'running', at: 0,
      label: !steps.length ? state.progress || 'Sending your request' : state.draft ? 'Writing the reply' : 'Thinking it through' });
    return steps;
  };
  const renderLive = (state: DesignerPanelState) => {
    liveTurn.hidden = !state.busy;
    if (!state.busy) { liveKey = ''; stage.textContent = ''; return; }
    const steps = liveSteps(state);
    const current = steps.map(step => step.status).lastIndexOf('running');
    const key = JSON.stringify([steps.map(step => [step.key, step.label, step.status, step.end]), state.preview?.image.length ?? 0, state.preview?.caption, state.partial?.proposal.id, state.previewingPartial]);
    if (key !== liveKey) {
      liveKey = key;
      // The last few steps stay readable; the earlier ones fold into a count.
      const shown = 7, hidden = Math.max(0, steps.length - shown), parts: HTMLElement[] = [];
      if (hidden) { const earlier = document.createElement('small'); earlier.className = 'designer-steps-earlier'; earlier.textContent = `${hidden} earlier step${hidden === 1 ? '' : 's'} done`; parts.push(earlier); }
      parts.push(stepList(steps.slice(hidden), current - hidden));
      if (state.partial) parts.push(partialCard(state));
      if (state.preview) parts.push(previewFigure(state.preview));
      liveTurn.replaceChildren(...parts);
    }
    for (const time of liveTurn.querySelectorAll<HTMLElement>('.designer-step-time:not([data-end])')) time.textContent = designerClock(state.elapsedSeconds - Number(time.dataset.at));
    const elapsed = liveTurn.querySelector<HTMLElement>('.designer-elapsed');
    if (elapsed) elapsed.textContent = designerClock(state.elapsedSeconds);
    stage.textContent = steps[current]?.label ?? state.progress;
  };

  const copyButton = (text: string) => {
    const control = designerIconButton('copy', 'Copy message', () => {
      const done = (name: string, label: string) => {
        control.innerHTML = designerIcon(name); control.setAttribute('aria-label', label); control.title = label;
        setTimeout(() => { control.innerHTML = designerIcon('copy'); control.setAttribute('aria-label', 'Copy message'); control.title = 'Copy message'; }, 1600);
      };
      if (!navigator.clipboard) { done('cross', 'Copy is not available here'); return; }
      navigator.clipboard.writeText(text).then(() => done('check', 'Copied'), () => done('cross', 'Could not copy'));
    }, 'designer-copy');
    return control;
  };
  const productChips = (proposal: AgentProposal) => {
    const { catalog = [], catalogCurrency } = options.snapshot();
    const products = proposalProducts(proposal, catalog, [...estimates.values()]);
    if (!products.length) return undefined;
    const list = document.createElement('ul'); list.className = 'designer-products'; list.setAttribute('aria-label', 'Pieces in this proposal');
    products.forEach((product, index) => {
      const chip = document.createElement('li'); chip.className = 'designer-product';
      const number = document.createElement('span'); number.className = 'designer-product-index'; number.setAttribute('aria-hidden', 'true'); number.textContent = String(index + 1);
      const name = document.createElement('span'); name.className = 'designer-product-name'; name.textContent = product.name;
      chip.append(number, name);
      if (product.price !== undefined && catalogCurrency === 'AMD') {
        const price = document.createElement('span'); price.className = 'designer-product-price';
        price.textContent = product.estimate ? `≈ ${money(product.price)}` : money(product.price);
        if (product.estimate) price.title = 'Sample estimate for a made-to-measure piece; the workshop confirms';
        chip.append(price);
      }
      list.append(chip);
    });
    return list;
  };

  const render = (state: DesignerPanelState) => {
    const switched = activeThread !== state.activeHistoryId; activeThread = state.activeHistoryId;
    if (switched) { setInput(''); openSteps.clear(); }
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 60;
    const nextKey = JSON.stringify([state.messages, state.options, state.busy, state.draft, state.queued]);
    if (nextKey !== messageKey) {
      messageKey = nextKey; log.replaceChildren();
      state.messages.forEach((message, index) => {
        const item = document.createElement('article'); item.className = `designer-message designer-message-${message.role}`;
        const author = document.createElement('strong'); author.className = 'designer-author'; author.textContent = message.role === 'user' ? 'You' : 'Designer'; item.append(author);
        if (message.steps) {
          const details = document.createElement('details'), summary = document.createElement('summary'), key = `${state.activeHistoryId}:${index}`;
          details.className = 'designer-steps'; details.open = openSteps.has(key);
          summary.textContent = designerStepsSummary(message.steps);
          details.ontoggle = () => { if (details.open) openSteps.add(key); else openSteps.delete(key); };
          details.append(summary, stepList(message.steps.steps)); item.append(details);
        }
        if (message.proposal) { const title = document.createElement('h3'); title.textContent = message.proposal.title; item.append(title); item.classList.add('designer-proposal-card'); }
        const text = document.createElement('div'); text.className = 'designer-message-copy';
        if (message.role === 'designer') text.innerHTML = designerMarkdown(message.text); else text.textContent = message.text; item.append(text);
        if (message.proposal) { const chips = productChips(message.proposal); if (chips) item.append(chips); }
        if (message.metrics) {
          const metrics = document.createElement('dl'); metrics.className = 'designer-metrics';
          for (const row of message.metrics) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = row.label; dd.textContent = row.value; metrics.append(dt, dd); }
          item.append(metrics);
          if (message.notes === undefined) { const note = document.createElement('small'); note.textContent = 'Service estimates. Paint and labour are not priced here.'; item.append(note); }
        }
        appendNotes(item, message.notes);
        if (message.preview) item.append(previewFigure(message.preview));
        if (message.proposal) {
          const status = document.createElement('p'); status.className = 'designer-proposal-status'; status.setAttribute('role', 'status');
          status.textContent = { pending: 'Ready for your review', applied: 'Applied', undone: 'Undone · no longer in your flat', dismissed: 'Dismissed', stale: 'Stale · the scene changed or was reopened. Ask for a fresh proposal.' }[message.status ?? 'stale']; item.append(status);
          if (message.status === 'pending') {
            const actions = document.createElement('div'); actions.className = 'designer-proposal-actions';
            const act = (action: ProposalAction) => () => controller.act(message.proposal!.id, action);
            const preview = button('Preview', act('preview'), 'button quiet designer-preview');
            const apply = button('Apply', act('apply'), 'button primary designer-apply');
            const dismiss = designerIconButton('close', 'Dismiss', act('dismiss'), 'designer-dismiss');
            for (const control of [preview, apply, dismiss]) { control.disabled = state.busy; actions.append(control); }
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
        if (message.role === 'designer') {
          const tools = document.createElement('div'); tools.className = 'designer-message-tools';
          tools.append(copyButton(message.proposal ? `${message.proposal.title}\n\n${message.text}` : message.text)); item.append(tools);
        }
        log.append(item);
      });
      log.append(liveTurn);
      if (state.draft) {
        const draft = document.createElement('article'); draft.className = 'designer-message designer-message-designer designer-draft'; draft.setAttribute('aria-live', 'off');
        const author = document.createElement('strong'); author.className = 'designer-author'; author.textContent = 'Designer';
        const copy = document.createElement('div'); copy.className = 'designer-message-copy'; copy.innerHTML = designerMarkdown(state.draft); draft.append(author, copy); log.append(draft);
      }
      if (state.queued) {
        const queued = document.createElement('article'); queued.className = 'designer-message designer-message-user designer-queued';
        const author = document.createElement('strong'); author.className = 'designer-author'; author.textContent = 'You, queued';
        const copy = document.createElement('div'); copy.className = 'designer-message-copy'; copy.textContent = state.queued;
        const note = document.createElement('small'); note.textContent = 'Queued · sends when the designer finishes';
        const remove = designerIconButton('close', 'Remove queued message', () => controller.unqueue(), 'designer-unqueue');
        const foot = document.createElement('div'); foot.className = 'designer-queued-foot'; foot.append(note, remove);
        queued.append(author, copy, foot); log.append(queued);
      }
      if (nearBottom || switched) scroller.scrollTop = scroller.scrollHeight;
    }
    renderLive(state);
    if (nearBottom && state.busy) scroller.scrollTop = scroller.scrollHeight;
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
    // The submit button stays in the form and disabled while busy: automation waits on it to learn the turn ended.
    sendButton.disabled = state.busy; sendButton.hidden = state.busy; stopButton.hidden = !state.busy;
    input.placeholder = state.busy ? 'Queue your next message' : 'Ask anything';
    find<HTMLElement>('.designer-compose-hint').textContent = state.busy ? 'Enter queues your message · Shift+Enter for a new line' : 'Enter to send · Shift+Enter for a new line';
    for (const control of host.querySelectorAll<HTMLButtonElement>('.designer-examples button')) control.disabled = state.busy;
    if (document.activeElement !== north && !state.northError) north.value = state.northDeg === undefined ? '' : String(state.northDeg);
    north.disabled = state.busy; north.setCustomValidity(state.northError);
    find<HTMLElement>('.designer-north-status').textContent = state.northError || (state.northDeg === undefined ? 'Sun direction unknown.' : state.northPersisted ? 'Saved for this scene.' : 'For this session only.');
    find<HTMLElement>('.designer-storage-status').textContent = !live ? 'Recorded demo replies. Nothing is sent to a designer.'
      : state.historyPersisted ? 'Conversations saved on this device.' : 'Conversations stay in this session until browser storage is available.';
    for (const control of host.querySelectorAll<HTMLInputElement>('.designer-keep-list input')) control.disabled = state.busy;
    host.setAttribute('aria-busy', String(state.busy));
    if (previousBusy !== state.busy) {
      if (ticker !== undefined) clearInterval(ticker);
      ticker = state.busy ? setInterval(() => controller.tick(), 1000) : undefined;
      options.onBusyChange?.(state.busy);
      if (!state.busy && !collapsed && host.getClientRects().length) input.focus();
    }
    previousBusy = state.busy;
    updateJump();
  };
  const statusLine = find<HTMLElement>('.designer-service-status');
  let healthTimer: ReturnType<typeof setTimeout> | undefined, checking = false;
  const showHealth = (health: DesignerHealth) => {
    const warming = health.ok && health.warm && Object.values(health.warm).some(value => value === 'starting' || value === 'cold');
    statusLine.hidden = health.ok && !warming;
    statusLine.className = `designer-service-status ${health.ok ? 'designer-service-warming' : 'designer-service-offline'}`;
    if (!health.ok) {
      statusLine.innerHTML = '<strong>Designer offline</strong> · start the service: <code></code>';
      statusLine.querySelector('code')!.textContent = DESIGNER_START_HINT;
    } else if (warming) statusLine.textContent = `Designer warming up${health.warm?.renderer === 'starting' ? ' · starting the renderer' : health.warm?.codex === 'starting' ? ' · starting the model' : ''}…`;
    host.dataset.designerService = !health.ok ? 'offline' : warming ? 'warming' : 'online';
  };
  const checkHealth = async () => {
    if (!live || !options.health || checking) return;
    checking = true; if (healthTimer !== undefined) clearTimeout(healthTimer);
    let health: DesignerHealth = { ok: false };
    try { health = await options.health(); } catch { /* unreachable */ } finally { checking = false; }
    showHealth(health);
    const warming = health.ok && health.warm && Object.values(health.warm).some(value => value !== 'ready' && value !== 'failed');
    healthTimer = setTimeout(() => { void checkHealth(); }, !health.ok ? 3000 : warming ? 2000 : 20000);
  };
  const controller = createDesignerConversation({ ...options, storage, history: live, ask, onChange: render, onUnreachable: () => { void checkHealth(); } });
  const renderKeeps = () => {
    const list = find<HTMLElement>('.designer-keep-list'); list.replaceChildren();
    for (const object of options.snapshot().scene.objects) {
      const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = controller.state.keep.includes(object.id); checkbox.disabled = controller.state.busy;
      checkbox.onchange = () => controller.setKeep(object.id, checkbox.checked); label.append(checkbox, document.createTextNode(object.name)); list.append(label);
    }
    if (!list.childElementCount) list.textContent = 'There are no furniture pieces yet.';
  };
  let starterKey = '';
  const renderStarters = () => {
    const { scene, catalog } = options.snapshot();
    const suggestions = live ? designerStarters(scene, catalog, controller.state.northDeg) : recordedStarters;
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
  stopButton.onclick = () => {
    const unsent = controller.cancel();
    if (unsent) {
      // Hand the queued words back without the context prefix the composer would add again.
      const prefix = context ? designerContextRequest('x', context).slice(0, -1) : '';
      const text = prefix && unsent.startsWith(prefix) ? unsent.slice(prefix.length) : unsent;
      setInput(input.value.trim() ? `${text}\n\n${input.value}` : text);
    }
    input.focus();
  };
  north.onchange = () => { controller.setNorth(north.validity.badInput ? 'invalid' : north.value); north.reportValidity(); renderStarters(); };
  form.onsubmit = event => {
    event.preventDefault();
    const request = designerContextRequest(input.value, context);
    if (!request) return;
    if (controller.state.busy) { void controller.queue(request); setInput(''); return; }
    void controller.send(request); if (controller.state.busy) setInput('');
  };
  input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } };
  input.oninput = () => grow();
  render(controller.state); renderKeeps(); renderStarters(); void checkHealth();
  const unsubscribe = options.subscribe?.(() => { controller.refreshSettings(); renderKeeps(); renderStarters(); });
  return {
    controller,
    open() { setCollapsed(false); input.focus(); },
    /** The buyer's current focus (a selected piece), or null. Shown as a chip; prefixes what they type next. */
    setContext,
    dispose() { if (ticker !== undefined) clearInterval(ticker); if (healthTimer !== undefined) clearTimeout(healthTimer); controller.dispose(); unsubscribe?.(); host.replaceChildren(); },
  };
}
