import { icon } from './icons';
import './theme.css';

type Theme = 'light' | 'dark';
// Keep the tiny pre-paint reader in index.html in sync with this key/default.
const STORAGE_KEY = 'varpet.ui.theme.v1';
const subscribers = new Set<() => void>();
let current: Theme = 'light';
let initialized = false;

function readTheme(fallback: Theme = 'light'): Theme {
  try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return fallback; }
}

function applyTheme(theme: Theme): void {
  current = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#1e1f22' : '#f4f4f1');
  subscribers.forEach(render => render());
}

/** A browser preference only: never part of the apartment, history or lighting. */
export function initializeTheme(): void {
  if (initialized) return;
  initialized = true;
  applyTheme(readTheme());
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', onPageShow);
}

function onStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY || event.key === null) applyTheme(readTheme(current));
}

function onPageShow(event: PageTransitionEvent): void {
  if (event.persisted) applyTheme(readTheme(current));
}

/** The host should be outside account/scene content that is replaced on refresh. */
export function mountThemeToggle(host: HTMLElement): () => void {
  initializeTheme();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  button.setAttribute('aria-label', 'Dark theme');
  const render = () => {
    const dark = current === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.title = `Switch to ${dark ? 'light' : 'dark'} theme`;
    button.innerHTML = `${icon(dark ? 'moon' : 'sun')}<span class="theme-toggle-label">Theme</span>`;
  };
  const toggle = () => {
    applyTheme(current === 'dark' ? 'light' : 'dark');
    try { localStorage.setItem(STORAGE_KEY, current); }
    catch { /* The selected theme still works for this page when storage is unavailable. */ }
  };
  render();
  subscribers.add(render);
  button.addEventListener('click', toggle);
  host.append(button);
  return () => {
    subscribers.delete(render);
    button.removeEventListener('click', toggle);
    button.remove();
  };
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('storage', onStorage);
  window.removeEventListener('pageshow', onPageShow);
  subscribers.clear();
});
