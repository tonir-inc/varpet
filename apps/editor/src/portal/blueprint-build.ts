import { blueprintTransportFiles } from './blueprint-evidence';

type Update = { type: 'progress'; message: string } | { type: 'event'; event: Record<string, unknown> };
type Result = { ok: true; project: unknown } | { ok: false; error: unknown };

/** One upload's request, independent of whether the construction view is mounted yet. */
export function startBlueprintBuild(plan: File, photos: File[], onSettled: () => void) {
  const input = { plan, photos: [...photos] };
  const controller = new AbortController();
  const pending: Update[] = [];
  let listener: ((update: Update) => void) | undefined;
  let status: 'reading' | 'ready' | 'failed' = 'reading';
  const started = performance.now();
  const publish = (update: Update) => {
    if (controller.signal.aborted) return;
    if (listener) listener(update);
    else pending.push(update);
  };
  // Catch immediately: a failed speculative request may finish before anyone presses Submit.
  const result: Promise<Result> = (async () => {
    const { buildFurnishedFlat } = await import('../adapters/architect-http');
    controller.signal.throwIfAborted();
    return buildFurnishedFlat({ ...blueprintTransportFiles(input.plan, input.photos),
      name: plan.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My apartment',
    }, message => publish({ type: 'progress', message }), {
      signal: controller.signal,
      onEvent: event => {
        // Activity logs have no construction projection; avoid retaining the entire agent log.
        if (event.type !== 'activity') publish({ type: 'event', event });
      },
    });
  })().then(project => {
    status = 'ready';
    return { ok: true, project } as const;
  }, error => {
    status = 'failed';
    return { ok: false, error } as const;
  });
  void result.then(() => { if (!controller.signal.aborted) onSettled(); });
  return {
    ...input, started, result,
    get status() { return status; },
    get signal() { return controller.signal; },
    /** Drain the early events in wire order, then follow the same live request. */
    attach(onProgress: (message: string) => void, onEvent: (event: Record<string, unknown>) => void) {
      if (controller.signal.aborted) return;
      listener = update => update.type === 'progress' ? onProgress(update.message) : onEvent(update.event);
      for (const update of pending.splice(0)) listener(update);
    },
    cancel() {
      controller.abort(); listener = undefined; pending.length = 0;
    },
  };
}
