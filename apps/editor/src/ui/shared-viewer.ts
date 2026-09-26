import { createViewport } from '../render/viewport';
import { readSharedProject, type ShareReference, type SharedProject } from '../core/sharing';
import { icon } from './icons';
import { mountThemeToggle } from './theme';

/** View links never mount the editor, its store, or mutation/proposal controls. */
export function mountSharedViewer(app: HTMLElement, reference: ShareReference, initial: SharedProject) {
  let project = initial;
  app.classList.add('shared-viewer');
  app.innerHTML = `<header class="app-header"><a class="brand" href="/" aria-label="Varpet home"><span class="brand-mark">v</span><span>varpet</span></a><div class="project-name"><strong id="shared-project-name"></strong></div><span class="shared-access">${icon('eye')} View only</span></header>
    <main class="shared-stage" aria-label="Shared apartment"><div id="shared-viewport"></div><div class="shared-view-controls" role="group" aria-label="Apartment view"><button class="button" data-shared-view="perspective" aria-pressed="true">${icon('cube')} 3D</button><button class="button" data-shared-view="top" aria-pressed="false">${icon('top')} Top</button><button class="button" id="shared-focus">${icon('focus')} Fit apartment</button></div><p class="shared-render-error" role="alert" hidden></p></main>
    <footer class="shared-footer"><div><strong>Shared progress</strong><p id="shared-updated"></p><p class="shared-help">Drag to look around. Refresh to see the latest saved progress.</p></div><button id="shared-refresh" class="button">Refresh progress</button><p id="shared-status" role="status"></p></footer>`;
  const status = app.querySelector<HTMLElement>('#shared-status')!;
  const disposeThemeToggle = mountThemeToggle(app.querySelector<HTMLElement>('.app-header')!);
  const viewport = createViewport(app.querySelector<HTMLElement>('#shared-viewport')!, {
    onSelect() {}, onTransform() {}, onInteraction() {},
    onError(message) { const error = app.querySelector<HTMLElement>('.shared-render-error')!; error.hidden = false; error.textContent = message; },
  });
  const render = () => {
    app.querySelector('#shared-project-name')!.textContent = project.scene.name;
    document.title = `${project.scene.name} · Shared progress · Varpet`;
    app.querySelector('#shared-updated')!.textContent = `Saved ${new Date(project.updatedAt).toLocaleString()} · Version ${project.version}`;
    viewport.setScene(project.scene, project.catalog); viewport.setTool('select'); viewport.setSelection(null);
  };
  render(); viewport.setWalls('cutaway'); viewport.focus();
  app.querySelector('canvas')?.setAttribute('aria-label', 'View-only apartment. Drag to orbit and scroll to zoom.');
  app.querySelectorAll<HTMLButtonElement>('[data-shared-view]').forEach(button => { button.onclick = () => {
    viewport.setView(button.dataset.sharedView === 'top' ? 'top' : 'perspective');
    app.querySelectorAll('[data-shared-view]').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
  }; });
  app.querySelector<HTMLButtonElement>('#shared-focus')!.onclick = () => viewport.focus();
  const refresh = app.querySelector<HTMLButtonElement>('#shared-refresh')!;
  refresh.onclick = async () => {
    refresh.disabled = true; status.textContent = 'Checking for saved progress…';
    try {
      const next = await readSharedProject(reference);
      if (next.version !== project.version) { project = next; render(); status.textContent = 'Latest saved progress loaded.'; }
      else status.textContent = 'You’re viewing the latest saved progress.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not refresh. Your current view is still available.'; }
    finally { refresh.disabled = false; }
  };
  window.addEventListener('pagehide', event => { if (!event.persisted) { disposeThemeToggle(); viewport.dispose(); } });
}
