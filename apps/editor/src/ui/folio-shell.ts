import './folio-shell.css';
import type { CatalogAsset, SceneDocument, ToolMode } from '../contracts';
import type { FinishViewport } from '../render/viewport';
import { buildQuote, sizeOf, type Ownership, type QuoteGroupId } from '../core/quote';

/**
 * The buyer's workspace in the Folio language: the designer on the left, the flat in the middle,
 * tools only where you touch them. Existing panels and controls are moved, never rebuilt, so their
 * handlers, ids and shortcuts keep working; panels that buyers rarely need live behind More.
 */
type Panel = 'scene' | 'assets' | 'assistant' | 'materials' | 'ceilings' | 'renovation';
type View = 'perspective' | 'top' | 'inside' | 'plan';
export interface FolioShellDeps {
  viewport: FinishViewport;
  getScene(): SceneDocument;
  getCatalog(): CatalogAsset[];
  getSelectedId(): string | null;
  getView(): View;
  setTool(tool: ToolMode): void;
  openPanel(panel: Panel): void;
  closePanel(): void;
  isPanelOpen(panel?: Panel): boolean;
  remove(): void;
  undo(): void;
  askAbout(id: string, label: string): void;
  toggleInspector(): void;
  isInspectorOpen(): boolean;
  currency: 'AMD' | null;
}

const paths: Record<string, string> = {
  swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  ask: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-3-6.2M20 4v4h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.2-1-1.4-1-2.4s.8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  lamp: '<path d="M9 21h6M12 17v4M6 13h12L15 4H9z"/>',
  walls: '<path d="M3 21V9l9-6 9 6v12M9 21v-6h6v6"/>',
  plug: '<path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4"/>',
  keys: '<rect x="2" y="6" width="20" height="12" rx="1"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  scale: '<path d="M4 9V4h5M15 20h5v-5M4 4l6 6M20 20l-6-6"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const button = (action: string, label: string, name: string, extra = '') => `<button type="button" class="folio-ib ${extra}" data-folio="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`;

export function money(value: number, currency: 'AMD' | null): string {
  const digits = Math.round(value).toLocaleString('en-US');
  return currency === 'AMD' ? `${digits} ֏` : digits;
}

export function mountFolioShell(deps: FolioShellDeps) {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);
  document.body.classList.add('folio');
  const shell = $('.viewport-shell')!;
  const original = new Set(deps.getScene().objects.map(object => object.id));
  const ownership = new Map<string, Ownership>();
  let menuOpen = false, toastTimer = 0;

  // Keep the existing controls and their handlers; give them visible homes in Folio.
  const dock = document.createElement('div');
  dock.className = 'folio-dock';
  dock.innerHTML = `<div class="folio-seg" data-slot="views"></div><div class="folio-seg" data-slot="light"></div>
    <div class="folio-seg" data-slot="actions"><button type="button" class="folio-action" data-folio="add" aria-label="Add furniture" aria-controls="assets-panel" aria-expanded="false">${icon('plus')}<span>Add furniture</span></button>${button('more', 'More tools', 'more')}</div>`;
  shell.append(dock);
  const views = document.querySelector('.view-switch');
  if (views) dock.querySelector('[data-slot=views]')!.append(views);
  const sun = document.getElementById('sun');
  if (sun) dock.querySelector('[data-slot=light]')!.append(sun);
  const topLighting = document.getElementById('top-lighting');
  if (topLighting) dock.querySelector('[data-slot=light]')!.prepend(topLighting);
  const sky = document.querySelector('.skybox-control');
  if (sky) dock.querySelector('[data-slot=light]')!.append(sky);
  const preview = document.getElementById('preview');
  if (preview) {
    preview.classList.add('folio-preview');
    dock.querySelector('[data-folio=more]')!.before(preview);
  }

  const rail = shell.querySelector<HTMLElement>('.tool-rail');
  if (rail) {
    rail.classList.add('folio-edit-tools');
    rail.insertAdjacentHTML('beforeend', `<div class="tool-divider"></div>${button('inspect', 'Selection properties', 'list')}`);
    rail.querySelector('[data-folio=inspect]')!.setAttribute('aria-controls', 'selection-properties');
  }

  const menu = document.createElement('div');
  menu.className = 'folio-menu'; menu.id = 'folio-tools-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  const more = dock.querySelector<HTMLButtonElement>('[data-folio=more]')!;
  more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-controls', menu.id); more.setAttribute('aria-expanded', 'false');
  const item = (action: string, label: string, name: string) => `<button type="button" role="menuitem" data-folio="${action}">${icon(name)}<span>${esc(label)}</span></button>`;
  menu.innerHTML = [item('panel:scene', 'Everything in the flat', 'list'), item('panel:materials', 'Colours and materials', 'palette'),
    item('panel:ceilings', 'Ceilings and lights', 'lamp'), item('panel:renovation', 'Walls and renovation', 'walls'),
    item('panel:assistant', 'Proposals and reconstruction', 'ask'), item('click:#walls', 'Wall visibility', 'walls'), item('click:#quality', 'Rendering quality', 'eye'),
    item('click:#preview', 'Clean preview', 'eye'), item('click:#file-menu', 'Files', 'file'), item('click:#integrations', 'Sources and connections', 'plug'),
    item('click:#help', 'Keyboard shortcuts', 'keys')].join('');
  shell.append(menu);

  // The floating toolbar sits on the selected piece and follows the camera.
  const toolbar = document.createElement('div');
  toolbar.className = 'folio-toolbar'; toolbar.hidden = true; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Selected piece');
  shell.append(toolbar);

  const toast = document.createElement('div');
  toast.className = 'folio-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  shell.append(toast);

  // Costs are a separate dialog; the right side is for furniture and selection.
  const quoteButton = document.createElement('button');
  quoteButton.type = 'button'; quoteButton.className = 'folio-quote'; quoteButton.dataset.folio = 'quote';
  quoteButton.title = 'What it costs, and who makes it';
  document.querySelector('.header-actions')?.prepend(quoteButton);
  const drawer = document.createElement('dialog');
  drawer.className = 'folio-drawer'; drawer.id = 'folio-costs'; drawer.setAttribute('aria-label', 'What it costs, and who makes it');
  quoteButton.setAttribute('aria-haspopup', 'dialog'); quoteButton.setAttribute('aria-controls', drawer.id);
  drawer.addEventListener('keydown', event => event.stopPropagation());
  drawer.addEventListener('click', event => { if (event.target === drawer) {
    const rect = drawer.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) drawer.close();
  } });
  shell.append(drawer);

  const assets = () => new Map(deps.getCatalog().map(asset => [asset.id, asset]));
  const quote = () => buildQuote({ scene: deps.getScene(), catalog: deps.getCatalog(), original, ownership, custom: new Set(deps.getCatalog().filter(a => a.id.startsWith('custom-')).map(a => a.id)), keys: new Map() });
  const groupText: Record<QuoteGroupId, { title: string; who: string }> = {
    shop: { title: 'Yerevan shops', who: 'Example shops, no agreements yet' },
    workshop: { title: 'Made to measure', who: 'Example workshop; estimates the workshop confirms' },
    developer: { title: 'In the flat now, from the developer', who: 'Real products. Buy them, or mark the ones you already own.' },
    yours: { title: 'Already yours', who: 'Costs nothing' },
  };

  function renderQuote() {
    const q = quote();
    quoteButton.innerHTML = `${icon('receipt')}<span class="folio-num">${money(q.total, deps.currency)}</span>`;
    if (!drawer.open) return;
    drawer.innerHTML = `<header><h2>What it costs</h2>${button('quote', 'Close', 'close')}</header>
      ${q.groups.map(group => `<section class="folio-group"><h3>${esc(groupText[group.id].title)}</h3><p>${esc(groupText[group.id].who)}</p>
        ${group.lines.map(line => `<div class="folio-line"><span>${esc(line.name)}${line.count > 1 ? ` × ${line.count}` : ''}<small class="folio-num">${esc(line.size)}</small></span>
          <span class="folio-num">${line.unit === null ? '–' : money(line.unit * line.count, deps.currency)}${line.note ? `<small>${esc(line.note)}</small>` : ''}</span></div>`).join('')}</section>`).join('')}
      <div class="folio-total"><span>To make this flat real</span><strong class="folio-num">${money(q.total, deps.currency)}</strong></div>
      <p class="folio-note">${deps.currency ? 'Sample prices.' : 'Demo prices with no currency.'} ${q.real} of ${q.pieces} pieces are products you can buy or already own.</p>`;
  }

  function renderToolbar() {
    const id = deps.getSelectedId();
    const scene = deps.getScene();
    const object = id ? scene.objects.find(o => o.id === id) : undefined;
    const asset = object && assets().get(object.assetId);
    if (!object || !asset || deps.getView() === 'inside' || deps.getView() === 'plan') { toolbar.hidden = true; toolbar.dataset.id = ''; return; }
    if (toolbar.dataset.id !== object.id || toolbar.dataset.owned !== String(ownership.get(object.id) === 'owned')) {
      toolbar.dataset.id = object.id; toolbar.dataset.owned = String(ownership.get(object.id) === 'owned');
      const owned = ownership.get(object.id) === 'owned';
      toolbar.innerHTML = `<span class="folio-who"><strong>${esc(object.name)}</strong><span class="folio-num">${owned ? 'Yours' : asset.price > 0 ? money(asset.price, deps.currency) : sizeOf(asset, object)}</span></span>
        ${button('tool:move', 'Move', 'move')}${button('tool:rotate', 'Turn', 'rotate')}${button('tool:scale', 'Resize', 'scale')}${button('swap', 'Swap for one that fits', 'swap')}${button('colour', 'Colour', 'drop')}
        ${button('remove', 'Remove', 'trash')}${original.has(object.id) ? button('own', owned ? 'Not mine' : 'I already own this', 'receipt', owned ? 'on' : '') : ''}${button('ask', 'Ask the designer about it', 'ask', 'folio-ask')}`;
    }
    toolbar.hidden = false;
    place();
  }
  function place() {
    const id = toolbar.dataset.id; if (!id || toolbar.hidden) return;
    const object = deps.getScene().objects.find(o => o.id === id), asset = object && assets().get(object.assetId);
    if (!object || !asset) return;
    const top = deps.viewport.project([object.position[0], asset.dimensions[1] * object.scale[1], object.position[2]]);
    if (!top) return;
    const width = shell.clientWidth, x = Math.min(Math.max(top.x, toolbar.offsetWidth / 2 + 12), width - toolbar.offsetWidth / 2 - 12);
    const railBottom = rail && rail.offsetHeight ? rail.offsetTop + rail.offsetHeight : 0;
    const y = Math.min(dock.offsetTop - 12, Math.max(top.y - 18, toolbar.offsetHeight + railBottom + 12));
    toolbar.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
    toolbar.classList.toggle('offscreen', !top.visible);
  }
  const stopFrames = deps.viewport.onFrame(place);

  function showToast(message: string) {
    toast.innerHTML = `<span>${esc(message)}</span>${button('undo', 'Undo', 'undo')}`;
    toast.hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6000);
  }

  function setMenu(open: boolean, focus = false) {
    menuOpen = open; menu.hidden = !open; more.setAttribute('aria-expanded', String(open));
    if (focus) (open ? menu.querySelector<HTMLButtonElement>('button') : more)?.focus();
  }

  const onClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-folio]');
    if (!target) { if (menuOpen && !(event.target as HTMLElement).closest('.folio-menu')) setMenu(false); return; }
    const action = target.dataset.folio!;
    if (action !== 'more') setMenu(false);
    if (action === 'add') { deps.isPanelOpen('assets') ? deps.closePanel() : deps.openPanel('assets'); }
    else if (action === 'more') { update(); setMenu(!menuOpen, event.detail === 0); }
    else if (action.startsWith('panel:')) deps.openPanel(action.slice(6) as Panel);
    else if (action.startsWith('click:')) document.querySelector<HTMLElement>(action.slice(6))?.click();
    else if (action.startsWith('tool:')) deps.setTool(action.slice(5) as ToolMode);
    else if (action === 'swap') deps.openPanel('assets');
    else if (action === 'colour') deps.openPanel('materials');
    else if (action === 'remove') { const name = deps.getScene().objects.find(o => o.id === deps.getSelectedId())?.name ?? 'Piece'; deps.remove(); showToast(`${name} removed`); }
    else if (action === 'undo') { deps.undo(); toast.hidden = true; }
    else if (action === 'own') { const id = deps.getSelectedId(); if (id) ownership.set(id, ownership.get(id) === 'owned' ? 'placeholder' : 'owned'); update(); }
    else if (action === 'inspect') deps.toggleInspector();
    else if (action === 'ask') { const id = deps.getSelectedId(), object = deps.getScene().objects.find(o => o.id === id); if (id && object) deps.askAbout(id, object.name); }
    else if (action === 'quote') {
      if (drawer.open) drawer.close();
      else { drawer.showModal(); renderQuote(); drawer.querySelector<HTMLButtonElement>('button')?.focus(); }
    }
  };
  document.addEventListener('click', onClick);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (menuOpen) { event.preventDefault(); event.stopPropagation(); setMenu(false, true); }
    }
    if (menuOpen && menu.contains(document.activeElement) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  function update() {
    dock.querySelector('[data-folio=add]')?.setAttribute('aria-expanded', String(deps.isPanelOpen('assets')));
    const inspect = rail?.querySelector<HTMLButtonElement>('[data-folio=inspect]');
    if (inspect) {
      inspect.disabled = !deps.getSelectedId();
      inspect.setAttribute('aria-pressed', String(deps.isInspectorOpen()));
      inspect.setAttribute('aria-expanded', String(deps.isInspectorOpen()));
    }
    for (const [selector, label] of [['#walls', 'Wall visibility'], ['#quality', 'Rendering quality'], ['#preview', 'Clean preview']]) {
      const item = menu.querySelector<HTMLElement>(`[data-folio="click:${selector}"] span`);
      if (item) item.textContent = selector === '#preview' && preview?.getAttribute('aria-pressed') === 'true' ? 'Exit preview' : `${label}${selector !== '#preview' ? ` · ${$(selector!)?.textContent?.trim() ?? ''}` : ''}`;
    }
    renderToolbar(); renderQuote();
  }
  update();
  return {
    update,
    dispose() { drawer.close(); drawer.remove(); clearTimeout(toastTimer); stopFrames(); document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); },
  };
}
