import type { AgentProposal } from '../contracts';
import type { DesignerPanelState } from './designer-panel';
import { designerPieceName } from './designer-steps';
import { blueprintJourneyMarkup } from '../portal/blueprint-journey';
import '../portal/blueprint-journey.css';
import type { BundlePresentation } from '../portal/blueprint-presentation';
import './design-onboarding.css';

interface DesignOnboardingOptions {
  live: boolean;
  submit(request: string): void;
  cancel(): void;
  apply(): void;
  edit(): void;
  skip(): void;
  /** Opened from the plan catalog: the scene is a developer's furnished design, not an empty reconstruction. */
  bundle?: BundlePresentation;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Words for the two ways into Design: an empty reconstruction to furnish, or a furnished catalog design to change. */
function copy(bundle?: BundlePresentation) {
  if (!bundle) return {
    done: '✓ Plan drawn', eyebrow: '02 / DESIGN', heading: 'Make room for your life.',
    intro: 'Your apartment is built. Tell your designer how you want to live here, then explore the proposed layout.',
    unavailable: 'The designer is not connected here. You can open the tools and furnish your apartment yourself.',
    label: 'What would make this feel like home?', placeholder: 'A warm living room, a desk by the window, room to have friends over…',
    hint: 'We’ll keep your existing pieces and furnish the empty spaces. Add a style, budget, or anything you need.',
    submit: 'Design my space', refineHeading: 'Refine your first design.', ready: 'Your first design is ready to explore.',
    review: 'Look around your proposed layout. It becomes yours when you choose it.',
    blank: 'Keep the existing furniture and fixtures. Furnish the empty spaces into a cohesive, comfortable home using available catalog pieces, with clear walkways. Ask me if you need a preference before proposing the layout.',
  };
  const pieces = `${bundle.furnishedPieces} piece${bundle.furnishedPieces === 1 ? '' : 's'}`;
  return {
    done: `✓ Built by ${bundle.developerName}`, eyebrow: `02 / DESIGN · ${bundle.developerName.toUpperCase()}`, heading: bundle.name,
    intro: `This is ${bundle.developerName}’s furnished design for this plan, ${pieces} in place. Ask your designer to change anything, or customize it yourself.`,
    unavailable: 'The designer is not connected here. You can still explore this design and customize it yourself.',
    label: 'What would you change?', placeholder: 'A lighter sofa, a desk in the small bedroom, more room to walk around the dining table…',
    hint: 'Your designer starts from this design and changes only what you ask. Nothing is saved until you save.',
    submit: 'Ask the designer', refineHeading: 'Refine the change.', ready: 'Your changes are ready to compare with the original design.',
    review: 'Look around the proposed changes. They become yours when you choose them.',
    blank: 'Keep this furnished design and every existing piece. Suggest a few improvements that make it more comfortable to live in, with clear walkways. Ask me if you need a preference before proposing changes.',
  };
}

/** A second view of the editor's designer conversation, never a second request or scene owner. */
export function mountDesignOnboarding(host: HTMLElement, options: DesignOnboardingOptions) {
  const element = document.createElement('section');
  element.className = 'design-onboarding';
  const words = copy(options.bundle), bundle = options.bundle;
  element.setAttribute('aria-label', bundle ? `Design · ${bundle.name}` : 'Design your apartment');
  if (bundle) element.classList.add('design-from-bundle');
  const plan = bundle ? `<figure class="design-bundle-plan"><img src="${escapeHtml(bundle.blueprintUrl)}" alt="${escapeHtml(bundle.developerName)}’s floor plan for ${escapeHtml(bundle.name)}"><figcaption><span>Original plan</span><a href="${escapeHtml(bundle.developerHref)}">${escapeHtml(bundle.developerName)} <span aria-hidden="true">↗</span></a></figcaption></figure>` : '';
  element.innerHTML = `<div class="design-journey"><span class="design-plan-done">${escapeHtml(words.done)}</span>${blueprintJourneyMarkup('design')}</div>
    <section class="design-brief" aria-labelledby="design-heading">
      ${plan}<span class="design-eyebrow">${escapeHtml(words.eyebrow)}</span><h1 id="design-heading">${escapeHtml(words.heading)}</h1>
      <p class="design-intro">${escapeHtml(words.intro)}</p>
      <p class="design-unavailable" ${options.live ? 'hidden' : ''}>${escapeHtml(words.unavailable)}</p>
      <div class="design-response" aria-live="polite" hidden></div>
      <div class="design-options" aria-label="Suggested replies" hidden></div>
      <form class="design-form" ${options.live ? '' : 'hidden'}><label for="design-brief-input">${escapeHtml(words.label)}</label>
        <textarea id="design-brief-input" rows="3" maxlength="20000" placeholder="${escapeHtml(words.placeholder)}"></textarea>
        <small>${escapeHtml(words.hint)}</small>
        <button type="submit" class="design-primary">${escapeHtml(words.submit)} <span aria-hidden="true">↗</span></button>
      </form>
      <div class="design-working" hidden><span class="design-live-dot" aria-hidden="true"></span><p role="status"></p><button type="button" class="design-text-button design-stop">Stop</button></div>
      <div class="design-review" hidden><p class="design-review-note">${escapeHtml(words.review)}</p><button type="button" class="design-primary design-apply">Use this design <span aria-hidden="true">↗</span></button><button type="button" class="design-text-button design-edit">Edit request</button></div>
      <button type="button" class="design-text-button design-skip">Customize myself <span aria-hidden="true">→</span></button>
    </section><p class="design-navigation">Drag to orbit <span>·</span> Scroll to zoom</p>`;
  host.append(element);
  const find = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>('.design-form'), input = find<HTMLTextAreaElement>('textarea');
  const response = find<HTMLElement>('.design-response'), choices = find<HTMLElement>('.design-options');
  const working = find<HTMLElement>('.design-working'), review = find<HTMLElement>('.design-review');
  const submit = find<HTMLButtonElement>('[type=submit]');
  let reviewing = false, busy = false, sent = false, disposed = false, choiceKey = '';
  const send = (request: string) => {
    if (busy || !options.live) return;
    sent = true; reviewing = false; response.hidden = true; choices.hidden = true;
    options.submit(request.trim() || words.blank);
  };
  form.onsubmit = event => { event.preventDefault(); send(input.value); };
  find<HTMLButtonElement>('.design-stop').onclick = options.cancel;
  find<HTMLButtonElement>('.design-apply').onclick = options.apply;
  find<HTMLButtonElement>('.design-edit').onclick = () => {
    options.edit(); reviewing = false; review.hidden = true; form.hidden = !options.live;
    find<HTMLElement>('#design-heading').textContent = words.refineHeading;
    find<HTMLElement>('.design-intro').textContent = 'Tell your designer what to change, and explore the next proposal.';
    submit.textContent = 'Send revised request ↗'; input.focus();
  };
  find<HTMLButtonElement>('.design-skip').onclick = options.skip;
  return {
    update(state: DesignerPanelState) {
      if (disposed) return;
      busy = state.busy;
      working.hidden = !busy; review.hidden = busy || !reviewing; form.hidden = !options.live || busy || reviewing;
      input.disabled = busy; submit.disabled = busy;
      find<HTMLElement>('.design-working p').textContent = (state.progress || 'Your designer is working…')
        .replace(/\bcustom-[A-Za-z0-9-]+-\d+\b/g, id => designerPieceName(id));
      element.setAttribute('aria-busy', String(busy));
      if (!sent || busy || reviewing) { choices.hidden = true; if (busy) response.hidden = true; return; }
      const reply = state.messages.at(-1);
      if (reply?.role === 'designer') {
        response.textContent = reply.text; response.hidden = false;
      }
      const nextKey = JSON.stringify(state.options);
      if (nextKey !== choiceKey) {
        choiceKey = nextKey; choices.replaceChildren();
        for (const option of state.options) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = option;
          button.onclick = () => send(option); choices.append(button);
        }
      }
      choices.hidden = !state.options.length;
      submit.textContent = reply?.retryRequest ? 'Try again ↗' : 'Send to designer ↗';
      // A failed request is retryable without losing the person's original brief.
      if (reply?.retryRequest && !input.value.trim()) input.value = reply.retryRequest;
    },
    review(proposal: AgentProposal) {
      if (disposed) return;
      reviewing = true; busy = false; form.hidden = true; working.hidden = true; choices.hidden = true; review.hidden = false;
      response.textContent = proposal.description; response.hidden = false;
      find<HTMLElement>('#design-heading').textContent = proposal.title;
      find<HTMLElement>('.design-intro').textContent = words.ready;
      find<HTMLButtonElement>('.design-apply').focus({ preventScroll: true });
    },
    error(message: string) {
      if (disposed) return;
      reviewing = false; review.hidden = true; form.hidden = !options.live; working.hidden = true;
      response.textContent = message; response.hidden = false;
    },
    dispose() { disposed = true; element.remove(); },
  };
}
