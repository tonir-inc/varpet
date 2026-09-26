import type { Recording, StreamLine } from '../contracts';

export interface PlayOptions { speed: number; onLine(line: StreamLine, at: number): void; signal?: AbortSignal }
export interface Playback { done: Promise<void>; setSpeed(n: number): void; skipToEnd(): void }

/** Replay a recording: each line fires at `at / speed` seconds; a speed change applies to the lines still to come. */
export function play(recording: Recording, opts: PlayOptions): Playback {
  const lines = [...recording.lines].sort((a, b) => a.at - b.at);
  const positive = (n: number) => { if (!(n > 0) || !Number.isFinite(n)) throw new RangeError('Playback speed must be a positive number.'); return n; };
  let speed = positive(opts.speed), next = 0, timer: ReturnType<typeof setTimeout> | undefined;
  // Recording time (s) at the wall-clock anchor (ms); now() maps wall time back to recording time.
  let anchorAt = 0, anchorWall = performance.now();
  const now = () => anchorAt + (performance.now() - anchorWall) / 1000 * speed;
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  let finished = false;
  const end = () => {
    if (finished) return;
    finished = true; clearTimeout(timer); opts.signal?.removeEventListener('abort', end); finish();
  };
  const emitUntil = (t: number) => {
    while (!finished && next < lines.length && lines[next]!.at <= t) { const { line, at } = lines[next++]!; opts.onLine(line, at); }
    if (next >= lines.length) end();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (finished) return;
    emitUntil(now());
    if (finished) return;
    timer = setTimeout(schedule, Math.max(0, (lines[next]!.at - now()) / speed * 1000));
  };
  if (opts.signal?.aborted) end();
  else { opts.signal?.addEventListener('abort', end, { once: true }); timer = setTimeout(schedule, 0); } // first lines after play() returns
  return {
    done,
    setSpeed(n) { const at = now(); speed = positive(n); anchorAt = at; anchorWall = performance.now(); schedule(); },
    skipToEnd() { clearTimeout(timer); emitUntil(Infinity); },
  };
}
