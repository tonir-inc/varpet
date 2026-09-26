import { createArchitectStage, type StageEvent } from './architect-stage';

// Dev replay: plays public/architect-replay/n3.json on its own "t" timestamps. ?speed=2 plays faster.
const base = '/architect-replay/';
const params = new URLSearchParams(location.search);
const speed = Math.max(0.05, Number(params.get('speed')) || 1);
const host = document.getElementById('stage')!;
const clock = document.getElementById('replay-clock')!;
const phaseEl = document.getElementById('replay-phase')!;
const messageEl = document.getElementById('replay-message')!;
const again = document.getElementById('replay-again')!;
again.addEventListener('click', () => location.reload());

const photos = ['01', '02', '03', '05', '06', '07', '08'].map(n => `${base}photo-${n}.jpg`);
const events = (await (await fetch(`${base}n3.json`)).json()) as (StageEvent & { t: number })[];
const stage = createArchitectStage(host, { onPhase: phase => { phaseEl.textContent = phase; } });
stage.start(`${base}plan.jpg`, photos);

const t0 = performance.now();
const end = events.reduce((m, e) => Math.max(m, e.t), 0);
const tick = setInterval(() => { clock.textContent = `${((performance.now() - t0) / 1000 * speed).toFixed(1)} / ${end.toFixed(1)} s · ${speed}x`; }, 200);

for (const e of events) {
  const due = t0 + (e.t / speed) * 1000;
  setTimeout(async () => {
    if (e.type === 'progress') { stage.progress(e.message); messageEl.textContent = e.message; }
    else stage.event(e);
    if (e.type === 'project') {
      await stage.finish();
      clearInterval(tick);
      clock.textContent = 'Hand-off done';
      again.hidden = false;
    }
  }, Math.max(0, due - performance.now()));
}
