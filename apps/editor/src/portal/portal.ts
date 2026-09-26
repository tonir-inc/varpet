import { api, type ApartmentSummary, type User } from './api';
import { apartmentTemplates, getTemplate, mountPlanPreview, type ApartmentTemplate } from './templates';
import { showAuth } from './auth';
import { icon } from '../ui/icons';
import './portal.css';

type PortalView = 'explore' | 'apartments';
const mounts = new WeakMap<HTMLElement, () => void>();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function bedroomLabel(bedrooms: number): string {
  return bedrooms === 0 ? 'Studio' : `${bedrooms} bedroom${bedrooms === 1 ? '' : 's'}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Saved in your account' : `Saved ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)}`;
}

function templateFacts(template: ApartmentTemplate): string {
  return `<span>${icon('room')}${template.area} m²</span><span>${icon('home')}${bedroomLabel(template.bedrooms)}</span>`;
}

/** Welcome and account pages share navigation, but never fabricate saved projects. */
export async function mountPortal(host: HTMLElement, view: PortalView): Promise<void> {
  mounts.get(host)?.();
  const disposers: Array<() => void> = [];
  let cardDisposers: Array<() => void> = [];
  let disposed = false;
  let currentUser: User | null = null;
  let requestVersion = 0;
  const dispose = () => {
    disposed = true;
    disposers.splice(0).forEach((cleanup) => cleanup());
    cardDisposers.splice(0).forEach((cleanup) => cleanup());
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
  // A bfcache entry resumes this same document; keep its previews and listeners alive.
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted && !disposed) void loadAccount();
  };
  mounts.set(host, dispose);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  host.classList.add('portal-host');
  host.innerHTML = `
    <div class="portal">
      <header class="portal-header"><div class="portal-header-inner">
        <a class="portal-brand" href="/" aria-label="Varpet home"><span class="portal-brand-mark" aria-hidden="true">v</span>varpet</a>
        <nav class="portal-nav" aria-label="Main navigation"><a href="/" ${view === 'explore' ? 'aria-current="page"' : ''}>Explore apartments</a><a href="/?view=apartments" ${view === 'apartments' ? 'aria-current="page"' : ''}>My apartments</a></nav>
        <div class="portal-account"><span class="portal-account-loading" role="status">Checking account…</span></div>
      </div></header>
      <div class="portal-notice" role="status" hidden></div>
      <main class="portal-main" id="portal-main"></main>
      <footer class="portal-footer"><a class="portal-brand" href="/" aria-label="Varpet home"><span class="portal-brand-mark" aria-hidden="true">v</span>varpet</a><p>A little planning. A place that feels like you.</p><span>Made for living.</span></footer>
    </div>`;

  const main = host.querySelector<HTMLElement>('.portal-main')!;
  const account = host.querySelector<HTMLElement>('.portal-account')!;
  const notice = host.querySelector<HTMLElement>('.portal-notice')!;

  function preview(element: HTMLElement, template: ApartmentTemplate, target: Array<() => void> = disposers): void {
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', `3D preview of ${template.name}`);
    try {
      target.push(mountPlanPreview(element, template.scene));
    } catch {
      element.innerHTML = `<div class="portal-preview-fallback">${icon('home')}<span>Open this apartment to explore its layout.</span></div>`;
    }
  }

  function showPlan(template: ApartmentTemplate): void {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'portal-dialog plan-dialog';
    dialog.setAttribute('aria-labelledby', 'plan-dialog-title');
    dialog.innerHTML = `
      <div class="plan-dialog-heading"><span class="portal-eyebrow">Sample developer collection</span><button class="portal-icon-button" aria-label="Close apartment preview" type="button">${icon('close')}</button></div>
      <div class="plan-dialog-layout"><div class="plan-dialog-stage"><div class="portal-preview plan-detail-preview"></div><span class="portal-preview-caption">${icon('cube')}3D floor plan</span></div>
      <div class="plan-dialog-details"><p class="portal-kicker">${escapeHtml(template.developer)}</p><h2 id="plan-dialog-title">${escapeHtml(template.name)}</h2><p class="portal-location">${escapeHtml(template.location)}</p>
      <div class="plan-facts">${templateFacts(template)}</div><p class="plan-description">${escapeHtml(template.description)}</p>
      <div class="plan-options"><div><h3>Make it yours</h3><span class="portal-small-label">Coming soon</span></div><p>More options from the developer, all in one place.</p><div class="plan-option-buttons"><button type="button" disabled>${icon('layers')}Choose a floor</button><button type="button" disabled>${icon('sun')}View orientation</button></div></div>
      <a class="portal-button portal-primary" href="/?template=${encodeURIComponent(template.id)}">Start with this plan${icon('arrow')}</a><p class="plan-start-note">Your own copy, ready to arrange. Save it to your account when you're ready.</p></div></div>`;
    document.body.append(dialog);
    let stopPreview: (() => void) | undefined;
    const close = () => dialog.close();
    dialog.querySelector('button')!.addEventListener('click', close);
    dialog.addEventListener('close', () => {
      stopPreview?.();
      dialog.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    }, { once: true });
    dialog.showModal();
    const cleanup: Array<() => void> = [];
    preview(dialog.querySelector<HTMLElement>('.plan-detail-preview')!, template, cleanup);
    stopPreview = () => cleanup.forEach((stop) => stop());
    disposers.push(() => { if (dialog.isConnected) dialog.close(); });
  }

  function renderExplore(): void {
    const featured = apartmentTemplates[0];
    main.innerHTML = `
      <section class="portal-hero" aria-labelledby="welcome-title"><div class="portal-hero-copy"><p class="portal-eyebrow"><span></span>A new perspective on home</p><h1 id="welcome-title">Your apartment.<br><span>Your way.</span></h1><p class="portal-hero-description">Start with a floor plan. Find room for your ideas. Turn the place you have into the home you imagine.</p><a class="portal-button portal-primary" href="#apartments">Explore apartments${icon('arrow')}</a><p class="portal-hero-note">From the first idea to your next move.</p></div>
      ${featured ? `<div class="portal-hero-visual"><div class="portal-hero-annotation"><span>${icon('cube')}A plan with possibilities</span><span>01 / 0${apartmentTemplates.length}</span></div><div class="portal-preview portal-hero-preview"></div><button class="portal-featured-label" type="button" data-featured><span><span class="portal-kicker">Featured sample plan</span><strong>${escapeHtml(featured.name)}</strong><span class="portal-featured-meta">${featured.area} m² · ${bedroomLabel(featured.bedrooms)}</span></span><span class="portal-circle-arrow">${icon('arrow')}</span></button></div>` : ''}</section>
      <section class="portal-collection" id="apartments" aria-labelledby="collection-title"><div class="portal-section-heading"><div><p class="portal-eyebrow">Find your starting point</p><h2 id="collection-title">Good plans. New possibilities.</h2><p>Explore a collection of sample developer floor plans.</p></div><span class="portal-collection-label">Sample collection${icon('layers')}</span></div>
      <div class="portal-collection-toolbar"><div class="portal-filters" role="group" aria-label="Filter apartments by bedrooms"><button type="button" data-bedrooms="all" aria-pressed="true">All apartments</button><button type="button" data-bedrooms="1" aria-pressed="false">1 bedroom</button><button type="button" data-bedrooms="2" aria-pressed="false">2 bedrooms</button></div><p class="portal-result-count" role="status"></p></div><div class="portal-apartment-grid"></div></section>
      <section class="portal-steps" aria-label="How Varpet works"><div><span class="portal-step-number">01</span><div><h3>Find your floor plan</h3><p>A considered starting point for your future home.</p></div></div><div><span class="portal-step-number">02</span><div><h3>Make it feel like you</h3><p>Explore the space in 3D and arrange it your way.</p></div></div><div><span class="portal-step-number">03</span><div><h3>Come back to your ideas</h3><p>Save your apartment and keep building next time.</p></div></div></section>`;
    if (featured) {
      preview(main.querySelector<HTMLElement>('.portal-hero-preview')!, featured);
      main.querySelector('[data-featured]')!.addEventListener('click', () => showPlan(featured));
    }
    const grid = main.querySelector<HTMLElement>('.portal-apartment-grid')!;
    const filters = Array.from(main.querySelectorAll<HTMLButtonElement>('[data-bedrooms]'));
    /** Only when the architect service is connected: start from the buyer's own developer plan and photos. */
    function ownPlanCard(): string {
      return `<article class="portal-apartment-card portal-own-plan"><div class="portal-card-stage portal-own-plan-stage">${icon('cube')}<span class="portal-card-badge">Your plan</span></div><div class="portal-card-body"><p class="portal-kicker">Built by the architect</p><h3>Start from your own plan</h3><p class="portal-location">Upload the developer plan and a few photos. The architect builds the rooms, kitchen, bathroom and your furniture in 3D.</p><div class="portal-card-bottom"><div class="portal-card-facts"><span>About 8 minutes</span></div><a class="portal-card-link" href="/?editor&amp;architect=1">Upload plan${icon('arrow')}</a></div></div></article>`;
    }

    function renderCards(filter: string): void {
      cardDisposers.splice(0).forEach((cleanup) => cleanup());
      const matching = apartmentTemplates.filter((template) => filter === 'all' || template.bedrooms === Number(filter));
      main.querySelector('.portal-result-count')!.textContent = `${matching.length} plan${matching.length === 1 ? '' : 's'} to make your own`;
      filters.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.bedrooms === filter)));
      grid.innerHTML = (filter === 'all' && import.meta.env.VITE_ARCHITECT_URL ? ownPlanCard() : '') + (matching.length ? matching.map((template, index) => `<article class="portal-apartment-card"><div class="portal-card-stage"><div class="portal-preview" data-plan-preview="${index}"></div><span class="portal-card-badge">${bedroomLabel(template.bedrooms)}</span></div><div class="portal-card-body"><p class="portal-kicker">${escapeHtml(template.developer)}</p><h3>${escapeHtml(template.name)}</h3><p class="portal-location">${escapeHtml(template.location)}</p><div class="portal-card-bottom"><div class="portal-card-facts">${templateFacts(template)}</div><button class="portal-card-link" type="button" data-plan="${index}" aria-label="View ${escapeHtml(template.name)}">View apartment${icon('arrow')}</button></div></div></article>`).join('') : `<div class="portal-filter-empty">${icon('home')}<h3>More room to explore</h3><p>There are no sample plans with this number of bedrooms yet.</p><button type="button" class="portal-button" data-clear-filter>See all apartments</button></div>`);
      matching.forEach((template, index) => {
        preview(grid.querySelector<HTMLElement>(`[data-plan-preview="${index}"]`)!, template, cardDisposers);
        grid.querySelector(`[data-plan="${index}"]`)!.addEventListener('click', () => showPlan(template));
      });
      grid.querySelector('[data-clear-filter]')?.addEventListener('click', () => renderCards('all'));
    }
    filters.forEach((button) => button.addEventListener('click', () => renderCards(button.dataset.bedrooms!)));
    renderCards('all');
  }

  function profileHeading(): string {
    const firstName = currentUser?.name.trim().split(/\s+/)[0];
    return `<div class="portal-profile-heading"><div><p class="portal-eyebrow">Your personal collection</p><h1>${firstName ? `${escapeHtml(firstName)}'s apartments` : 'My apartments'}</h1><p>All your spaces. Every possibility.</p></div><a class="portal-button portal-primary" href="/#apartments">${icon('plus')}New apartment</a></div>`;
  }

  async function renderApartments(): Promise<void> {
    const version = ++requestVersion;
    cardDisposers.splice(0).forEach((cleanup) => cleanup());
    if (!currentUser) {
      main.innerHTML = `${profileHeading()}<section class="portal-empty"><span class="portal-empty-icon">${icon('home')}</span><p class="portal-eyebrow">A home for your ideas</p><h2>Your next chapter starts here.</h2><p>Sign in to find your saved apartments, or create an account and start making a space your own.</p><div class="portal-empty-actions"><button class="portal-button portal-primary" data-profile-login>Sign in${icon('arrow')}</button><button class="portal-button" data-profile-register>Create account</button></div><a class="portal-text-link" href="/#apartments">Explore the sample collection</a></section>`;
      main.querySelector('[data-profile-login]')!.addEventListener('click', () => authenticate('login'));
      main.querySelector('[data-profile-register]')!.addEventListener('click', () => authenticate('register'));
      return;
    }
    main.innerHTML = `${profileHeading()}<div class="portal-profile-status" role="status">Loading your apartments…</div>`;
    try {
      const apartments = await api.listApartments();
      if (disposed || version !== requestVersion) return;
      if (!apartments.length) {
        main.innerHTML = `${profileHeading()}<section class="portal-empty"><span class="portal-empty-icon">${icon('home')}</span><p class="portal-eyebrow">Room for something new</p><h2>Your first apartment is waiting.</h2><p>Choose a floor plan, make it your own, and save it here. Your ideas will be ready whenever you are.</p><a class="portal-button portal-primary" href="/#apartments">Find a floor plan${icon('arrow')}</a></section>`;
        return;
      }
      main.innerHTML = `${profileHeading()}<p class="portal-profile-count">${apartments.length} saved apartment${apartments.length === 1 ? '' : 's'}</p><div class="portal-apartment-grid portal-saved-grid">${apartments.map(savedCard).join('')}</div>`;
      // Saved cards describe their source plan; the editor opens the actual saved scene.
      apartments.forEach((apartment, index) => {
        const template = apartment.templateId ? getTemplate(apartment.templateId) : undefined;
        if (template && index < 8) preview(main.querySelector<HTMLElement>(`[data-saved-preview="${index}"]`)!, template, cardDisposers);
      });
    } catch (cause) {
      if (disposed || version !== requestVersion) return;
      main.innerHTML = `${profileHeading()}<section class="portal-empty portal-load-error"><span class="portal-empty-icon">${icon('folder')}</span><h2>We couldn't load your apartments.</h2><p class="portal-profile-error" role="alert"></p><button class="portal-button" type="button" data-profile-retry>Try again</button></section>`;
      main.querySelector('.portal-profile-error')!.textContent = cause instanceof Error ? cause.message : 'Check your connection and try again.';
      main.querySelector('[data-profile-retry]')!.addEventListener('click', () => { void renderApartments(); });
    }
  }

  function savedCard(apartment: ApartmentSummary, index: number): string {
    const template = apartment.templateId ? getTemplate(apartment.templateId) : undefined;
    return `<article class="portal-apartment-card"><div class="portal-card-stage"><div class="portal-preview" data-saved-preview="${index}">${template && index < 8 ? '' : `<div class="portal-preview-fallback">${icon('home')}<span>${template ? escapeHtml(template.name) : 'Your apartment'}</span></div>`}</div><span class="portal-card-badge">${template ? 'Original floor plan' : 'Saved apartment'}</span></div><div class="portal-card-body"><p class="portal-kicker">${escapeHtml(formatDate(apartment.updatedAt))}</p><h3>${escapeHtml(apartment.name)}</h3><p class="portal-location">${template ? `Started from ${escapeHtml(template.name)}` : 'Your personal project'}</p><div class="portal-card-bottom"><span class="portal-saved-state">${icon('save')}Saved in your account</span><a class="portal-card-link" href="/?apartment=${encodeURIComponent(apartment.id)}" aria-label="Open ${escapeHtml(apartment.name)}">Open apartment${icon('arrow')}</a></div></div></article>`;
  }

  function renderAccount(): void {
    account.innerHTML = currentUser
      ? `<a class="portal-account-profile" href="/?view=apartments"><span class="portal-avatar" aria-hidden="true">${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</span><span>${escapeHtml(currentUser.name)}</span></a><button class="portal-text-button portal-signout" type="button">Sign out</button>`
      : '<button class="portal-text-button" type="button" data-login>Sign in</button><button class="portal-button portal-header-signup" type="button" data-register>Create account</button>';
    account.querySelector('[data-login]')?.addEventListener('click', () => authenticate('login'));
    account.querySelector('[data-register]')?.addEventListener('click', () => authenticate('register'));
    account.querySelector('.portal-signout')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        await api.logout();
        if (disposed) return;
        currentUser = null;
        notice.hidden = true;
        renderAccount();
        if (view === 'apartments') await renderApartments();
      } catch (cause) {
        if (disposed) return;
        notice.textContent = cause instanceof Error ? cause.message : 'We could not sign you out. Please try again.';
        notice.hidden = false;
        button.disabled = false;
      }
    });
  }

  async function authenticate(mode: 'login' | 'register'): Promise<void> {
    const user = await showAuth(mode);
    if (!user || disposed) return;
    ++requestVersion;
    currentUser = user;
    notice.hidden = true;
    renderAccount();
    if (view === 'apartments') await renderApartments();
  }

  async function loadAccount(): Promise<void> {
    const version = ++requestVersion;
    try {
      const user = await api.session();
      if (disposed || version !== requestVersion) return;
      currentUser = user;
      notice.hidden = true;
      renderAccount();
      if (view === 'apartments') await renderApartments();
    } catch {
      if (disposed || version !== requestVersion) return;
      account.innerHTML = '<button class="portal-text-button" type="button" data-account-retry>Reconnect account</button>';
      account.querySelector('[data-account-retry]')!.addEventListener('click', () => { void loadAccount(); });
      if (view === 'apartments') {
        main.innerHTML = `${profileHeading()}<section class="portal-empty"><span class="portal-empty-icon">${icon('connections')}</span><h2>Let's reconnect.</h2><p role="alert">We couldn't reach your account. Please check your connection and try again.</p><button class="portal-button" type="button" data-session-retry>Try again</button></section>`;
        main.querySelector('[data-session-retry]')!.addEventListener('click', () => { void loadAccount(); });
      }
    }
  }

  if (view === 'explore') renderExplore();
  else main.innerHTML = `${profileHeading()}<div class="portal-profile-status" role="status">Checking your account…</div>`;
  await loadAccount();
}
