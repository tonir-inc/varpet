import './sharing.css';

export type ShareAccess = 'view' | 'edit';

export interface SharingOptions {
  createLink(access: ShareAccess): Promise<string>;
  notice?(message: string): void;
  warning?(): string;
  saveDescription?: string;
}

let nextSharingId = 0;

/** Share controls only: persistence and permission creation belong to the caller. */
export function mountSharing(button: HTMLButtonElement, options: SharingOptions): { destroy(): void } {
  const id = `sharing-${++nextSharingId}`;
  const dialog = document.createElement('dialog');
  dialog.className = 'sharing-dialog';
  dialog.id = id;
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.setAttribute('aria-describedby', `${id}-description`);
  dialog.innerHTML = `
    <header class="sharing-header">
      <div>
        <h2 id="${id}-title">Share your progress</h2>
        <p id="${id}-description">Choose what people can do with your link.</p>
      </div>
      <button class="button quiet sharing-close" type="button" data-share-close aria-label="Close sharing">Close</button>
    </header>
    <fieldset class="sharing-access">
      <legend>Link access</legend>
      <label class="sharing-choice">
        <input type="radio" name="${id}-access" value="view" checked aria-describedby="${id}-view-description">
        <span class="sharing-choice-content">
          <span class="sharing-choice-title">View only <span class="sharing-recommended">Recommended</span></span>
          <span class="sharing-choice-description" id="${id}-view-description">Can explore your progress without changing it</span>
        </span>
      </label>
      <label class="sharing-choice">
        <input type="radio" name="${id}-access" value="edit" aria-describedby="${id}-edit-description">
        <span class="sharing-choice-content">
          <span class="sharing-choice-title">Can edit</span>
          <span class="sharing-choice-description" id="${id}-edit-description">Can make changes and save them to this shared project</span>
        </span>
      </label>
    </fieldset>
    <div class="sharing-explanation">
      <p data-share-save-description>Links show the latest saved progress. Save publishes your changes.</p>
      <p>Anyone with this link can access the project, including attached photos, plans and notes.</p>
    </div>
    <p class="sharing-local" data-share-local hidden>This link works on this computer only. Public sharing needs a hosted URL.</p>
    <p class="sharing-warning" data-share-warning hidden></p>
    <div class="sharing-result" data-share-result hidden>
      <label for="${id}-link">Your link</label>
      <input id="${id}-link" data-share-link type="text" readonly spellcheck="false" autocomplete="off" aria-describedby="${id}-status">
    </div>
    <p class="sharing-error" role="alert" data-share-error hidden></p>
    <footer class="sharing-footer">
      <p class="sharing-status" id="${id}-status" data-share-status role="status" aria-live="polite" aria-atomic="true"></p>
      <button class="button primary sharing-action" type="button" data-share-action>Create link</button>
    </footer>
  `;
  if (options.saveDescription) dialog.querySelector('[data-share-save-description]')!.textContent = options.saveDescription;
  const view = dialog.querySelector<HTMLInputElement>('input[value="view"]')!;
  const edit = dialog.querySelector<HTMLInputElement>('input[value="edit"]')!;
  const action = dialog.querySelector<HTMLButtonElement>('[data-share-action]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-share-close]')!;
  const link = dialog.querySelector<HTMLInputElement>('[data-share-link]')!;
  const result = dialog.querySelector<HTMLElement>('[data-share-result]')!;
  const status = dialog.querySelector<HTMLElement>('[data-share-status]')!;
  const error = dialog.querySelector<HTMLElement>('[data-share-error]')!;
  const warning = dialog.querySelector<HTMLElement>('[data-share-warning]')!;
  const local = dialog.querySelector<HTMLElement>('[data-share-local]')!;
  const listeners = new AbortController();
  const originalAttributes = new Map(['aria-haspopup', 'aria-controls', 'aria-expanded'].map(name => [name, button.getAttribute(name)]));
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', id);
  button.setAttribute('aria-expanded', 'false');
  document.body.append(dialog);

  let access: ShareAccess = 'view';
  let generation = 0;
  let busy = false;
  let destroyed = false;

  function setBusy(value: boolean): void {
    busy = value;
    action.disabled = value;
    action.setAttribute('aria-busy', String(value));
    action.textContent = value ? (link.value ? 'Copying…' : 'Creating…') : (link.value ? 'Copy link' : 'Create link');
  }

  function clearLink(): void {
    generation += 1;
    link.value = '';
    result.hidden = true;
    status.textContent = '';
    error.textContent = '';
    error.hidden = true;
    setBusy(false);
  }

  function reset(): void {
    access = 'view';
    view.checked = true;
    edit.checked = false;
    clearLink();
  }

  function isCurrent(request: number): boolean {
    return !destroyed && dialog.open && request === generation;
  }

  function openDialog(): void {
    if (destroyed || dialog.open) return;
    reset();
    warning.textContent = options.warning?.() ?? '';
    warning.hidden = !warning.textContent;
    const hostname = location.hostname.toLowerCase();
    local.hidden = !(hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || hostname === '0.0.0.0' || /^127\./.test(hostname));
    dialog.showModal();
    button.setAttribute('aria-expanded', 'true');
    view.focus();
  }

  function closeDialog(): void {
    reset();
    dialog.close();
    button.setAttribute('aria-expanded', 'false');
    button.focus();
  }

  async function createOrCopy(): Promise<void> {
    if (busy || destroyed || !dialog.open) return;
    const request = ++generation;
    error.hidden = true;
    error.textContent = '';
    setBusy(true);
    if (link.value) {
      status.textContent = 'Copying link…';
      try {
        await navigator.clipboard.writeText(link.value);
        if (!isCurrent(request)) return;
        setBusy(false);
        status.textContent = 'Link copied.';
        options.notice?.('Link copied.');
      } catch {
        if (!isCurrent(request)) return;
        setBusy(false);
        status.textContent = 'Copy it manually: the link is selected. Press Ctrl+C or ⌘C.';
        link.focus();
        link.select();
      }
      return;
    }
    status.textContent = 'Creating link…';
    try {
      const url = await options.createLink(access);
      if (!isCurrent(request)) return;
      if (!url.trim()) throw new Error('The sharing service returned an empty link.');
      link.value = url;
      result.hidden = false;
      setBusy(false);
      status.textContent = `${access === 'view' ? 'View-only' : 'Edit'} link ready.`;
    } catch (cause) {
      if (!isCurrent(request)) return;
      setBusy(false);
      status.textContent = '';
      const detail = cause instanceof Error ? cause.message.trim() : '';
      error.textContent = `Couldn’t create a link.${detail ? ` ${detail}` : ''} Try again.`;
      error.hidden = false;
    }
  }

  const eventOptions = { signal: listeners.signal };
  button.addEventListener('click', openDialog, eventOptions);
  close.addEventListener('click', closeDialog, eventOptions);
  action.addEventListener('click', () => void createOrCopy(), eventOptions);
  for (const radio of [view, edit]) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      access = radio.value as ShareAccess;
      clearLink();
    }, eventOptions);
  }
  link.addEventListener('click', () => link.select(), eventOptions);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  }, eventOptions);
  dialog.addEventListener('close', () => {
    // A queued native close event must not reset a newly reopened dialog.
    if (!dialog.open && !destroyed) {
      button.setAttribute('aria-expanded', 'false');
      reset();
      button.focus();
    }
  }, eventOptions);
  // Keep editor shortcuts outside the modal and wrap focus even when embedded in a frame.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const last = !action.disabled ? action : !result.hidden ? link : access === 'view' ? view : edit;
    if (event.shiftKey && document.activeElement === close) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      close.focus();
    }
  }, eventOptions);
  dialog.addEventListener('keyup', event => event.stopPropagation(), eventOptions);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      listeners.abort();
      if (dialog.open) dialog.close();
      dialog.remove();
      for (const [name, value] of originalAttributes) {
        if (value === null) button.removeAttribute(name);
        else button.setAttribute(name, value);
      }
    },
  };
}
