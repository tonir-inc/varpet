/**
 * Opening a plan bundle: `/?bundle=<id>` or a catalog card. The card's model pane grows into a full sheet of
 * blueprint paper, the editor boots underneath it with the bundle's furnished scene, the sheet fades, and the
 * person lands in Design with the developer's design in front of them. Nothing is written to an account here.
 */
import { api } from './api';
import type { BundlePresentation } from './blueprint-presentation';
import { developerHref, catalogHref, type Bundle, type BundleSummary } from './bundles-contract';
import { BundleError, bundlesApi, restoreBundle } from './bundles';
import { BLUEPRINT_PAPER, setEditorSession } from './session';
import { escapeHtml } from './portal-header';
import './catalog.css';

export interface LaunchOptions {
  /** Already known from the card, so the sheet can name the plan before the scene arrives. */
  summary?: BundleSummary;
  /** Where the sheet grows from (the card's stage). */
  from?: DOMRect;
  /** The card's current model frame, carried on the sheet while the editor loads. */
  frame?: HTMLCanvasElement;
  /** A request already in flight for this bundle. */
  bundle?: Promise<Bundle>;
  /** Called once the editor is about to take over `host` (dispose the page that launched it). */
  beforeEditor?(): void;
  /** Overrides for the Design brief (Experimental flats name who furnished them and link the developer's site). */
  presentation?: Partial<Pick<BundlePresentation, 'developerHref' | 'furnishedBy'>>;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolves true when the editor opened, false when the person went back from an error. */
export async function launchBundle(host: HTMLElement, id: string, options: LaunchOptions = {}): Promise<boolean> {
  const still = reducedMotion();
  const sheet = document.createElement('div');
  sheet.className = 'bundle-launch';
  sheet.style.setProperty('--paper', BLUEPRINT_PAPER);
  sheet.setAttribute('role', 'status');
  sheet.innerHTML = `<div class="bundle-launch-grid" aria-hidden="true"></div><div class="bundle-launch-frame" aria-hidden="true"></div>
    <div class="bundle-launch-copy"><span class="bundle-launch-eyebrow">02 / DESIGN</span><p class="bundle-launch-title"></p><p class="bundle-launch-note">Opening the furnished design</p></div>`;
  const title = sheet.querySelector<HTMLElement>('.bundle-launch-title')!;
  const note = sheet.querySelector<HTMLElement>('.bundle-launch-note')!;
  const name = (summary?: Pick<BundleSummary, 'name' | 'developerName'>) => summary ? `${summary.name} · ${summary.developerName}` : 'Plan from the catalog';
  title.textContent = name(options.summary);
  if (options.frame && options.frame.width && options.frame.height) {
    const copy = document.createElement('canvas');
    copy.width = options.frame.width; copy.height = options.frame.height;
    copy.getContext('2d')!.drawImage(options.frame, 0, 0);
    sheet.querySelector('.bundle-launch-frame')!.append(copy);
  }
  document.body.append(sheet);

  // The card's model pane opens into the sheet: a clip from its rectangle to the whole window.
  if (options.from && !still) {
    const r = options.from, w = innerWidth, h = innerHeight;
    const inset = `inset(${Math.max(0, r.top)}px ${Math.max(0, w - r.right)}px ${Math.max(0, h - r.bottom)}px ${Math.max(0, r.left)}px round 6px)`;
    sheet.animate([{ clipPath: inset }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: 620, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    sheet.querySelector('.bundle-launch-copy')!.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 260, easing: 'ease-out', fill: 'backwards' });
  }

  let handedOver = false;
  try {
    const bundle = await (options.bundle ?? bundlesApi.bundle(id));
    title.textContent = name(bundle);
    const [restored, user] = await Promise.all([restoreBundle(bundle), api.session().catch(() => null)]);
    note.textContent = 'Arranging the furniture';
    handedOver = true;
    options.beforeEditor?.();
    host.classList.remove('portal-host');
    setEditorSession({
      // Provenance for saves: team flats file it as a template copy, account apartments keep the bundle id.
      ...restored, user, apartment: null, templateId: `bundle:${bundle.id}`,
      presentation: {
        paper: BLUEPRINT_PAPER, arriving: true, workflow: 'design',
        bundle: { id: bundle.id, name: bundle.name, developerName: bundle.developerName, developerHref: developerHref(bundle.developerSlug),
          blueprintUrl: bundle.blueprintUrl, furnishedPieces: restored.scene.objects.length, ...options.presentation },
      },
    });
    const { editorView } = await import('../main');
    await editorView.ready();
    await sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 0 : 520, easing: 'ease-in-out', fill: 'forwards' }).finished;
    sheet.remove();
    editorView.arrive();
    return true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Please try again.';
    // A plan that is gone will not come back on retry; only offer it for failures that can pass.
    const retryable = !(cause instanceof BundleError && cause.status === 404);
    sheet.getAnimations().forEach(animation => animation.finish());
    sheet.classList.add('is-error');
    sheet.setAttribute('role', 'alert');
    sheet.querySelector('.bundle-launch-copy')!.innerHTML = `<span class="bundle-launch-eyebrow">Could not open this plan</span><p class="bundle-launch-title">${escapeHtml(title.textContent ?? '')}</p><p class="bundle-launch-note">${escapeHtml(message)}</p>
      <div class="bundle-launch-actions">${retryable ? '<button type="button" class="bundle-launch-retry">Try again</button>' : ''}<a class="bundle-launch-back${retryable ? '' : ' is-primary'}" href="${catalogHref}">Back to the catalog</a></div>`;
    const retry = sheet.querySelector<HTMLButtonElement>('.bundle-launch-retry');
    if (retry) retry.onclick = () => { location.assign(`/?bundle=${encodeURIComponent(id)}`); };
    (retry ?? sheet.querySelector<HTMLElement>('.bundle-launch-back')!).focus();
    // Before the hand-over the catalog is still underneath: going back just lifts the sheet.
    if (handedOver || !options.from) return new Promise<boolean>(() => {});
    return new Promise<boolean>(resolve => {
      sheet.querySelector<HTMLAnchorElement>('.bundle-launch-back')!.addEventListener('click', event => {
        event.preventDefault(); sheet.remove(); resolve(false);
      });
    });
  }
}
