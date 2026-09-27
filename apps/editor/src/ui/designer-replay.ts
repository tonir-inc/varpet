/** Recorded designer sessions (apps/editor/public/demo-sessions/<name>.json, made by tools/demo_session.py from a
 * real live run): the recorded NDJSON stream is played through the real HTTP adapter at 4–10× speed, so validation,
 * catalog lookups, room previews and Apply behave exactly as they did live. Its clock shows the recorded times. The
 * run ends in the real proposal; follow-ups then go to the live service, continuing the recorded design. */

export interface RecordedEvent { t: number; record: Record<string, unknown> }
export interface RecordedTurn { request: string; seconds: number; events: RecordedEvent[] }
export interface DesignerSession {
  format: 'varpet.designer-session'; version: 1;
  name: string; title: string; recordedAt: string; flat: string;
  /** The editor document the run started from. */
  scene: unknown;
  turns: RecordedTurn[];
  /** The design at the end of the run, for live follow-ups: draft.json, owned ids and the customer's words. */
  design?: { draft: Record<string, unknown>; owned: string[]; requests: string[] };
  conversationId: string;
}

/** A clock that runs `scale` times faster while a recording plays and can be set to a recorded time. */
export function createReplayClock(real: () => number = () => performance.now()) {
  let virtual = 0, last = real(), scale = 1;
  const clock = {
    now() { const at = real(); virtual += (at - last) * scale; last = at; return virtual; },
    set scale(value: number) { clock.now(); scale = value; },
    get scale() { return scale; },
    /** Jump forward to `ms` (recorded time since the turn started at `origin`), never backwards. */
    reach(origin: number, ms: number) { clock.now(); virtual = Math.max(virtual, origin + ms); },
  };
  return clock;
}
export type ReplayClock = ReturnType<typeof createReplayClock>;

export function validSession(value: unknown): value is DesignerSession {
  const session = value as DesignerSession;
  return !!session && session.format === 'varpet.designer-session' && session.version === 1 && typeof session.name === 'string'
    && Array.isArray(session.turns) && session.turns.every(turn => typeof turn?.request === 'string' && Array.isArray(turn.events))
    && typeof session.conversationId === 'string';
}

export async function loadSession(name: string, fetcher: typeof fetch = fetch): Promise<DesignerSession> {
  if (!/^[\w-]{1,80}$/.test(name)) throw new Error('Unknown recorded session.');
  const response = await fetcher(`/demo-sessions/${name}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Recorded session ${name} is not available.`);
  const session = await response.json() as unknown;
  if (!validSession(session)) throw new Error('This recorded session cannot be played.');
  return session;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Replay cancelled.', 'AbortError')); }, { once: true });
});

/** A fetch that answers one designer request with a recorded turn, paced at `speed` (gaps capped at `maxGapMs`).
 * Proposals are rebased onto the request's revision: the recording started from the same flat document. */
export function recordedFetch(turn: RecordedTurn, speed: number, clock?: ReplayClock, maxGapMs = 4000): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { revision?: number };
    const signal = init?.signal ?? undefined, encoder = new TextEncoder();
    const origin = clock?.now() ?? 0;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (clock) clock.scale = speed;
        try {
          let previous = 0;
          for (const { t, record } of turn.events) {
            await sleep(Math.min(Math.max(0, t - previous) * 1000 / speed, maxGapMs), signal);
            previous = t;
            clock?.reach(origin, t * 1000);
            const line = structuredClone(record) as Record<string, unknown> & { proposal?: { command?: { baseRevision?: number } } };
            if ((line.type === 'proposal' || line.type === 'partial') && line.proposal?.command && typeof body.revision === 'number') line.proposal.command.baseRevision = body.revision;
            controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'));
          }
          controller.close();
        } catch (error) { controller.error(error); }
        finally { if (clock) clock.scale = 1; }
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  }) as typeof fetch;
}

export function sessionBadge(session: DesignerSession, speed: number): string {
  const day = /^\d{4}-\d{2}-(\d{2})/.exec(session.recordedAt)?.[1];
  const month = new Date(session.recordedAt).toLocaleString('en-US', { month: 'short' });
  return `Recorded run · ${day ? `${Number(day)} ${month}` : session.recordedAt}, ${speed}× speed`;
}
