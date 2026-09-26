import { api, type User } from './api';
import { icon } from '../ui/icons';
import './portal.css';

type AuthMode = 'login' | 'register';
let activeAuth: Promise<User | null> | null = null;

/** A shared account dialog for the welcome page and an unsaved editor session. */
export function showAuth(initialMode: AuthMode = 'login'): Promise<User | null> {
  if (activeAuth) return activeAuth;
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'portal-dialog auth-dialog';
  dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.setAttribute('aria-describedby', 'auth-description');
  document.body.append(dialog);

  let mode = initialMode;
  let busy = false;
  let finished = false;
  let settle: (user: User | null) => void;
  const result = new Promise<User | null>((resolve) => { settle = resolve; });
  activeAuth = result;

  function finish(user: User | null): void {
    if (finished) return;
    finished = true;
    dialog.close();
    dialog.remove();
    activeAuth = null;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    settle(user);
  }

  function render(): void {
    const registering = mode === 'register';
    dialog.innerHTML = `
      <div class="auth-topline"><a class="portal-brand" href="/" aria-label="Varpet home"><span class="portal-brand-mark" aria-hidden="true">v</span>varpet</a>
        <button class="portal-icon-button" type="button" aria-label="Close account dialog" data-auth-close>${icon('close')}</button></div>
      <p class="portal-eyebrow">Your space starts here</p>
      <h2 id="auth-title">${registering ? 'Make room for your ideas.' : 'Welcome home.'}</h2>
      <p id="auth-description" class="auth-description">${registering ? 'Create an account to save your apartments and pick up where you left off.' : 'Sign in to your account to continue working on your apartments.'}</p>
      <form class="auth-form">
        ${registering ? '<label class="portal-field">Name<input name="name" autocomplete="name" required maxlength="80" placeholder="Your name"></label>' : ''}
        <label class="portal-field">Email<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com" autocapitalize="none" spellcheck="false"></label>
        <label class="portal-field">Password<span class="auth-password-field"><input name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" required minlength="12" maxlength="128" ${registering ? 'aria-describedby="auth-password-hint"' : ''}><button class="auth-password-toggle" type="button" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></span></label>
        ${registering ? '<p id="auth-password-hint" class="portal-field-hint">Use 12–128 characters.</p>' : ''}
        <p class="portal-error auth-error" role="alert" hidden></p>
        <button class="portal-button portal-primary auth-submit" type="submit">${registering ? 'Create account' : 'Sign in'}${icon('arrow')}</button>
      </form>
      <p class="auth-switch">${registering ? 'Already have an account?' : 'New to Varpet?'} <button class="portal-text-button" type="button" data-auth-switch>${registering ? 'Sign in' : 'Create an account'}</button></p>
      <p class="auth-footnote">Your saved apartments stay in your account.</p>`;

    dialog.querySelector('[data-auth-close]')!.addEventListener('click', () => finish(null));
    dialog.querySelector('[data-auth-switch]')!.addEventListener('click', () => {
      if (busy) return;
      mode = registering ? 'login' : 'register';
      render();
      dialog.querySelector<HTMLInputElement>('input')!.focus();
    });
    const form = dialog.querySelector<HTMLFormElement>('form')!;
    const password = form.elements.namedItem('password') as HTMLInputElement;
    const toggle = dialog.querySelector<HTMLButtonElement>('.auth-password-toggle')!;
    toggle.addEventListener('click', () => {
      const reveal = password.type === 'password';
      password.type = reveal ? 'text' : 'password';
      toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      toggle.setAttribute('aria-pressed', String(reveal));
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
      const name = registering ? (form.elements.namedItem('name') as HTMLInputElement).value.trim() : '';
      const error = dialog.querySelector<HTMLParagraphElement>('.auth-error')!;
      if (registering && !name) {
        error.textContent = 'Enter your name to create an account.';
        error.hidden = false;
        return;
      }
      busy = true;
      error.hidden = true;
      form.setAttribute('aria-busy', 'true');
      const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('input, button'));
      controls.forEach((control) => { control.disabled = true; });
      const submit = dialog.querySelector<HTMLButtonElement>('.auth-submit')!;
      submit.textContent = registering ? 'Creating your account…' : 'Signing in…';
      try {
        const user = registering ? await api.register(name, email, password.value) : await api.login(email, password.value);
        window.dispatchEvent(new CustomEvent('varpet:auth-change', { detail: user }));
        finish(user);
      } catch (cause) {
        if (finished) return;
        error.textContent = cause instanceof Error ? cause.message : 'We could not connect. Please try again.';
        error.hidden = false;
        controls.forEach((control) => { control.disabled = false; });
        submit.innerHTML = `${registering ? 'Create account' : 'Sign in'}${icon('arrow')}`;
      } finally {
        busy = false;
        form.removeAttribute('aria-busy');
      }
    });
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!busy) finish(null);
  });
  dialog.addEventListener('close', () => finish(null));
  render();
  dialog.showModal();
  dialog.querySelector<HTMLInputElement>('input')!.focus();
  return result;
}
