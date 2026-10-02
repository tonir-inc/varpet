/**
 * Catalog tab (`/?view=catalog`): developers' floor plans, each paired with the furnished 3D apartment built
 * from it. One shelf per developer; every card shows the plan on the left and the live model on the right.
 * Opening a card hands the model over to the editor's Design phase (`catalog-launch.ts`).
 */
import { icon } from '../ui/icons';
import { traceInk, type BlueprintInk } from './blueprint-ink';
import { bundleHref, catalogHref, demoHref, developerHref, type Bundle, type BundleSummary, type DeveloperSummary } from './bundles-contract';
import { BEDROOM_FILTERS, bedroomLabel, bundlesApi, groupByDeveloper, initials, matchesFilter, type BundleFilter } from './bundles';
import { escapeHtml, mountPortalShell } from './portal-header';
import type { FurnishedPreview } from './preview';
import './catalog.css';

const mounts = new WeakMap<HTMLElement, () => void>();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const formatArea = (area: number) => `${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;

/** Full bundles are fetched once per page: the card's preview and the editor hand-off share the request. */
const bundleRequests = new Map<string, Promise<Bundle>>();
export function loadBundle(id: string): Promise<Bundle> {
  let request = bundleRequests.get(id);
  if (!request) {
    request = bundlesApi.bundle(id);
    bundleRequests.set(id, request);
    request.catch(() => { if (bundleRequests.get(id) === request) bundleRequests.delete(id); });
  }
  return request;
}

export function readFilter(search: URLSearchParams): BundleFilter {
  const bedrooms = search.get('bedrooms');
  const value = bedrooms === null || bedrooms === '' ? null : Number(bedrooms);
  return {
    bedrooms: value !== null && Number.isInteger(value) && value >= 0 && value <= 3 ? value : null,
    developer: search.get('developer') || null,
  };
}

function filterUrl(filter: BundleFilter): string {
  const search = new URLSearchParams({ view: 'catalog' });
  if (filter.bedrooms !== null) search.set('bedrooms', String(filter.bedrooms));
  if (filter.developer) search.set('developer', filter.developer);
  return `/?${search}`;
}

/* ---- Plan ink: the developer's drawing redrawn as light linework on blueprint paper ---- */

const inkRequests = new Map<string, Promise<BlueprintInk>>();
function planInk(url: string): Promise<BlueprintInk> {
  let request = inkRequests.get(url);
  if (!request) {
    request = (async () => {
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
    })();
    inkRequests.set(url, request);
    request.catch(() => inkRequests.delete(url));
  }
  return request;
}

/** Draw `ink` into `canvas`, following the pen order over `duration` ms (0 draws it at once). */
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
      // Ease out: the pen slows as it finishes the last walls.
      const next = Math.round(ink.sequence.length * (1 - Math.pow(1 - t, 2)));
      paint(done, next); done = next; context.putImageData(image, 0, 0);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/* ---- Page ---- */

export async function mountCatalog(host: HTMLElement): Promise<void> {
  mounts.get(host)?.();
  const disposers: Array<() => void> = [];
  let cardDisposers: Array<() => void> = [];
  let disposed = false;
  const dispose = () => {
    disposed = true;
    cardDisposers.splice(0).forEach(cleanup => cleanup());
    disposers.splice(0).forEach(cleanup => cleanup());
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
  const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted && !disposed) void shell.account.reload(); };
  mounts.set(host, dispose);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  const shell = mountPortalShell(host, 'catalog', { className: 'catalog-page' });
  disposers.push(shell.dispose);
  const main = shell.main;
  let filter = readFilter(new URLSearchParams(location.search));
  let bundles: BundleSummary[] = [];
  let developers: DeveloperSummary[] = [];

  main.innerHTML = `
    <section class="catalog-hero">
      <p class="portal-eyebrow"><span></span>Plans from the people who build them</p>
      <h1>Every plan, <em>already furnished.</em></h1>
      <p class="catalog-intro">Browse developers’ floor plans next to the furnished 3D apartment built from each one. Open any of them and change it with your designer.</p>
    </section>
    <div class="catalog-toolbar" role="group" aria-label="Filter plans">
      <div class="catalog-filter-row"><span class="catalog-filter-label" id="catalog-bedrooms-label">Bedrooms</span><div class="portal-filters" role="group" aria-labelledby="catalog-bedrooms-label" data-filter="bedrooms"></div></div>
      <div class="catalog-filter-row" data-developer-row hidden><span class="catalog-filter-label" id="catalog-developer-label">Developer</span><div class="portal-filters" role="group" aria-labelledby="catalog-developer-label" data-filter="developer"></div></div>
      <p class="portal-result-count" role="status" aria-live="polite"></p>
    </div>
    <div class="catalog-shelves" aria-busy="true">${skeleton()}</div>`;
  const shelves = main.querySelector<HTMLElement>('.catalog-shelves')!;
  const resultCount = main.querySelector<HTMLElement>('.portal-result-count')!;

  function skeleton(): string {
    const card = '<div class="bundle-card bundle-skeleton" aria-hidden="true"><div class="bundle-stage"><div class="bundle-pane"></div><div class="bundle-pane"></div></div><div class="bundle-body"><span></span><span></span></div></div>';
    return `<section class="developer-shelf" aria-label="Loading plans"><div class="developer-shelf-head bundle-skeleton-head" aria-hidden="true"><span class="developer-mark"></span><span></span></div><div class="bundle-grid">${card}${card}</div></section>`;
  }

  function renderFilters(): void {
    const bedroomGroup = main.querySelector<HTMLElement>('[data-filter="bedrooms"]')!;
    bedroomGroup.innerHTML = BEDROOM_FILTERS.map(option => `<button type="button" data-bedrooms="${option.value ?? ''}" aria-pressed="${filter.bedrooms === option.value}">${option.label}</button>`).join('');
    const seen = groupByDeveloper(bundles, developers).map(shelf => shelf.developer);
    const developerRow = main.querySelector<HTMLElement>('[data-developer-row]')!;
    developerRow.hidden = seen.length < 2;
    main.querySelector<HTMLElement>('[data-filter="developer"]')!.innerHTML = [`<button type="button" data-developer="" aria-pressed="${!filter.developer}">All developers</button>`,
      ...seen.map(developer => `<button type="button" data-developer="${escapeHtml(developer.slug)}" aria-pressed="${filter.developer === developer.slug}">${escapeHtml(developer.name)}</button>`)].join('');
  }

  main.querySelector('.catalog-toolbar')!.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-bedrooms], button[data-developer]');
    if (!button) return;
    if (button.dataset.bedrooms !== undefined) filter = { ...filter, bedrooms: button.dataset.bedrooms === '' ? null : Number(button.dataset.bedrooms) };
    else filter = { ...filter, developer: button.dataset.developer || null };
    history.replaceState(null, '', filterUrl(filter));
    renderFilters(); renderShelves();
    main.querySelector<HTMLButtonElement>(`button[aria-pressed="true"][data-${button.dataset.bedrooms !== undefined ? 'bedrooms' : 'developer'}]`)?.focus();
  });

  function renderShelves(): void {
    cardDisposers.splice(0).forEach(cleanup => cleanup());
    const visible = bundles.filter(bundle => matchesFilter(bundle, filter));
    const grouped = groupByDeveloper(visible, developers);
    shelves.setAttribute('aria-busy', 'false');
    resultCount.textContent = `${visible.length} plan${visible.length === 1 ? '' : 's'} from ${grouped.length} developer${grouped.length === 1 ? '' : 's'}`;
    if (!visible.length) {
      shelves.innerHTML = `<div class="portal-filter-empty">${icon('room')}<h3>${bundles.length ? 'No plans match these filters' : 'No plans published yet'}</h3><p>${bundles.length ? 'Try another number of bedrooms, or show every developer.' : 'Developers publish their plans from their studio. Check back soon.'}</p>${bundles.length ? '<button type="button" class="portal-button" data-clear>Show all plans</button>' : ''}</div>`;
      shelves.querySelector('[data-clear]')?.addEventListener('click', () => {
        filter = { bedrooms: null, developer: null };
        history.replaceState(null, '', catalogHref); renderFilters(); renderShelves();
      });
      return;
    }
    shelves.innerHTML = grouped.map((shelf, index) => shelfMarkup(shelf.developer, shelf.bundles, index)).join('');
    const byId = new Map(visible.map(bundle => [bundle.id, bundle]));
    shelves.querySelectorAll<HTMLElement>('.bundle-card').forEach(card => cardDisposers.push(mountCard(card, byId.get(card.dataset.bundleId!)!)));
    const shelfObserver = observeReveal(shelves.querySelectorAll('.developer-shelf-head'));
    cardDisposers.push(() => shelfObserver.disconnect());
  }

  function shelfMarkup(developer: DeveloperSummary, items: BundleSummary[], index: number): string {
    const mark = developer.logoUrl
      ? `<img class="developer-mark" src="${escapeHtml(developer.logoUrl)}" alt="" loading="lazy">`
      : `<span class="developer-mark" aria-hidden="true">${escapeHtml(initials(developer.name))}</span>`;
    const where = [developer.city, developer.tagline].filter(Boolean).map(escapeHtml).join(' · ');
    const headingId = `developer-shelf-${index}`;
    return `<section class="developer-shelf" aria-labelledby="${headingId}">
      <header class="developer-shelf-head">${mark}<div class="developer-shelf-title"><h2 id="${headingId}">${escapeHtml(developer.name)}</h2>${where ? `<p>${where}</p>` : ''}</div>
        <span class="developer-shelf-count">${items.length} plan${items.length === 1 ? '' : 's'}</span>
        <a class="portal-card-link developer-profile-link" href="${developerHref(developer.slug)}">Developer profile${icon('arrow')}</a></header>
      <div class="bundle-grid">${items.map(cardMarkup).join('')}</div>
    </section>`;
  }

  function cardMarkup(bundle: BundleSummary): string {
    const title = escapeHtml(bundle.name);
    return `<article class="bundle-card" data-bundle-id="${escapeHtml(bundle.id)}">
      <a class="bundle-stage" href="${bundleHref(bundle.id)}" tabindex="-1" aria-hidden="true">
        <div class="bundle-pane bundle-plan"><canvas class="bundle-ink" aria-hidden="true"></canvas><span class="bundle-pane-label">Plan</span></div>
        <div class="bundle-pane bundle-model"><div class="bundle-model-host"></div><span class="bundle-pane-label">Furnished 3D</span></div>
        <span class="bundle-seam" aria-hidden="true">${icon('arrow')}</span>
        <span class="bundle-sweep" aria-hidden="true"></span>
      </a>
      <div class="bundle-body">
        <div class="bundle-titles"><p class="portal-kicker">${escapeHtml(bundle.building ?? bundle.developerName)}</p><h3>${title}</h3></div>
        <div class="portal-card-facts"><span>${icon('home')}${bedroomLabel(bundle.bedrooms)}</span><span>${icon('room')}${formatArea(bundle.area)}</span><span>${icon('sofa')}${bundle.furnishedPieces} pieces</span></div>
        <a class="portal-card-link bundle-open" href="${bundleHref(bundle.id)}" aria-label="Open ${title} by ${escapeHtml(bundle.developerName)} in Design">Open in Design${icon('arrow')}</a>
      </div>
    </article>`;
  }

  /** Scroll reveal for elements that only need a class. */
  function observeReveal(elements: NodeListOf<Element>): IntersectionObserver {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); observer.unobserve(entry.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    elements.forEach(element => observer.observe(element));
    return observer;
  }

  function mountCard(card: HTMLElement, bundle: BundleSummary): () => void {
    let alive = true, revealed = false, near = false, preview: FurnishedPreview | undefined, previewing: Promise<void> | undefined;
    const modelHost = card.querySelector<HTMLElement>('.bundle-model-host')!;
    const ink = card.querySelector<HTMLCanvasElement>('.bundle-ink')!;
    const stage = card.querySelector<HTMLAnchorElement>('.bundle-stage')!;
    const cleanups: Array<() => void> = [];

    function startPreview(): Promise<void> {
      previewing ??= (async () => {
        try {
          const [full, module] = await Promise.all([loadBundle(bundle.id), import('./preview')]);
          if (!alive) return;
          preview = module.mountFurnishedPreview(modelHost, full.scene, full.catalog.map(product => product.asset), { rise: !reducedMotion() });
          preview.setVisible(near && revealed);
          await preview.ready;
          if (alive) card.classList.add('has-model');
        } catch {
          if (!alive) return;
          modelHost.innerHTML = `<div class="portal-preview-fallback">${icon('cube')}<span>Open this plan to explore its 3D model.</span></div>`;
          card.classList.add('has-model');
        }
      })();
      return previewing;
    }

    // Near the viewport: fetch the plan and the scene so the card is ready by the time it is seen.
    const nearObserver = new IntersectionObserver(([entry]) => {
      near = Boolean(entry?.isIntersecting);
      if (near) void startPreview();
      preview?.setVisible(near && revealed);
    }, { rootMargin: '400px 0px' });
    nearObserver.observe(card);
    cleanups.push(() => nearObserver.disconnect());

    // In view: the plan draws itself, a sweep carries it across the seam and the model rises out of it.
    const revealObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || revealed) return;
      revealed = true; revealObserver.disconnect();
      const still = reducedMotion();
      card.classList.add('is-revealed');
      void planInk(bundle.blueprintUrl).then(traced => {
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
    const enter = () => activate(true), leave = () => { if (!card.contains(document.activeElement)) activate(false); };
    card.addEventListener('pointerenter', enter); card.addEventListener('pointerleave', leave);
    card.addEventListener('focusin', enter); card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget as Node)) activate(false); });

    const open = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void launch(bundle, stage, preview?.canvas);
    };
    card.querySelectorAll<HTMLAnchorElement>('a[href^="/?bundle="]').forEach(link => link.addEventListener('click', open));
    cleanups.push(() => { alive = false; preview?.dispose(); });
    return () => cleanups.splice(0).forEach(cleanup => cleanup());
  }

  let launching = false;
  async function launch(bundle: BundleSummary, stage: HTMLElement, frame?: HTMLCanvasElement): Promise<void> {
    if (launching) return;
    const demo = demoHref(bundle.id);
    if (demo) { location.assign(demo); return; }
    launching = true;
    const { launchBundle } = await import('./catalog-launch');
    history.pushState(null, '', bundleHref(bundle.id));
    // The editor replaces this page in the same document; Back returns to the catalog by loading it again.
    const back = () => location.reload();
    window.addEventListener('popstate', back, { once: true });
    const opened = await launchBundle(host, bundle.id, {
      summary: bundle, from: stage.getBoundingClientRect(), frame, bundle: loadBundle(bundle.id),
      beforeEditor: () => { dispose(); host.classList.remove('portal-host'); },
    });
    if (!opened && !disposed) { launching = false; window.removeEventListener('popstate', back); history.replaceState(null, '', filterUrl(filter)); }
  }

  async function load(): Promise<void> {
    shelves.setAttribute('aria-busy', 'true');
    try {
      const [bundleList, developerList] = await Promise.all([
        bundlesApi.bundles(),
        bundlesApi.developers().catch(() => [] as DeveloperSummary[]),
      ]);
      if (disposed) return;
      bundles = bundleList; developers = developerList;
      if (filter.developer && !bundles.some(bundle => bundle.developerSlug === filter.developer)) filter = { ...filter, developer: null };
      renderFilters(); renderShelves();
    } catch (cause) {
      if (disposed) return;
      shelves.setAttribute('aria-busy', 'false');
      shelves.innerHTML = `<section class="portal-empty portal-load-error"><span class="portal-empty-icon">${icon('folder')}</span><h2>We couldn't load the catalog.</h2><p class="portal-profile-error" role="alert"></p><button class="portal-button" type="button" data-catalog-retry>Try again</button></section>`;
      shelves.querySelector('.portal-profile-error')!.textContent = cause instanceof Error ? cause.message : 'Check your connection and try again.';
      shelves.querySelector('[data-catalog-retry]')!.addEventListener('click', () => { shelves.innerHTML = skeleton(); void load(); });
    }
  }

  renderFilters();
  await Promise.all([load(), shell.account.reload()]);
}
