/**
 * Experimental tab (`/?view=experimental`): furnished flats prepared for pitching to a developer. Each card shows
 * the developer's plan on the left and the furnished 3D apartment built from it on the right, like the Catalog
 * tab, and opens in Design through the Catalog's own launch (`catalog-launch.ts`). The flats come from
 * `server/experimental.mjs` in the plan-bundle shape, so nothing in the Catalog or its contract changes.
 */
import { icon } from '../ui/icons';
import { traceInk, type BlueprintInk } from './blueprint-ink';
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import { isRecord } from '../core/validation';
import type { Bundle, BundleSummary } from './bundles-contract';
import { BundleError, bedroomLabel, checkBundleSummary } from './bundles';
import { escapeHtml, mountPortalShell } from './portal-header';
import type { FurnishedPreview } from './preview';
import './catalog.css';

const enc = encodeURIComponent;
export const EXPERIMENTAL_API = {
  /** GET → {bundles: BundleSummary[]} */
  flats: '/api/experimental/flats',
  /** GET → {bundle: Bundle} */
  flat: (id: string) => `/api/experimental/flats/${enc(id)}`,
} as const;
export const experimentalHref = '/?view=experimental';
/** Opens an experimental flat in the editor's Design phase. */
export const experimentalFlatHref = (id: string) => `/?experimental=${enc(id)}`;

async function read(path: string, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  let response: Response;
  try { response = await fetcher(path, { credentials: 'same-origin', signal: AbortSignal.timeout(30000) }); }
  catch { throw new BundleError('Could not reach the experimental flats. Check your connection and try again.', 0, 'network'); }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new BundleError('The experimental flats are unavailable right now. Please try again.', response.status, 'unavailable'); }
  if (!isRecord(body)) throw new BundleError('The experimental flats returned an unexpected response.', response.status, 'invalid');
  if (!response.ok) throw new BundleError(typeof body.error === 'string' ? body.error : 'Could not load the experimental flats.', response.status, String(body.code ?? 'request_failed'));
  return body;
}

export const experimentalApi = {
  async flats(fetcher?: typeof fetch): Promise<BundleSummary[]> {
    const body = await read(EXPERIMENTAL_API.flats, fetcher);
    return Array.isArray(body.bundles) ? body.bundles.map(checkBundleSummary).filter((item): item is BundleSummary => item !== null) : [];
  },
  async flat(id: string, fetcher?: typeof fetch): Promise<Bundle> {
    const body = await read(EXPERIMENTAL_API.flat(id), fetcher);
    const summary = checkBundleSummary(body.bundle);
    if (!summary || !isRecord(body.bundle) || !isRecord(body.bundle.scene) || !Array.isArray(body.bundle.catalog))
      throw new BundleError('This flat could not be read. Choose another one from the Experimental tab.', 200, 'invalid');
    return { ...summary, scene: body.bundle.scene as unknown as SceneDocument, catalog: body.bundle.catalog as CatalogProduct[] };
  },
};

/** `/?experimental=<id>`: straight into Design, as `/?bundle=<id>` does for the Catalog. */
/** Developers' own sites: no Varpet profile exists for these developers, so the plan credit links there. */
const DEVELOPER_SITES: Record<string, string> = { 'komitas-park': 'https://komitaspark.am' };

export async function launchExperimental(host: HTMLElement, id: string, options: { summary?: BundleSummary; from?: DOMRect; frame?: HTMLCanvasElement; bundle?: Promise<Bundle>; beforeEditor?(): void } = {}): Promise<boolean> {
  const { launchBundle } = await import('./catalog-launch');
  const bundle = options.bundle ?? experimentalApi.flat(id);
  const site = await bundle.then(b => DEVELOPER_SITES[b.developerSlug], () => undefined);
  return launchBundle(host, id, { ...options, bundle, presentation: { furnishedBy: 'varpet', ...(site ? { developerHref: site } : {}) } });
}

const mounts = new WeakMap<HTMLElement, () => void>();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const formatArea = (area: number) => `${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;

/* ---- Plan ink, drawn as on the Catalog's cards ---- */

async function planInk(url: string): Promise<BlueprintInk> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  const fit = Math.min(1, 520 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * fit)), height = Math.max(1, Math.round(image.naturalHeight * fit));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  return traceInk(context.getImageData(0, 0, width, height).data, width, height);
}

function drawInk(canvas: HTMLCanvasElement, ink: BlueprintInk, duration: number, isAlive: () => boolean): Promise<void> {
  canvas.width = ink.width; canvas.height = ink.height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(ink.width, ink.height);
  const paint = (from: number, to: number) => {
    for (let n = from; n < to; n++) {
      const i = ink.sequence[n]!, k = i * 4;
      image.data[k] = 236; image.data[k + 1] = 247; image.data[k + 2] = 245; image.data[k + 3] = ink.alpha[i]!;
    }
  };
  if (!duration) { paint(0, ink.sequence.length); context.putImageData(image, 0, 0); return Promise.resolve(); }
  return new Promise(resolve => {
    let start = 0, done = 0;
    const step = (now: number) => {
      if (!isAlive()) { resolve(); return; }
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      const next = Math.round(ink.sequence.length * (1 - Math.pow(1 - t, 2)));
      paint(done, next); done = next; context.putImageData(image, 0, 0);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/* ---- Page ---- */

export async function mountExperimental(host: HTMLElement): Promise<void> {
  mounts.get(host)?.();
  const cardDisposers: Array<() => void> = [];
  let disposed = false;
  const flatRequests = new Map<string, Promise<Bundle>>();
  const loadFlat = (id: string) => {
    let request = flatRequests.get(id);
    if (!request) {
      request = experimentalApi.flat(id);
      flatRequests.set(id, request);
      request.catch(() => { if (flatRequests.get(id) === request) flatRequests.delete(id); });
    }
    return request;
  };
  const shell = mountPortalShell(host, 'experimental', { className: 'catalog-page experimental-page' });
  const dispose = () => {
    disposed = true;
    cardDisposers.splice(0).forEach(cleanup => cleanup());
    shell.dispose();
    window.removeEventListener('pagehide', onPageHide);
  };
  const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
  mounts.set(host, dispose);
  window.addEventListener('pagehide', onPageHide);

  const main = shell.main;
  main.innerHTML = `
    <section class="catalog-hero">
      <p class="portal-eyebrow"><span></span>Experimental · prepared for developer pitches</p>
      <h1>Their plans, <em>already furnished.</em></h1>
      <p class="catalog-intro">Developers’ own floor plans, traced wall for wall and furnished with catalog pieces where their drawing places furniture. Open one to walk through it and change it with the designer.</p>
    </section>
    <p class="portal-result-count" role="status" aria-live="polite"></p>
    <div class="catalog-shelves" aria-busy="true"><div class="bundle-grid"><div class="bundle-card bundle-skeleton" aria-hidden="true"><div class="bundle-stage"><div class="bundle-pane"></div><div class="bundle-pane"></div></div><div class="bundle-body"><span></span><span></span></div></div></div></div>`;
  const shelves = main.querySelector<HTMLElement>('.catalog-shelves')!;
  const resultCount = main.querySelector<HTMLElement>('.portal-result-count')!;

  function cardMarkup(flat: BundleSummary): string {
    const title = escapeHtml(flat.name);
    const href = experimentalFlatHref(flat.id);
    return `<article class="bundle-card" data-flat-id="${escapeHtml(flat.id)}">
      <a class="bundle-stage" href="${href}" tabindex="-1" aria-hidden="true">
        <div class="bundle-pane bundle-plan"><canvas class="bundle-ink" aria-hidden="true"></canvas><span class="bundle-pane-label">Plan</span></div>
        <div class="bundle-pane bundle-model"><div class="bundle-model-host"></div><span class="bundle-pane-label">Furnished 3D</span></div>
        <span class="bundle-seam" aria-hidden="true">${icon('arrow')}</span>
        <span class="bundle-sweep" aria-hidden="true"></span>
      </a>
      <div class="bundle-body">
        <div class="bundle-titles"><p class="portal-kicker">${escapeHtml(flat.building ?? flat.developerName)}</p><h3>${title}</h3></div>
        <div class="portal-card-facts"><span>${icon('home')}${bedroomLabel(flat.bedrooms)}</span><span>${icon('room')}${formatArea(flat.area)}</span><span>${icon('sofa')}${flat.furnishedPieces} pieces</span></div>
        <a class="portal-card-link bundle-open" href="${href}" aria-label="Open ${title} by ${escapeHtml(flat.developerName)} in Design">Open in Design${icon('arrow')}</a>
      </div>
    </article>`;
  }

  function mountCard(card: HTMLElement, flat: BundleSummary): () => void {
    let alive = true, near = false, revealed = false, preview: FurnishedPreview | undefined, previewing: Promise<void> | undefined;
    const modelHost = card.querySelector<HTMLElement>('.bundle-model-host')!;
    const ink = card.querySelector<HTMLCanvasElement>('.bundle-ink')!;
    const stage = card.querySelector<HTMLAnchorElement>('.bundle-stage')!;
    const cleanups: Array<() => void> = [];

    const startPreview = () => previewing ??= (async () => {
      try {
        const [full, module] = await Promise.all([loadFlat(flat.id), import('./preview')]);
        if (!alive) return;
        preview = module.mountFurnishedPreview(modelHost, full.scene, full.catalog.map(product => product.asset), { rise: !reducedMotion() });
        preview.setVisible(near && revealed);
        await preview.ready;
        if (alive) card.classList.add('has-model');
      } catch {
        if (!alive) return;
        modelHost.innerHTML = `<div class="portal-preview-fallback">${icon('cube')}<span>Open this flat to explore its 3D model.</span></div>`;
        card.classList.add('has-model');
      }
    })();

    const nearObserver = new IntersectionObserver(([entry]) => {
      near = Boolean(entry?.isIntersecting);
      if (near) void startPreview();
      preview?.setVisible(near && revealed);
    }, { rootMargin: '400px 0px' });
    nearObserver.observe(card);
    cleanups.push(() => nearObserver.disconnect());

    const revealObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || revealed) return;
      revealed = true; revealObserver.disconnect();
      const still = reducedMotion();
      card.classList.add('is-revealed');
      void planInk(flat.blueprintUrl).then(traced => {
        if (!alive) return;
        card.classList.add('has-plan');
        return drawInk(ink, traced, still ? 0 : 1100, () => alive);
      }).catch(() => { if (alive) card.classList.add('has-plan', 'plan-missing'); });
      const handOver = () => { if (!alive) return; card.classList.add('is-swept'); preview?.setVisible(near); };
      void startPreview().then(() => { if (still) handOver(); else setTimeout(handOver, 650); });
    }, { threshold: 0.2 });
    revealObserver.observe(card);
    cleanups.push(() => revealObserver.disconnect());

    const activate = (active: boolean) => { card.classList.toggle('is-active', active); preview?.setActive(active); };
    card.addEventListener('pointerenter', () => activate(true));
    card.addEventListener('pointerleave', () => { if (!card.contains(document.activeElement)) activate(false); });
    card.addEventListener('focusin', () => activate(true));
    card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget as Node)) activate(false); });

    const open = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void launch(flat, stage, preview?.canvas);
    };
    card.querySelectorAll<HTMLAnchorElement>('a[href^="/?experimental="]').forEach(link => link.addEventListener('click', open));
    cleanups.push(() => { alive = false; preview?.dispose(); });
    return () => cleanups.splice(0).forEach(cleanup => cleanup());
  }

  let launching = false;
  async function launch(flat: BundleSummary, stage: HTMLElement, frame?: HTMLCanvasElement): Promise<void> {
    if (launching) return;
    launching = true;
    history.pushState(null, '', experimentalFlatHref(flat.id));
    // The editor replaces this page in the same document; Back returns to the tab by loading it again.
    const back = () => location.reload();
    window.addEventListener('popstate', back, { once: true });
    const opened = await launchExperimental(host, flat.id, {
      summary: flat, from: stage.getBoundingClientRect(), frame, bundle: loadFlat(flat.id),
      beforeEditor: () => { dispose(); host.classList.remove('portal-host'); },
    });
    if (!opened && !disposed) { launching = false; window.removeEventListener('popstate', back); history.replaceState(null, '', experimentalHref); }
  }

  async function load(): Promise<void> {
    shelves.setAttribute('aria-busy', 'true');
    try {
      const flats = await experimentalApi.flats();
      if (disposed) return;
      shelves.setAttribute('aria-busy', 'false');
      resultCount.textContent = `${flats.length} flat${flats.length === 1 ? '' : 's'}`;
      if (!flats.length) {
        shelves.innerHTML = `<div class="portal-filter-empty">${icon('room')}<h3>No experimental flats yet</h3><p>Build one with apartments/_svg/build.py and list it in server/experimental.mjs.</p></div>`;
        return;
      }
      shelves.innerHTML = `<section class="developer-shelf"><div class="bundle-grid">${flats.map(cardMarkup).join('')}</div></section>`;
      const byId = new Map(flats.map(flat => [flat.id, flat]));
      shelves.querySelectorAll<HTMLElement>('.bundle-card').forEach(card => cardDisposers.push(mountCard(card, byId.get(card.dataset.flatId!)!)));
    } catch (cause) {
      if (disposed) return;
      shelves.setAttribute('aria-busy', 'false');
      shelves.innerHTML = `<section class="portal-empty portal-load-error"><span class="portal-empty-icon">${icon('folder')}</span><h2>We couldn't load the experimental flats.</h2><p class="portal-profile-error" role="alert"></p><button class="portal-button" type="button" data-retry>Try again</button></section>`;
      shelves.querySelector('.portal-profile-error')!.textContent = cause instanceof Error ? cause.message : 'Check your connection and try again.';
      shelves.querySelector('[data-retry]')!.addEventListener('click', () => { void load(); });
    }
  }

  await Promise.all([load(), shell.account.reload()]);
}
