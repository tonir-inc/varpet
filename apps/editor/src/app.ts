import './ui/style.css';
import './portal/portal.css';
import { api, AccountError } from './portal/api';
import { createTemplateScene } from './portal/templates';
import { restoreApartment, restoreApartmentSharing, setEditorSession } from './portal/session';
import { showAuth } from './portal/auth';

const host = document.querySelector<HTMLElement>('#app')!;
const route = new URLSearchParams(location.search);

async function start() {
  const templateId = route.get('template');
  const apartmentId = route.get('apartment');
  if (!templateId && !apartmentId && !route.has('editor')) {
    const {mountPortal} = await import('./portal/portal');
    await mountPortal(host, route.get('view') === 'apartments' ? 'apartments' : 'explore');
    return;
  }
  if (!templateId && !apartmentId && route.has('editor')) {
    // The sandbox uses the editor's local project and save/load path. Opening it
    // must not depend on an account service or turn the draft into a plan copy.
    host.innerHTML = '<main class="portal-loading" role="status">Opening the sandbox…</main>';
    await import('./main');
    return;
  }
  host.innerHTML = '<main class="portal-loading" role="status">Opening your apartment…</main>';
  let user = await api.session();
  if (apartmentId && !user) {
    user = await showAuth('login');
    if (!user) { location.replace('/?view=apartments'); return; }
  }
  const apartment = apartmentId ? await api.apartment(apartmentId) : null;
  const restored = apartment ? restoreApartment(apartment) : {scene:createTemplateScene(templateId ?? 'avani'), catalog:[]};
  let sharingSession = null, sharingError: string | undefined;
  if (apartment?.sharing) {
    try { sharingSession = await restoreApartmentSharing(apartment, restored.scene, restored.catalog); }
    catch (error) { sharingError = error instanceof Error ? error.message : 'Could not reconnect your shared link.'; }
  }
  setEditorSession({...restored, user, apartment, sharingSession, sharingError, templateId:apartment?.templateId ?? templateId ?? 'avani'});
  await import('./main');
}

void start().catch(error => {
  host.innerHTML = '<main class="portal-loading"><h1>Could not open this apartment</h1><p role="alert"></p><div><button class="button primary" id="startup-retry">Try again</button> <a class="button" href="/">Explore apartments</a></div></main>';
  host.querySelector('p')!.textContent = error instanceof AccountError && error.status === 404
    ? 'This apartment is unavailable for your account. Choose an apartment from My apartments.'
    : error instanceof Error ? error.message : 'Please try again.';
  host.querySelector<HTMLButtonElement>('#startup-retry')!.onclick = () => location.reload();
});
