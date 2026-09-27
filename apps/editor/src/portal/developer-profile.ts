/**
 * Developer profiles (lane portal-profile).
 *
 * `/?developer=<slug>`: the public profile, a developer header and the grid of its plan bundles (original plan
 * beside the furnished 3D apartment), each opening `bundleHref(id)`.
 * `/?view=studio`: the signed-in account's own profile: create/edit it, upload a blueprint (Build → Design →
 * Customize through the normal blueprint flow, then Publish to profile in the editor), unpublish plans.
 * `/?view=studio&upload`: the upload itself, the blueprint landing in developer context.
 */
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import { bundleHref, developerHref, studioHref, catalogHref, type Bundle, type BundleSummary, type Developer } from './bundles-contract';
import { mountPortalShell, escapeHtml as escape, type PortalShell } from './portal-header';
import { developerApi, slugify, initials, bedroomLabel, ProfileError, type ProfileInput } from './developer-api';
import { showAuth } from './auth';
import type { User } from './api';
import { icon } from '../ui/icons';
import { BLUEPRINT_PAPER, setEditorSession, type EditorPresentation } from './session';
import type { BlueprintLandingOptions } from './blueprint';
import type { FurnishedPreview } from './preview';
import './developer-profile.css';

/** Developer profiles (lane portal-profile). */
export type DeveloperProfileTarget = { slug: string } | { studio: true };

const mounts = new WeakMap<HTMLElement, () => void>();
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function mountDeveloperProfile(host: HTMLElement, target: DeveloperProfileTarget): Promise<void> {
  mounts.get(host)?.();
  const upload = 'studio' in target && new URLSearchParams(location.search).has('upload');
  const disposers: Array<() => void> = [];
  let disposed = false, version = 0;
  const current = (v: number) => !disposed && v === version;
  const dispose = () => {
    if (disposed) return;
    disposed = true; ++version;
    disposers.splice(0).reverse().forEach(cleanup => cleanup());
    window.removeEventListener('pagehide', onPageHide);
  };
  const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
  window.addEventListener('pagehide', onPageHide);
  mounts.set(host, dispose);

  let render: (user: User | null) => Promise<void> = async () => {};
  const shell: PortalShell = mountPortalShell(host, null, {
    className: upload ? 'blueprint-home developer-upload' : 'developer-page',
    showSignup: 'studio' in target,
    onUser: user => render(user),
    onUnavailable: () => render(null),
  });
  disposers.push(() => shell.dispose());
  const main = shell.main;
  const cards = new CardPreviews();
  disposers.push(() => cards.dispose());
  let disposeUpload: (() => void) | undefined;
  disposers.push(() => { disposeUpload?.(); disposeUpload = undefined; });

  if ('slug' in target) {
    const slug = target.slug;
    main.innerHTML = loading('Opening developer profile…');
    render = async () => {
      const v = ++version;
      try {
        const developer = await developerApi.developer(slug);
        if (!current(v)) return;
        document.title = `${developer.name} · Varpet`;
        main.innerHTML = `${heroMarkup(developer, developer.ownedByViewer ? 'owner' : 'public')}${plansMarkup(developer, false)}`;
        activate(developer, false);
      } catch (cause) {
        if (!current(v)) return;
        main.innerHTML = problem(cause instanceof ProfileError && cause.status === 404
          ? { title: 'This developer profile isn’t here.', text: 'It may have moved or been removed. Browse the catalog for other developers’ plans.' }
          : { title: 'We couldn’t load this profile.', text: cause instanceof Error ? cause.message : 'Please try again.', retry: true });
        main.querySelector('[data-retry]')?.addEventListener('click', () => void render(shell.account.user()));
      }
    };
  } else if (upload) {
    render = user => mountUpload(user);
  } else {
    main.innerHTML = loading('Opening your studio…');
    render = async user => {
      const v = ++version;
      cards.clear();
      if (!user) { renderSignedOut(); return; }
      try {
        const studio = await developerApi.studio();
        if (!current(v)) return;
        if (!studio.developer) renderCreate(v);
        else renderStudio(studio.developer);
      } catch (cause) {
        if (!current(v)) return;
        main.innerHTML = problem({ title: 'We couldn’t open your studio.', text: cause instanceof Error ? cause.message : 'Please try again.', retry: true });
        main.querySelector('[data-retry]')?.addEventListener('click', () => void render(shell.account.user()));
      }
    };
  }
  await shell.account.reload();

  /* ---------------------------------------------------------------- shared view pieces */

  function activate(developer: Developer, studio: boolean) {
    cards.clear();
    main.querySelectorAll<HTMLElement>('.dev-card').forEach(card => {
      const bundle = developer.bundles.find(item => item.id === card.dataset.bundle);
      if (bundle) cards.observe(card.querySelector<HTMLElement>('.dev-card-3d')!, bundle);
    });
    main.querySelectorAll<HTMLImageElement>('.dev-card-plan img').forEach(image => {
      const loaded = () => image.closest('.dev-card-plan')?.classList.add('is-loaded');
      if (image.complete && image.naturalWidth) loaded(); else image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', () => image.closest('.dev-card-plan')?.classList.add('is-missing'), { once: true });
    });
    if (studio) {
      main.querySelectorAll<HTMLButtonElement>('[data-unpublish]').forEach(button => {
        button.onclick = () => void unpublish(developer, button.dataset.unpublish!);
      });
      main.querySelector<HTMLButtonElement>('[data-edit-profile]')?.addEventListener('click', () => void editProfile(developer));
    }
  }

  /* ---------------------------------------------------------------- studio */

  function renderSignedOut() {
    main.innerHTML = `<section class="dev-studio-gate"><div class="dev-gate-sheet" style="--paper:${BLUEPRINT_PAPER}" aria-hidden="true"><i></i><span>VARPET · DEVELOPER STUDIO</span></div>
      <p class="portal-eyebrow"><span></span>For developers</p><h1>Show buyers what your plans can become.</h1>
      <p>Create a developer profile, upload your floor plans, and publish each one with a furnished 3D apartment that buyers can open and make their own.</p>
      <div class="portal-empty-actions"><button class="portal-button portal-primary" type="button" data-studio-register>Create account ${icon('arrow')}</button><button class="portal-button" type="button" data-studio-login>Sign in</button></div>
      <a class="portal-text-link" href="${catalogHref}">Browse the catalog first</a></section>`;
    const auth = async (mode: 'login' | 'register') => { const user = await showAuth(mode); if (user && !disposed) await shell.account.reload(); };
    main.querySelector('[data-studio-register]')!.addEventListener('click', () => void auth('register'));
    main.querySelector('[data-studio-login]')!.addEventListener('click', () => void auth('login'));
  }

  function renderCreate(v: number) {
    main.innerHTML = `<section class="dev-create"><div class="dev-create-copy"><p class="portal-eyebrow"><span></span>Developer studio · step 1 of 2</p>
      <h1>Create your developer profile</h1><p>Buyers see this beside every plan you publish. You can change it later.</p>
      ${profileForm(null, 'Create profile')}</div>
      <aside class="dev-create-preview" aria-label="Profile preview"><p class="portal-kicker">Preview</p><div class="dev-create-live"></div></aside></section>`;
    const form = main.querySelector<HTMLFormElement>('.dev-profile-form')!;
    const preview = main.querySelector<HTMLElement>('.dev-create-live')!;
    const draw = () => {
      const input = readProfile(form);
      preview.innerHTML = heroMarkup({ slug: input.slug || 'your-company', name: input.name || 'Your company', city: input.city, tagline: input.tagline || 'Your tagline',
        about: '', website: input.website || null, bundleCount: 0, logoUrl: null, ownedByViewer: true, bundles: [] }, 'preview');
    };
    bindProfileForm(form, null, draw);
    draw();
    form.onsubmit = event => {
      event.preventDefault();
      void submitProfile(form, async input => {
        const developer = await developerApi.createProfile(input);
        if (current(v)) renderStudio(developer, true);
      });
    };
  }

  function renderStudio(developer: Developer, created = false) {
    main.innerHTML = `${heroMarkup(developer, 'studio')}
      <section class="dev-studio-actions" aria-labelledby="dev-studio-title">
        <div><p class="portal-eyebrow"><span></span>${created ? 'Profile created · step 2 of 2' : 'Developer studio'}</p><h2 id="dev-studio-title">Add a plan</h2>
          <p>Upload a floor plan. It goes through the same three steps as any apartment, then you publish it here.</p></div>
        <ol class="dev-steps" aria-label="How a plan reaches your profile">
          <li><span>01</span>Build<small>Walls, doors and windows from your plan</small></li>
          <li><span>02</span>Design<small>Furnish it with the designer</small></li>
          <li><span>03</span>Customize<small>Adjust any piece yourself</small></li>
          <li><span>${icon('upload')}</span>Publish<small>Plan and 3D model, side by side</small></li>
        </ol>
        <a class="portal-button portal-primary dev-upload-button" href="${studioHref}&upload">${icon('upload')} Upload a blueprint ${icon('arrow')}</a>
      </section>
      ${plansMarkup(developer, true)}`;
    activate(developer, true);
    if (created) main.querySelector<HTMLElement>('.dev-upload-button')?.focus({ preventScroll: true });
  }

  async function editProfile(developer: Developer) {
    const dialog = document.createElement('dialog');
    dialog.className = 'portal-dialog dev-edit-dialog';
    dialog.setAttribute('aria-labelledby', 'dev-edit-title');
    dialog.innerHTML = `<div class="dev-dialog-top"><h2 id="dev-edit-title">Edit profile</h2><button class="portal-icon-button" type="button" data-close aria-label="Close">${icon('close')}</button></div>${profileForm(developer, 'Save profile')}`;
    document.body.append(dialog);
    disposers.push(() => { if (dialog.isConnected) dialog.close(); });
    const form = dialog.querySelector<HTMLFormElement>('form')!;
    bindProfileForm(form, developer, () => {});
    dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => dialog.close();
    dialog.addEventListener('close', () => { dialog.remove(); main.querySelector<HTMLElement>('[data-edit-profile]')?.focus(); }, { once: true });
    form.onsubmit = event => {
      event.preventDefault();
      void submitProfile(form, async input => {
        const updated = await developerApi.updateProfile(developer.slug, input);
        dialog.close();
        if (!disposed) renderStudio(updated);
      });
    };
    dialog.showModal();
    if (!reduced()) dialog.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  async function unpublish(developer: Developer, id: string) {
    const bundle = developer.bundles.find(item => item.id === id);
    if (!bundle) return;
    const confirmed = await confirmDialog(`Unpublish ${bundle.name}?`,
      'It disappears from your profile and the catalog. Copies buyers already saved to their own accounts are not affected.', 'Unpublish');
    if (!confirmed || disposed) return;
    const card = main.querySelector<HTMLElement>(`.dev-card[data-bundle="${CSS.escape(id)}"]`);
    const button = card?.querySelector<HTMLButtonElement>('[data-unpublish]');
    if (button) { button.disabled = true; button.textContent = 'Unpublishing…'; }
    try {
      await developerApi.unpublish(id);
      if (disposed) return;
      developer.bundles = developer.bundles.filter(item => item.id !== id);
      developer.bundleCount = developer.bundles.length;
      if (card && !reduced()) {
        await card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }],
          { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {});
      }
      if (!disposed) renderStudio(developer);
    } catch (cause) {
      if (disposed) return;
      if (button) { button.disabled = false; button.innerHTML = `${icon('trash')} Unpublish`; }
      showNotice(cause instanceof Error ? cause.message : 'Could not unpublish this plan. Please try again.');
    }
  }

  /* ---------------------------------------------------------------- upload */

  async function mountUpload(user: User | null) {
    const v = ++version;
    disposeUpload?.(); disposeUpload = undefined;
    host.querySelector('.dev-upload-bar')?.remove();
    const root = host.querySelector('.portal');
    root?.classList.toggle('blueprint-home', Boolean(user));
    root?.classList.toggle('developer-page', !user);
    if (!user) { renderSignedOut(); return; }
    main.innerHTML = loading('Opening your studio…');
    let developer: Developer | null;
    try { developer = (await developerApi.studio()).developer; }
    catch (cause) {
      if (!current(v)) return;
      main.innerHTML = problem({ title: 'We couldn’t open your studio.', text: cause instanceof Error ? cause.message : 'Please try again.', retry: true });
      main.querySelector('[data-retry]')?.addEventListener('click', () => void render(shell.account.user()));
      return;
    }
    if (!current(v)) return;
    if (!developer) { location.replace(studioHref); return; }
    main.innerHTML = '';
    const context = { slug: developer.slug, name: developer.name };
    const options: BlueprintLandingOptions = {
      audience: 'developer',
      showSample: () => {},
      async openProject(scene: SceneDocument, catalog: CatalogProduct[], presentation?: EditorPresentation) {
        // Same safety as the home page: keep the reviewed build before loading the editor's modules.
        const { saveBlueprintCheckpoint, clearBlueprintCheckpoint } = await import('./blueprint-checkpoint');
        let checkpoint: string | undefined;
        try { checkpoint = await saveBlueprintCheckpoint(scene, catalog); } catch { /* storage may be unavailable */ }
        if (checkpoint) history.replaceState(null, '', `/?blueprint=${encodeURIComponent(checkpoint)}`);
        setEditorSession({ scene, catalog, user, apartment: null, templateId: null, presentation, developer: context });
        try { await import('../main'); }
        catch (cause) {
          if (!checkpoint) throw new Error('Could not load the editor, and browser storage is unavailable. Keep this page open, free some browser storage, then try again.', { cause });
          throw cause;
        }
        dispose();
        host.classList.remove('portal-host');
        history.replaceState(null, '', '/?editor');
        if (checkpoint) void clearBlueprintCheckpoint(checkpoint).catch(() => {});
      },
    };
    // A zero-height bar right under the header, so the link sits below it at every header height.
    const back = document.createElement('div');
    back.className = 'dev-upload-bar';
    back.innerHTML = `<a class="dev-upload-back" href="${studioHref}">${icon('undo')} ${escape(developer.name)} studio</a>`;
    main.before(back);
    disposers.push(() => back.remove());
    if (import.meta.env.DEV) {
      try {
        const { mountBlueprintTestTools } = await import('./blueprint-test-tools');
        if (current(v)) disposeUpload = mountBlueprintTestTools(main, options);
        return;
      } catch { /* fall through to the live upload */ }
    }
    const { mountBlueprintLanding } = await import('./blueprint');
    if (current(v)) disposeUpload = mountBlueprintLanding(main, options);
  }

  /* ---------------------------------------------------------------- helpers bound to this page */

  function showNotice(message: string) {
    const notice = host.querySelector<HTMLElement>('.portal-notice');
    if (!notice) return;
    notice.textContent = message; notice.hidden = false;
  }

  async function submitProfile(form: HTMLFormElement, save: (input: ProfileInput) => Promise<void>) {
    const error = form.querySelector<HTMLElement>('.portal-error')!;
    const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    const input = readProfile(form);
    const problemText = profileProblem(input);
    if (problemText) { error.textContent = problemText; error.hidden = false; return; }
    submit.disabled = true; error.hidden = true;
    const label = submit.innerHTML;
    submit.innerHTML = `Saving… <span class="developer-spinner" aria-hidden="true"></span>`;
    try { await save(input); }
    catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : 'Could not save your profile. Please try again.';
      error.hidden = false;
      if (cause instanceof ProfileError && cause.code === 'slug_taken') form.querySelector<HTMLInputElement>('[name=slug]')?.focus();
    } finally { if (submit.isConnected) { submit.disabled = false; submit.innerHTML = label; } }
  }
}

/* -------------------------------------------------------------------- markup */

type HeroMode = 'public' | 'owner' | 'studio' | 'preview';

function heroMarkup(developer: Developer, mode: HeroMode): string {
  const sample = developer.bundles.length > 0 && developer.bundles.every(bundle => bundle.source === 'sample');
  let website: URL | null = null;
  try { website = developer.website ? new URL(/^https?:\/\//i.test(developer.website) ? developer.website : `https://${developer.website}`) : null; } catch { website = null; }
  const meta = [
    developer.city ? `<li>${icon('home')}${escape(developer.city)}</li>` : '',
    `<li>${icon('layers')}${developer.bundleCount} plan${developer.bundleCount === 1 ? '' : 's'}</li>`,
    website ? `<li>${mode === 'preview' ? `<span>${icon('share')}${escape(website.hostname)}</span>` : `<a href="${escape(website.href)}" target="_blank" rel="noopener noreferrer nofollow ugc">${icon('share')}${escape(website.hostname)}</a>`}</li>` : '',
  ].join('');
  const actions = mode === 'studio'
    ? `<div class="dev-hero-actions"><button class="portal-button dev-hero-button" type="button" data-edit-profile>${icon('sliders')} Edit profile</button><a class="portal-button dev-hero-button" href="${developerHref(developer.slug)}">${icon('eye')} View public profile</a></div>`
    : mode === 'owner' ? `<div class="dev-hero-actions"><a class="portal-button dev-hero-button" href="${studioHref}">${icon('sliders')} Manage in studio</a></div>` : '';
  const preview = mode === 'preview';
  const nameTag = preview ? 'p' : 'h1';
  return `<${preview ? 'div' : 'section'} class="dev-hero${preview ? ' is-preview' : ''}" style="--paper:${BLUEPRINT_PAPER}"${preview ? '' : ' aria-labelledby="dev-name"'}>
    <div class="dev-hero-grid" aria-hidden="true"></div>
    <svg class="dev-hero-frame" aria-hidden="true"><rect x="0" y="0" width="100%" height="100%" pathLength="1"/></svg>
    <div class="dev-hero-inner">
      <div class="dev-mark" aria-hidden="true">${escape(initials(developer.name))}</div>
      <div class="dev-hero-copy">
        <p class="dev-hero-eyebrow">${sample ? 'SAMPLE COLLECTION' : 'DEVELOPER'}${developer.city ? ` · ${escape(developer.city.toUpperCase())}` : ''}</p>
        <${nameTag} class="dev-name"${preview ? '' : ' id="dev-name"'}>${escape(developer.name)}</${nameTag}>
        ${developer.tagline ? `<p class="dev-tagline">${escape(developer.tagline)}</p>` : ''}
        <ul class="dev-meta">${meta}</ul>
        ${actions}
      </div>
      <div class="dev-titleblock" aria-hidden="true"><span>VARPET · DEVELOPER PROFILE</span><strong>${escape(developer.name)}</strong><span>SHEET 01 / 01</span></div>
    </div>
  </${preview ? 'div' : 'section'}>`;
}

function plansMarkup(developer: Developer, studio: boolean): string {
  // Sample profiles already say so in their own words; otherwise the note is added here.
  const sample = developer.bundles.some(bundle => bundle.source === 'sample') && !/sample collection/i.test(developer.about);
  const about = developer.about ? `<section class="dev-about" aria-label="About ${escape(developer.name)}"><h2>About</h2><p>${escape(developer.about)}</p>
    ${sample ? `<p class="dev-sample-note">${icon('help')} Sample collection prepared by Varpet. Not a verified listing, offer or price list.</p>` : ''}</section>` : '';
  const heading = `<div class="dev-plans-heading"><div><h2 id="dev-plans-title">${studio ? 'Published plans' : 'Plans'}</h2>
    <p>${developer.bundles.length ? `${developer.bundles.length} plan${developer.bundles.length === 1 ? '' : 's'} · the original drawing beside a furnished 3D apartment` : ''}</p></div>
    ${developer.bundles.length ? `<span class="portal-collection-label">${icon('cube')} Open any plan in Design</span>` : ''}</div>`;
  const empty = studio
    ? `<div class="dev-empty"><span class="portal-empty-icon">${icon('layers')}</span><h3>No published plans yet</h3><p>Upload a blueprint, design it, and choose Publish to profile in the editor. It appears here.</p><a class="portal-button" href="${studioHref}&upload">${icon('upload')} Upload a blueprint</a></div>`
    : `<div class="dev-empty"><span class="portal-empty-icon">${icon('layers')}</span><h3>No plans published yet</h3><p>This developer hasn’t published a plan. Explore other developers in the catalog.</p><a class="portal-button" href="${catalogHref}">Browse the catalog ${icon('arrow')}</a></div>`;
  return `<div class="dev-body">${about}<section class="dev-plans" aria-labelledby="dev-plans-title">${heading}
    ${developer.bundles.length ? `<div class="dev-grid">${developer.bundles.map((bundle, i) => cardMarkup(bundle, i, studio)).join('')}</div>` : empty}</section></div>`;
}

function cardMarkup(bundle: BundleSummary, index: number, studio: boolean): string {
  const facts = [`${bundle.area} m²`, bedroomLabel(bundle.bedrooms), `${bundle.furnishedPieces} piece${bundle.furnishedPieces === 1 ? '' : 's'}`];
  const kicker = [bundle.building, bundle.source === 'sample' ? 'Sample' : null].filter(Boolean).join(' · ');
  return `<article class="dev-card" data-bundle="${escape(bundle.id)}" style="--i:${Math.min(index, 8)}">
    <a class="dev-card-open" href="${bundleHref(bundle.id)}" aria-label="Open ${escape(bundle.name)} in Design">
      <div class="dev-card-stage">
        <figure class="dev-card-plan"><img src="${escape(bundle.blueprintUrl)}" alt="Original floor plan of ${escape(bundle.name)}" loading="lazy" decoding="async"><figcaption>${icon('layers')}Original plan</figcaption></figure>
        <figure class="dev-card-model"><div class="dev-card-3d" role="img" aria-label="Furnished 3D apartment of ${escape(bundle.name)}"></div><figcaption>${icon('cube')}Furnished 3D</figcaption></figure>
      </div>
      <div class="dev-card-body">
        ${kicker ? `<p class="portal-kicker">${escape(kicker)}</p>` : ''}
        <h3>${escape(bundle.name)}</h3>
        <div class="portal-card-facts">${facts.map(fact => `<span>${escape(fact)}</span>`).join('')}</div>
        <span class="dev-card-cta">Open in Design ${icon('arrow')}</span>
      </div>
    </a>
    ${studio ? `<div class="dev-card-manage"><span>${bundle.source === 'published' ? `Published ${escape(formatDate(bundle.updatedAt))}` : 'Sample'}</span><button class="portal-text-button" type="button" data-unpublish="${escape(bundle.id)}">${icon('trash')} Unpublish</button></div>` : ''}
  </article>`;
}

function profileForm(developer: Developer | null, submit: string): string {
  const value = (text: string | null | undefined) => escape(text ?? '');
  return `<form class="dev-profile-form" novalidate>
    <label class="portal-field">Company name<input name="name" required maxlength="80" autocomplete="organization" value="${value(developer?.name)}" placeholder="Ararat Homes"></label>
    <label class="portal-field">Profile address<span class="dev-slug-field"><span>/?developer=</span><input name="slug" required maxlength="48" autocapitalize="off" spellcheck="false" value="${value(developer?.slug)}" placeholder="ararat-homes" aria-label="Profile address"></span></label>
    <div class="developer-publish-row">
      <label class="portal-field"><span class="dev-label">City <span class="portal-field-optional">optional</span></span><input name="city" maxlength="80" autocomplete="address-level2" value="${value(developer?.city)}" placeholder="Yerevan"></label>
      <label class="portal-field"><span class="dev-label">Website <span class="portal-field-optional">optional</span></span><input name="website" maxlength="200" inputmode="url" value="${value(developer?.website)}" placeholder="example.com"></label>
    </div>
    <label class="portal-field"><span class="dev-label">Tagline <span class="portal-field-optional">optional</span></span><input name="tagline" maxlength="140" value="${value(developer?.tagline)}" placeholder="Bright homes near the park"></label>
    <label class="portal-field"><span class="dev-label">About <span class="portal-field-optional">optional</span></span><textarea name="about" maxlength="2000" rows="4" placeholder="What you build, where, and for whom.">${value(developer?.about)}</textarea></label>
    <p class="portal-error" role="alert" hidden></p>
    <button class="portal-button portal-primary dev-profile-submit" type="submit">${submit} ${icon('arrow')}</button>
  </form>`;
}

function readProfile(form: HTMLFormElement): ProfileInput {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? '').trim();
  return { name: text('name'), slug: text('slug').toLowerCase(), city: text('city'), tagline: text('tagline'), about: text('about'), website: text('website') };
}

function profileProblem(input: ProfileInput): string | null {
  if (!input.name) return 'Enter your company name.';
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(input.slug) || input.slug.includes('--')) return 'Choose a profile address of 3–48 lowercase letters, numbers and single hyphens.';
  return null;
}

/** The address follows the name until the person edits it. */
function bindProfileForm(form: HTMLFormElement, developer: Developer | null, changed: () => void) {
  const name = form.querySelector<HTMLInputElement>('[name=name]')!, slug = form.querySelector<HTMLInputElement>('[name=slug]')!;
  let follow = !developer;
  name.addEventListener('input', () => { if (follow) slug.value = slugify(name.value); });
  slug.addEventListener('input', () => { follow = false; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); });
  form.addEventListener('input', changed);
}

function confirmDialog(title: string, text: string, action: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'portal-dialog dev-confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'dev-confirm-title');
    dialog.innerHTML = `<h2 id="dev-confirm-title">${escape(title)}</h2><p>${escape(text)}</p><div><button class="portal-button" type="button" data-cancel>Cancel</button><button class="portal-button dev-danger" type="button" data-confirm>${escape(action)}</button></div>`;
    document.body.append(dialog);
    let result = false;
    dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => dialog.close();
    dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick = () => { result = true; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true });
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.focus();
  });
}

const loading = (text: string) => `<div class="portal-profile-status dev-loading" role="status"><span class="developer-spinner" aria-hidden="true"></span>${escape(text)}</div>`;
function problem({ title, text, retry = false }: { title: string; text: string; retry?: boolean }): string {
  return `<section class="portal-empty dev-problem"><span class="portal-empty-icon">${icon('folder')}</span><h2>${escape(title)}</h2><p role="alert">${escape(text)}</p>
    <div class="portal-empty-actions">${retry ? '<button class="portal-button" type="button" data-retry>Try again</button>' : ''}<a class="portal-button" href="${catalogHref}">Browse the catalog</a></div></section>`;
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

/**
 * The 3D half of each card: fetched and built only when the card first scrolls into view. Previews share one
 * WebGL context (preview.ts); visibility lets off-screen cards release their scenes, and hover or focus
 * turns the model slowly.
 */
class CardPreviews {
  private observer: IntersectionObserver | null = null;
  private summaries = new Map<Element, BundleSummary>();
  private previews = new Map<Element, FurnishedPreview>();
  private started = new Set<Element>();
  private cleanups: Array<() => void> = [];
  private controller = new AbortController();

  observe(element: HTMLElement, bundle: BundleSummary) {
    this.summaries.set(element, bundle);
    const card = element.closest<HTMLElement>('.dev-card');
    if (card) {
      const active = (on: boolean) => () => this.previews.get(element)?.setActive(on);
      const enter = active(true), leave = active(false);
      card.addEventListener('pointerenter', enter); card.addEventListener('pointerleave', leave);
      card.addEventListener('focusin', enter); card.addEventListener('focusout', leave);
      this.cleanups.push(() => { card.removeEventListener('pointerenter', enter); card.removeEventListener('pointerleave', leave);
        card.removeEventListener('focusin', enter); card.removeEventListener('focusout', leave); });
    }
    if (typeof IntersectionObserver === 'undefined') { void this.mount(element, true); return; }
    this.observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        const preview = this.previews.get(entry.target);
        if (preview) preview.setVisible(entry.isIntersecting);
        else if (entry.isIntersecting && !this.started.has(entry.target)) void this.mount(entry.target as HTMLElement, true);
      }
    }, { rootMargin: '200px 0px' });
    this.observer.observe(element);
  }

  private async mount(element: HTMLElement, visible: boolean) {
    const summary = this.summaries.get(element);
    if (!summary) return;
    this.started.add(element);
    const signal = this.controller.signal;
    element.classList.add('is-loading');
    try {
      const [bundle, { renderBundlePreview }] = await Promise.all([developerApi.bundle(summary.id, signal), import('./developer-preview')]);
      if (signal.aborted || !element.isConnected) return;
      const preview = renderBundlePreview(element, bundle as Bundle, reduced);
      this.previews.set(element, preview);
      preview.setVisible(visible);
      await preview.ready;
      if (signal.aborted) return;
      element.classList.remove('is-loading');
      element.classList.add('is-ready');
    } catch {
      if (signal.aborted || !element.isConnected) return;
      element.classList.remove('is-loading');
      fallback(element, '3D preview unavailable. Open the plan to explore it.');
    }
  }

  clear() {
    this.observer?.disconnect(); this.observer = null;
    this.controller.abort(); this.controller = new AbortController();
    this.previews.forEach(preview => preview.dispose()); this.previews.clear();
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.summaries.clear(); this.started.clear();
  }
  dispose() { this.clear(); }
}

function fallback(element: HTMLElement, text: string) {
  element.innerHTML = `<div class="portal-preview-fallback">${icon('cube')}<span>${escape(text)}</span></div>`;
}
