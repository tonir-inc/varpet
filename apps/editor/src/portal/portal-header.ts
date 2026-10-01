/**
 * The portal's shared page frame: brand, main navigation, account area, notice line and footer.
 * Every portal page (collection, catalog, saved apartments, developer profiles) uses it so the
 * navigation and the signed-in state look and behave the same everywhere.
 */
import { api, type User } from './api';
import { showAuth } from './auth';
import { mountThemeToggle } from '../ui/theme';
import { catalogHref } from './bundles-contract';
import './portal.css';

/** The nav item marked as the current page; `null` when the page is not one of the tabs (a developer profile). */
export type PortalTab = 'explore' | 'catalog' | 'apartments' | 'experimental' | null;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

const brand = '<a class="portal-brand" href="/" aria-label="Varpet home"><span class="portal-brand-mark" aria-hidden="true">v</span>varpet</a>';

/** Header markup only. `mountPortalAccount` fills its account area. */
export function renderPortalHeader(active: PortalTab): string {
  const current = (tab: PortalTab) => active === tab ? ' aria-current="page"' : '';
  return `<header class="portal-header"><div class="portal-header-inner">
      ${brand}
      <nav class="portal-nav" aria-label="Main navigation"><a href="/"${current('explore')}>Start with a plan</a><a href="${catalogHref}"${current('catalog')} title="Developer plans with a furnished 3D apartment">Catalog</a><a href="/?editor=sandbox" title="Explore an empty apartment and save to the team">Sandbox</a><a href="/?view=apartments"${current('apartments')}>Saved apartments</a><a href="/?view=experimental"${current('experimental')} title="Developer plans furnished for pitching">Experimental</a></nav>
      <div class="portal-account"><span class="portal-account-loading" role="status">Checking account…</span></div>
    </div></header>
    <div class="portal-notice" role="status" hidden></div>`;
}

export function renderPortalFooter(): string {
  return `<footer class="portal-footer">${brand}<p>A little planning. A place that feels like you.</p><span>Made for living.</span></footer>`;
}

export interface PortalAccountOptions {
  /** Offer "Create account" beside "Sign in" when signed out. */
  showSignup?: boolean;
  /** The account became known, changed (sign in / out), or the page was restored from the back-forward cache. */
  onUser?(user: User | null): void | Promise<void>;
  /** The session check failed; the header shows a reconnect button. */
  onUnavailable?(): void | Promise<void>;
}

export interface PortalAccount {
  user(): User | null;
  /** Re-check the session (e.g. when a cached page is shown again). */
  reload(): Promise<void>;
  dispose(): void;
}

/** Fills `.portal-account` inside `root`, mounts the theme toggle, and reports the signed-in user. */
export function mountPortalAccount(root: HTMLElement, options: PortalAccountOptions = {}): PortalAccount {
  const account = root.querySelector<HTMLElement>('.portal-account')!;
  const notice = root.querySelector<HTMLElement>('.portal-notice');
  const disposeTheme = mountThemeToggle(root.querySelector<HTMLElement>('.portal-header-inner')!);
  let currentUser: User | null = null;
  let disposed = false;
  let version = 0;

  function showNotice(message: string | null): void {
    if (!notice) return;
    notice.textContent = message ?? '';
    notice.hidden = !message;
  }

  function render(): void {
    account.innerHTML = currentUser
      ? `<a class="portal-account-profile" href="/?view=apartments" aria-label="${escapeHtml(currentUser.name)}’s apartments"><span class="portal-avatar" aria-hidden="true">${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</span><span>${escapeHtml(currentUser.name)}</span></a><button class="portal-text-button portal-signout" type="button">Sign out</button>`
      : `<button class="portal-text-button" type="button" data-login>Sign in</button>${options.showSignup ? '<button class="portal-button portal-header-signup" type="button" data-register>Create account</button>' : ''}`;
    account.querySelector('[data-login]')?.addEventListener('click', () => { void authenticate('login'); });
    account.querySelector('[data-register]')?.addEventListener('click', () => { void authenticate('register'); });
    account.querySelector('.portal-signout')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        await api.logout();
        if (disposed) return;
        ++version;
        currentUser = null;
        showNotice(null);
        render();
        await options.onUser?.(null);
      } catch (cause) {
        if (disposed) return;
        showNotice(cause instanceof Error ? cause.message : 'We could not sign you out. Please try again.');
        button.disabled = false;
      }
    });
  }

  async function authenticate(mode: 'login' | 'register'): Promise<void> {
    const user = await showAuth(mode);
    if (!user || disposed) return;
    ++version;
    currentUser = user;
    showNotice(null);
    render();
    await options.onUser?.(user);
  }

  async function reload(): Promise<void> {
    const request = ++version;
    try {
      const user = await api.session();
      if (disposed || request !== version) return;
      currentUser = user;
      showNotice(null);
      render();
      await options.onUser?.(user);
    } catch {
      if (disposed || request !== version) return;
      account.innerHTML = '<button class="portal-text-button" type="button" data-account-retry>Reconnect account</button>';
      account.querySelector('[data-account-retry]')!.addEventListener('click', () => { void reload(); });
      await options.onUnavailable?.();
    }
  }

  return {
    user: () => currentUser,
    reload,
    dispose() { disposed = true; disposeTheme(); },
  };
}

export interface PortalShell {
  /** The page's `<main>`; everything below the header belongs to the page. */
  main: HTMLElement;
  account: PortalAccount;
  dispose(): void;
}

/**
 * The whole frame in one call, for pages other than `portal.ts`: header with `active` marked, notice line,
 * an empty `<main>` and the footer. Call `account.reload()` to check the session (not done automatically,
 * so the page can render its own loading state first).
 */
export function mountPortalShell(host: HTMLElement, active: PortalTab, options: PortalAccountOptions & { className?: string } = {}): PortalShell {
  host.classList.add('portal-host');
  host.innerHTML = `<div class="portal ${options.className ?? ''}">${renderPortalHeader(active)}<main class="portal-main" id="portal-main"></main>${renderPortalFooter()}</div>`;
  const account = mountPortalAccount(host, options);
  return { main: host.querySelector<HTMLElement>('.portal-main')!, account, dispose: () => account.dispose() };
}
