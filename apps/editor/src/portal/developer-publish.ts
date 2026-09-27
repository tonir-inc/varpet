/**
 * Publish to profile: the editor's action for a plan opened from a developer's studio.
 *
 * `installDeveloperPublish` is called once by the editor (main.ts) with read access to its current scene,
 * registered catalog products and revision. It does nothing unless the session carries a developer context
 * (`EditorSession.developer`, set by the studio upload). It sends the current scene, the catalog products the
 * scene references and the original plan image (the `plan` evidence the blueprint flow retained) to
 * `POST /api/developers/:slug/bundles`, then `PUT /api/bundles/:id` for later updates.
 */
import type { SceneDocument } from '../contracts';
import { sceneCatalogIds, type CatalogProduct } from '../adapters/database-catalog';
import { editorSession, type DeveloperContext } from './session';
import { developerApi, bedroomLabel } from './developer-api';
import { bundleHref, developerHref } from './bundles-contract';
import { icon } from '../ui/icons';
import './portal.css';
import './developer-profile.css';

export interface DeveloperPublishHost {
  scene(): SceneDocument;
  products(): readonly CatalogProduct[];
  revision(): number;
  notify(message: string, error?: boolean): void;
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The original plan the blueprint flow attached as evidence, if the scene carries one as an image. */
export function scenePlanImage(scene: SceneDocument): string | null {
  const sources = scene.version === 2 ? scene.project?.sources ?? [] : [];
  return sources.find(source => source.kind === 'plan' && /^data:image\/(png|jpeg|webp);base64,/.test(source.dataUrl ?? ''))?.dataUrl ?? null;
}

export function sceneArea(scene: SceneDocument): number {
  const area = scene.rooms.reduce((total, room) => total + Math.abs(room.polygon.reduce((sum, p, i) => {
    const q = room.polygon[(i + 1) % room.polygon.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2, 0);
  return Math.round(area * 10) / 10;
}
export const sceneBedrooms = (scene: SceneDocument) => scene.rooms.filter(room => /bed ?room/i.test(room.name)
  && !/balcon|bath|closet|wardrobe|hall|ensuite|lodg/i.test(room.name)).length;

/** The snapshot sent to the profile: exactly the referenced products, deep-copied at click time. */
export function bundleSnapshot(scene: SceneDocument, products: readonly CatalogProduct[]) {
  const ids = new Set(sceneCatalogIds(scene));
  return structuredClone({ scene, catalog: products.filter(product => ids.has(product.asset.id)) });
}

export function installDeveloperPublish(host: DeveloperPublishHost, context: DeveloperContext | undefined = editorSession?.developer): () => void {
  const actions = document.querySelector<HTMLElement>('.header-actions');
  if (!context || !actions) return () => {};
  const developer = context;
  let published: { id: string; revision: number } | null = null;
  let dialog: HTMLDialogElement | null = null;
  let timer = 0;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'developer-publish';
  button.className = 'button developer-publish-button';
  button.setAttribute('aria-haspopup', 'dialog');
  const share = actions.querySelector('#share');
  if (share) share.before(button); else actions.append(button);
  const label = () => {
    const changed = published && host.revision() !== published.revision;
    const text = !published ? 'Publish to profile' : changed ? 'Update on profile' : 'Published';
    button.innerHTML = `${icon(published && !changed ? 'eye' : 'upload')} <span>${text}</span>`;
    button.title = published && !changed ? `On ${developer.name}’s profile. Open the publish panel to view it.` : `Publish this apartment and its original plan to ${developer.name}’s profile`;
    button.setAttribute('aria-label', published && !changed ? `Published to ${developer.name}’s profile` : `${text} · ${developer.name}`);
    button.classList.toggle('is-published', Boolean(published && !changed));
  };
  label();
  button.onclick = () => open();

  function open() {
    if (dialog) return;
    const scene = host.scene();
    const plan = scenePlanImage(scene);
    const updating = Boolean(published);
    const previousFocus = document.activeElement;
    dialog = document.createElement('dialog');
    dialog.className = 'portal-dialog developer-publish-dialog';
    dialog.setAttribute('aria-labelledby', 'developer-publish-title');
    dialog.innerHTML = `
      <div class="developer-publish-top"><p class="portal-eyebrow"><span></span>${escape(developer.name)} · developer profile</p>
        <button class="portal-icon-button" type="button" data-close aria-label="Close">${icon('close')}</button></div>
      <h2 id="developer-publish-title">${updating ? 'Update this plan on your profile' : 'Publish to your profile'}</h2>
      <p class="developer-publish-lead">Visitors see your original plan beside this furnished 3D apartment, and can open it in Design to make it their own. You can unpublish it from your studio at any time.</p>
      <div class="developer-publish-pair" aria-hidden="true">
        <figure class="developer-publish-plan">${plan ? `<img src="${plan}" alt="">` : `<span>${icon('layers')}No original plan attached</span>`}<figcaption>Original plan</figcaption></figure>
        <span class="developer-publish-arrow">${icon('arrow')}</span>
        <figure class="developer-publish-model"><span>${icon('cube')}<strong>${scene.rooms.length} room${scene.rooms.length === 1 ? '' : 's'}</strong><small>${scene.objects.length} piece${scene.objects.length === 1 ? '' : 's'} of furniture</small></span><figcaption>Furnished 3D</figcaption></figure>
      </div>
      <form class="developer-publish-form" novalidate>
        <label class="portal-field">Plan name<input name="name" required maxlength="120" value="${escape(scene.name.slice(0, 120))}" placeholder="Type A · 3rd floor"></label>
        <label class="portal-field"><span class="dev-label">Building <span class="portal-field-optional">optional</span></span><input name="building" maxlength="80" placeholder="Building B"></label>
        <div class="developer-publish-row">
          <label class="portal-field">Bedrooms<input name="bedrooms" type="number" inputmode="numeric" min="0" max="20" step="1" value="${sceneBedrooms(scene)}"></label>
          <label class="portal-field">Area, m²<input name="area" type="number" inputmode="decimal" min="1" max="5000" step="0.1" value="${sceneArea(scene)}"></label>
        </div>
        <p class="portal-field-hint">Area is summed from the model’s room outlines. Enter your own figure if you publish one.</p>
        <p class="portal-error" role="alert" hidden></p>
        <button class="portal-button portal-primary developer-publish-submit" type="submit" ${plan ? '' : 'disabled'}>${updating ? 'Update on profile' : 'Publish to profile'} ${icon('arrow')}</button>
      </form>
      <div class="developer-publish-done" hidden>
        <svg class="developer-publish-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="m15 27 7 7 15-16"/></svg>
        <h2 tabindex="-1">On your profile</h2>
        <p></p>
        <div class="developer-publish-links"><a class="portal-button portal-primary" data-profile target="_blank" rel="noopener">View profile ${icon('arrow')}</a><a class="portal-button" data-visitor target="_blank" rel="noopener">Open as a visitor</a></div>
        <button class="portal-text-button" type="button" data-close>Keep editing</button>
      </div>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form')!;
    const error = dialog.querySelector<HTMLElement>('.portal-error')!;
    const submit = dialog.querySelector<HTMLButtonElement>('.developer-publish-submit')!;
    if (!plan) { error.textContent = 'This apartment has no original plan image attached, so it cannot be published as a plan bundle. Start from Upload a blueprint in your studio.'; error.hidden = false; }
    const close = () => dialog?.close();
    dialog.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(item => { item.onclick = close; });
    dialog.addEventListener('close', () => {
      dialog?.remove(); dialog = null;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    }, { once: true });
    form.onsubmit = async event => {
      event.preventDefault();
      if (!plan || submit.disabled) return;
      const data = new FormData(form);
      const name = String(data.get('name') ?? '').trim();
      const bedrooms = Number(data.get('bedrooms')), area = Number(data.get('area'));
      if (!name) { error.textContent = 'Give this plan a name.'; error.hidden = false; return; }
      if (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 20) { error.textContent = 'Bedrooms must be a whole number from 0 to 20.'; error.hidden = false; return; }
      if (!Number.isFinite(area) || area < 1 || area > 5000) { error.textContent = 'Area must be between 1 and 5000 m².'; error.hidden = false; return; }
      // Snapshot now: edits made while the request runs stay unpublished.
      const revision = host.revision();
      const snapshot = bundleSnapshot(host.scene(), host.products());
      submit.disabled = true; error.hidden = true;
      submit.innerHTML = `${updating ? 'Updating' : 'Publishing'}… <span class="developer-spinner" aria-hidden="true"></span>`;
      try {
        const input = { name, building: String(data.get('building') ?? '').trim() || null, bedrooms, area, ...snapshot, blueprint: plan };
        const bundle = published ? await developerApi.updateBundle(published.id, input) : await developerApi.publish(developer.slug, input);
        published = { id: bundle.id, revision };
        label(); startWatching();
        if (!dialog) { host.notify(`Published to ${developer.name}’s profile.`); return; }
        showDone(bundle.id, `${bundle.name} · ${bundle.area} m² · ${bedroomLabel(bundle.bedrooms)} is live on ${developer.name}’s profile.${host.revision() !== revision ? ' Later edits are not included yet; use Update on profile to add them.' : ''}`);
      } catch (cause) {
        if (!dialog) { host.notify(cause instanceof Error ? cause.message : 'Could not publish. Please try again.', true); return; }
        error.textContent = cause instanceof Error ? cause.message : 'Could not publish. Please try again.'; error.hidden = false;
        submit.disabled = false; submit.innerHTML = `${updating ? 'Update on profile' : 'Publish to profile'} ${icon('arrow')}`;
      }
    };
    dialog.showModal();
    if (!reduced()) dialog.animate([{opacity: 0, transform: 'translateY(12px) scale(.985)'}, {opacity: 1, transform: 'none'}], {duration: 320, easing: 'cubic-bezier(.16,1,.3,1)'});
    if (published && host.revision() === published.revision) showDone(published.id, `This version is on ${developer.name}’s profile.`);
  }

  function showDone(id: string, message: string) {
    if (!dialog) return;
    const done = dialog.querySelector<HTMLElement>('.developer-publish-done')!;
    const hide = [dialog.querySelector<HTMLElement>('form')!, dialog.querySelector<HTMLElement>('.developer-publish-lead')!, dialog.querySelector<HTMLElement>('#developer-publish-title')!];
    hide.forEach(element => { element.hidden = true; });
    done.querySelector('p')!.textContent = message;
    done.querySelector<HTMLAnchorElement>('[data-profile]')!.href = developerHref(developer.slug);
    done.querySelector<HTMLAnchorElement>('[data-visitor]')!.href = bundleHref(id);
    done.hidden = false;
    done.classList.toggle('is-animated', !reduced());
    done.querySelector<HTMLElement>('h2')!.focus({ preventScroll: true });
  }

  // The label follows edits after a publish, so an outdated profile copy is visible in the header.
  function startWatching() {
    if (timer) return;
    let last = -1;
    timer = window.setInterval(() => { const revision = host.revision(); if (revision !== last) { last = revision; label(); } }, 700);
  }

  return () => { clearInterval(timer); dialog?.close(); button.remove(); };
}
