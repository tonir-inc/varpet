import type { AgentProposal, SceneDocument } from '../contracts';
import { askDesigner, type DesignerRequest, type DesignerReply } from '../adapters/designer-http';
type AskDesigner = typeof askDesigner;

interface Message { role: 'user' | 'designer'; text: string }
export interface DesignerPanelState {
  messages: Message[]; busy: boolean; progress: string; options: string[];
  conversationId?: string; keep: string[];
}
interface ConversationOptions {
  ask: AskDesigner;
  snapshot: () => { scene: SceneDocument; revision: number };
  onProposal: (proposal: AgentProposal) => void;
  onChange?: (state: DesignerPanelState) => void;
  canRequest?: () => boolean;
}

/** Owns chat state only. A proposal can only leave through the editor's review callback. */
export function createDesignerConversation(options: ConversationOptions) {
  const state: DesignerPanelState = { messages: [], busy: false, progress: '', options: [], keep: [] };
  let active: AbortController | undefined, disposed = false;
  const publish = () => { if (!disposed) options.onChange?.(structuredClone(state)); };
  const reply = (text: string) => state.messages.push({ role: 'designer', text });
  return {
    get state() { return structuredClone(state); },
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
      if (options.canRequest?.() === false) { reply('Finish the current preview or request, then try again.'); publish(); return; }
      const { scene, revision } = options.snapshot();
      const controller = new AbortController(); active = controller;
      state.keep = state.keep.filter(id => scene.objects.some(object => object.id === id));
      state.messages.push({ role: 'user', text: request });
      state.busy = true; state.progress = 'Considering your space…'; state.options = []; publish();
      try {
        const result = await options.ask({ scene: structuredClone(scene), revision, request,
          conversationId: state.conversationId, keep: [...state.keep] }, {
          signal: controller.signal,
          onProgress: message => { if (active === controller && !disposed) { state.progress = message; publish(); } },
        });
        if (disposed || active !== controller) return;
        if (result.type !== 'error') state.conversationId = result.conversationId;
        if (result.type === 'proposal') {
          options.onProposal(result.proposal);
          reply(`${result.proposal.title}\n${result.proposal.description}\nReview the proposed change below before applying it.`);
        } else if (result.type === 'question') {
          reply(result.question); state.options = [...result.options];
        } else reply(result.message);
      } catch (error) {
        if (disposed || active !== controller) return;
        reply(error instanceof Error ? error.message : 'The designer could not finish. Please try again.');
      } finally {
        if (!disposed && active === controller) {
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
    <p class="designer-progress" role="status" hidden></p>
    <details class="designer-keeps"><summary>Keep pieces in place</summary><p>These pieces stay untouched in your next request.</p><div class="designer-keep-list"></div></details>
    <form class="designer-form"><label for="designer-request">What would you like to change?</label>
      <textarea id="designer-request" name="request" rows="3" maxlength="20000" placeholder="Make the living room feel bigger…" required></textarea>
      <div class="designer-actions"><button class="button primary" type="submit">Send request</button><button class="button quiet designer-cancel" type="button" hidden>Cancel</button></div>
    </form>
    ${options.live ? '' : '<p class="designer-demo-note">Recorded examples: “Move the table”, “Make it cozier”, or “Pick paint colours”.</p>'}`;
  const find = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const log = find<HTMLDivElement>('.designer-messages'), choices = find<HTMLDivElement>('.designer-options');
  const progress = find<HTMLParagraphElement>('.designer-progress'), input = find<HTMLTextAreaElement>('textarea');
  const send = find<HTMLButtonElement>('[type="submit"]'), cancel = find<HTMLButtonElement>('.designer-cancel');
  const keeps = find<HTMLDivElement>('.designer-keep-list');
  let displayedMessages = 0, previousBusy = false;
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
  const controller = createDesignerConversation({ ...options, ask: options.ask ?? (options.live ? askDesigner : createRecordedDesigner()),
    onChange: state => {
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
      for (const message of state.messages.slice(displayedMessages)) {
        const item = document.createElement('div'); item.className = `designer-message designer-message-${message.role}`;
        const author = document.createElement('strong'); author.textContent = message.role === 'user' ? 'You' : 'Designer';
        const text = document.createElement('p'); text.textContent = message.text;
        item.append(author, text); log.append(item);
      }
      displayedMessages = state.messages.length;
      if (nearBottom) log.scrollTop = log.scrollHeight;
      choices.replaceChildren();
      for (const option of state.options) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button';
        button.textContent = option; button.disabled = state.busy; button.onclick = () => { void controller.send(option); };
        choices.append(button);
      }
      progress.textContent = state.progress; progress.hidden = !state.busy;
      cancel.hidden = !state.busy; send.disabled = state.busy; input.disabled = state.busy;
      host.setAttribute('aria-busy', String(state.busy));
      for (const checkbox of keeps.querySelectorAll<HTMLInputElement>('input')) checkbox.disabled = state.busy;
      if (previousBusy !== state.busy) {
        options.onBusyChange?.(state.busy);
        if (!state.busy && host.getClientRects().length) input.focus();
      }
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
  renderKeeps(); const unsubscribe = options.subscribe?.(renderKeeps);
  return { controller, dispose() { controller.dispose(); unsubscribe?.(); host.replaceChildren(); } };
}
