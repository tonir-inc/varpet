import type { DesignerEvent } from '../adapters/designer-events';

/** One visible step of a designer turn. Times are seconds since the request was sent. */
export type DesignerStepStatus = 'running' | 'done' | 'failed' | 'unfinished';
export interface DesignerStep { key: string; label: string; status: DesignerStepStatus; at: number; end?: number; timed?: boolean; name?: string }
export interface DesignerTurnSteps { steps: DesignerStep[]; seconds: number }

const MAX_STEPS = 60;
const statuses: DesignerStepStatus[] = ['running', 'done', 'failed', 'unfinished'];
// Longer, more specific words first so "bookshelf" wins over "shelf".
const nouns = ['sideboard', 'bookshelf', 'bookcase', 'wardrobe', 'nightstand', 'dresser', 'cupboard', 'console', 'cabinet',
  'shelf', 'desk', 'table', 'bench', 'sofa', 'armchair', 'chair', 'stool', 'vanity', 'bed'];

/** A custom slot id names its piece loosely (custom-livecabinet-1); never invent more than one known noun. */
export function designerPieceName(slotId?: string): string {
  const raw = /^custom-([A-Za-z0-9-]+)-\d+$/.exec(slotId ?? '')?.[1]?.toLowerCase() ?? '';
  const noun = nouns.find(word => raw.includes(word));
  return noun ? `the ${noun}` : 'a custom piece';
}

/** m:ss, the way a stopwatch reads. */
export function designerClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Plain-English label for a tool call. Counts and prices only when the service reported them. */
export function designerToolLabel(event: Extract<DesignerEvent, { type: 'tool' }>): string {
  const refs = event.refs ?? {};
  const found = refs.results ?? refs.candidates ?? refs.itemIds;
  switch (event.name) {
    case 'set_intent': return 'Understanding your request';
    case 'scene_summary': return 'Looking over your flat';
    case 'search_catalog': return `Searching Yerevan shops${found ? ` · ${plural(found.length, 'result')}` : ''}`;
    case 'show_candidates': return `Comparing options${refs.candidates ? ` · ${plural(refs.candidates.length, 'option')}` : ''}`;
    case 'reserve_slot': return `Reserving space to build ${designerPieceName(refs.slotId)}`;
    case 'build_piece': return `Starting to build ${designerPieceName(refs.slotId)}`;
    case 'place': return `Placing the furniture${refs.ok === false ? ' · needs another try' : ''}`;
    case 'check_layout': return `Checking walkways and doors${refs.ok === false ? ' · found a problem' : ''}`;
    case 'score_layout': return 'Measuring open floor and walkways';
    case 'sun': return 'Checking the daylight';
    case 'propose': return 'Preparing the proposal';
    case 'ask': return 'Preparing a question for you';
    case 'quote': {
      if (refs.currency !== 'AMD' || refs.cost_dram === undefined) return 'Pricing the pieces';
      const source = refs.price_source === 'catalog' ? '' : refs.price_source === 'mock' ? ' (sample prices)' : ' (unverified prices)';
      return `Pricing the pieces · ${refs.cost_dram.toLocaleString('en-US')} ֏${source}`;
    }
    default: return event.summary;
  }
}

const buildLabels = { queued: 'Waiting to build', building: 'Building', fixing: 'Refining', done: 'Built', failed: 'Could not build' } as const;

/** Fold one service event into the turn's steps. Pure: returns a new list. */
export function applyDesignerEvent(steps: DesignerStep[], event: DesignerEvent, at: number): DesignerStep[] {
  const next = steps.map(step => ({ ...step }));
  const time = Math.max(0, Number.isFinite(at) ? at : 0);
  if (event.type === 'build') {
    const key = `build:${event.slotId}`, piece = designerPieceName(event.slotId);
    const status: DesignerStepStatus = event.state === 'done' ? 'done' : event.state === 'failed' ? 'failed' : 'running';
    const label = `${buildLabels[event.state]} ${piece}${event.state === 'failed' && event.reason ? `: ${event.reason}` : ''}`;
    const existing = next.find(step => step.key === key);
    if (existing) Object.assign(existing, { label, status, ...(status === 'running' ? {} : { end: time }) });
    else next.push({ key, label, status, at: time, timed: true, ...(status === 'running' ? {} : { end: time }) });
    return next.slice(-MAX_STEPS);
  }
  const key = `tool:${event.name}:${event.callId ?? ''}`, label = designerToolLabel(event);
  const status: DesignerStepStatus = event.phase === 'start' ? 'running' : event.phase === 'end' ? 'done' : 'failed';
  // Calls without an id can only close the latest open call of the same tool.
  const existing = [...next].reverse().find(step => step.key === key && (event.callId !== undefined || step.status === 'running'));
  const last = next.at(-1);
  const target = existing ?? (last && !last.timed && last.name === event.name && last.label === label ? last : undefined);
  if (target) {
    target.label = label; target.status = status;
    if (status === 'running') delete target.end; else target.end = time;
  } else next.push({ key, label, status, at: time, name: event.name, ...(status === 'running' ? {} : { end: time }) });
  return next.slice(-MAX_STEPS);
}

/** When the reply lands, anything still open did not finish in this turn (a build can outlive the stream). */
export function finishDesignerSteps(steps: DesignerStep[], at: number): DesignerStep[] {
  return steps.map(step => step.status === 'running' ? { ...step, status: 'unfinished' as const } : { ...step }).slice(-MAX_STEPS)
    .map(step => step.end === undefined && step.status !== 'unfinished' ? { ...step, end: at } : step);
}

/** "5 steps · 1:42", with failures counted so a collapsed turn never hides one. */
export function designerStepsSummary(turn: DesignerTurnSteps): string {
  const failed = turn.steps.filter(step => step.status === 'failed').length;
  const open = turn.steps.filter(step => step.status === 'unfinished').length;
  return [plural(turn.steps.length, 'step'), failed ? `${failed} failed` : '', open ? `${open} unfinished` : '', designerClock(turn.seconds)]
    .filter(Boolean).join(' · ');
}

/** Stored history is untrusted: keep valid turns, drop anything malformed without losing the message. */
export function validDesignerTurnSteps(value: unknown): value is DesignerTurnSteps {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const turn = value as Record<string, unknown>;
  const time = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 86400;
  return time(turn.seconds) && Array.isArray(turn.steps) && turn.steps.length > 0 && turn.steps.length <= MAX_STEPS
    && turn.steps.every(item => {
      if (!item || typeof item !== 'object') return false;
      const step = item as Record<string, unknown>;
      return typeof step.key === 'string' && step.key.length <= 300 && typeof step.label === 'string' && !!step.label.trim() && step.label.length <= 400
        && statuses.includes(step.status as DesignerStepStatus) && time(step.at) && (step.end === undefined || time(step.end))
        && (step.timed === undefined || typeof step.timed === 'boolean') && (step.name === undefined || typeof step.name === 'string');
    });
}
