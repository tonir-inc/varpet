import './review.css';
import type { AgentProposal } from '../contracts';

export interface ProposalBarDeps {
  host: HTMLElement;
  accept(proposal: AgentProposal): void;
  reject(proposal: AgentProposal, partial: boolean): void;
}

/** The one control in the viewer while a designer proposal is previewed: its title, Reject and Accept. */
export function mountProposalBar(deps: ProposalBarDeps) {
  const bar = document.createElement('section');
  bar.className = 'proposal-bar'; bar.hidden = true; bar.setAttribute('aria-label', 'Designer proposal');
  bar.innerHTML = `<p class="proposal-bar-title"><em></em><span></span></p>
    <button type="button" class="proposal-bar-button" data-bar="reject">Reject</button>
    <button type="button" class="proposal-bar-button proposal-bar-accept" data-bar="accept">Accept</button>`;
  deps.host.append(bar);
  const title = bar.querySelector<HTMLElement>('.proposal-bar-title em')!, hint = bar.querySelector<HTMLElement>('.proposal-bar-title span')!;
  const reject = bar.querySelector<HTMLButtonElement>('[data-bar=reject]')!, accept = bar.querySelector<HTMLButtonElement>('[data-bar=accept]')!;
  let proposal: AgentProposal | null = null, partial = false;
  reject.onclick = () => { if (proposal) deps.reject(proposal, partial); };
  accept.onclick = () => { if (proposal) deps.accept(proposal); };
  const api = {
    show(next: AgentProposal, options: { partial?: boolean; busy?: boolean } = {}) {
      proposal = next; partial = options.partial === true;
      title.textContent = partial ? 'Rooms designed so far' : next.title || 'Designer’s proposal';
      title.title = title.textContent;
      hint.textContent = partial ? ' · the designer is still working' : ' · click anything to ask about it';
      reject.textContent = partial ? 'Close' : 'Reject';
      api.setBusy(options.busy === true);
      bar.hidden = false;
    },
    /** Accept waits while the designer works on a turn (and never applies rooms still being designed). */
    setBusy(busy: boolean) { accept.disabled = busy || partial; accept.title = partial ? 'Wait for the whole design' : busy ? 'The designer is working' : 'Apply this proposal to your flat'; },
    hide() { proposal = null; bar.hidden = true; },
    dispose() { bar.remove(); },
  };
  return api;
}
