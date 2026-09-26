import './ui/style.css';
import './ui/shared-viewer.css';
import { parseShareReference, readSharedProject, setSharedStartup } from './core/sharing';

const app = document.querySelector<HTMLElement>('#app')!;
async function boot() {
  try {
    const reference = parseShareReference(location.hash);
    if (!reference) { await import('./main'); return; }
    app.innerHTML = '<main class="share-loading"><span class="brand-mark">v</span><h1>Opening shared progress</h1><p role="status">Checking your link and loading the apartment…</p></main>';
    const project = await readSharedProject(reference);
    if (project.access === 'view') {
      const { mountSharedViewer } = await import('./ui/shared-viewer');
      mountSharedViewer(app, reference, project);
    } else {
      setSharedStartup({ reference, project });
      await import('./main');
    }
  } catch (error) {
    app.innerHTML = '<main class="share-loading"><span class="brand-mark">v</span><h1>This shared project couldn’t be opened</h1><p role="alert"></p><button class="button primary">Try again</button><a class="button quiet" href="/">Open your own editor</a></main>';
    app.querySelector('[role="alert"]')!.textContent = error instanceof Error ? error.message : 'Try again or ask for a new sharing link.';
    app.querySelector('button')!.onclick = () => location.reload();
  }
}
window.addEventListener('hashchange', () => location.reload());
void boot();
