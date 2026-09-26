import type { StreamLine } from '../contracts';

const MAX_LINE = 1 << 20; // 1 MB of text; a longer line is dropped, not buffered forever
const BUILD_STATES = ['queued', 'writing', 'checking', 'fixing', 'done', 'failed'];
const str = (v: unknown) => typeof v === 'string';
const obj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The fields a line needs before the reducer can trust it; any other `type` is skipped. */
const valid: Record<StreamLine['type'], (l: Record<string, unknown>) => boolean> = {
  progress: l => str(l.message),
  message_delta: l => str(l.delta),
  tool: l => str(l.name) && (l.phase === 'start' || l.phase === 'end') && (l.refs === undefined || obj(l.refs)),
  build: l => str(l.slotId) && BUILD_STATES.includes(l.state as string),
  proposal: l => str(l.conversationId) && obj(l.proposal) && (l.assets === undefined || Array.isArray(l.assets)),
  question: l => str(l.conversationId) && str(l.question) && Array.isArray(l.options),
  message: l => str(l.message),
  decline: l => str(l.message),
  error: l => str(l.message),
};

/** Parse one NDJSON line; blank, malformed or unknown lines give null. */
export function parseLine(text: string): StreamLine | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const line: unknown = JSON.parse(trimmed);
    if (!obj(line)) return null;
    const check = valid[(line as { type: StreamLine['type'] }).type];
    return check?.(line as Record<string, unknown>) ? line as StreamLine : null;
  } catch { return null; }
}

/** Read the designer's NDJSON body, calling `onLine` for every usable line. Never throws on bad lines. */
export async function readLines(body: ReadableStream<Uint8Array>, onLine: (line: StreamLine) => void, signal?: AbortSignal): Promise<void> {
  const reader = body.getReader(), decoder = new TextDecoder();
  const stop = () => { reader.cancel().catch(() => {}); };
  if (signal?.aborted) return stop();
  signal?.addEventListener('abort', stop, { once: true });
  let buffer = '', skipping = false;
  const emit = (text: string) => { if (text.length > MAX_LINE) return; const line = parseLine(text); if (line && !signal?.aborted) onLine(line); };
  try {
    for (;;) {
      const { done, value } = await reader.read().catch(error => { if (signal?.aborted) return { done: true, value: undefined }; throw error; });
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        if (!skipping) emit(buffer.slice(0, newline));
        skipping = false;
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > MAX_LINE) { buffer = ''; skipping = true; }
      if (done || signal?.aborted) break;
    }
    if (!skipping && !signal?.aborted) emit(buffer);
  } finally { signal?.removeEventListener('abort', stop); }
}
