import './style.css';
import records from 'virtual:showcase-data';
import { createViewport } from '../../editor/src/render/viewport';
import { buildFlats, number, price, summary, initialState, collectionDescription, type Flat } from './model';
import type { SceneDocument } from '../../editor/src/contracts';

const flats = buildFlats(records), app = document.querySelector<HTMLDivElement>('#app')!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const route = location.pathname.split('/').filter(Boolean), embed = route[0] === 'embed';
let dispose = () => {};
const area = (flat: Flat) => flat.area === null ? 'Area to confirm' : `${number(flat.area)} m²`;
const rooms = (flat: Flat) => flat.rooms === null ? 'Room count to confirm' : `${number(flat.rooms)} ${flat.rooms === 1 ? 'room' : 'rooms'}`;
const link = (flat: Flat) => `/flat/${encodeURIComponent(flat.id)}`;
const plan = (flat: Flat) => `<div class="plan-image"><img src="/plans/${encodeURIComponent(flat.id)}" alt="Developer floor plan for ${escape(flat.title)}" loading="lazy"/><div class="plan-placeholder" hidden><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 10h44v44H10zM10 34h23V10m0 24v20m0-20h21"/></svg><strong>Developer plan</strong><span>The original plan is not available on this device.</span></div></div>`;
function handleImages() { for (const image of app.querySelectorAll<HTMLImageElement>('.plan-image img')) { const absent = () => { image.hidden = true; image.parentElement!.querySelector<HTMLElement>('.plan-placeholder')!.hidden = false; }; image.onerror = absent; if (image.complete && !image.naturalWidth) absent(); } }
function header(back = false) { return `<header class="site-header"><a class="brand" href="/" aria-label="Varpet residences home"><span class="brand-mark">v</span>varpet<span class="brand-divider"></span><span class="brand-sub">Residences</span></a><a class="quiet-link" href="${back ? '/' : '#residences'}">${back ? 'All residences' : 'Explore the collection'} ${arrow}</a></header>`; }
function mountViewer(host: HTMLElement, flat: Flat, initial: 'shell' | 'furnished' = 'shell') {
  const stage = host.querySelector<HTMLElement>('.stage')!;
  const status = host.querySelector<HTMLElement>('.view-status')!;
  let scene: SceneDocument | null = initial === 'furnished' ? flat.furnished : flat.shell;
  if (!scene) { stage.innerHTML = '<div class="scene-placeholder"><strong>A new perspective is on its way.</strong><p>This apartment’s 3D view is being prepared.</p></div>'; host.dataset.ready = 'true'; return { setState() {}, dispose() {} }; }
  const viewport = createViewport(stage, { onSelect() {}, onTransform() {}, onInteraction() {}, onError(message) { status.textContent = message; status.classList.add('view-error'); } });
  viewport.setScene(scene, flat.catalog); viewport.setTool('select'); viewport.setSelection(null); viewport.setWalls('cutaway'); viewport.focus();
  const canvas = stage.querySelector('canvas'); canvas?.setAttribute('aria-label', 'Interactive apartment. Drag to orbit, right-drag to pan, scroll to zoom. Read-only view.');
  const setState = (state: 'shell' | 'furnished') => { const next = state === 'shell' ? flat.shell : flat.furnished; if (!next) return; scene = next; viewport.setScene(scene, flat.catalog); host.dataset.state = state; };
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-view]')) button.onclick = () => { const view = button.dataset.view === 'top' ? 'top' : 'perspective'; viewport.setView(view); for (const control of host.querySelectorAll('[data-view]')) control.setAttribute('aria-pressed', String(control === button)); };
  host.dataset.state = initial;
  requestAnimationFrame(() => requestAnimationFrame(() => { host.dataset.ready = 'true'; }));
  return { setState, dispose: () => viewport.dispose() };
}
const viewer = (embed = false) => `<div class="viewer ${embed ? 'embed-viewer' : ''}"><div class="stage"></div><div class="view-controls" role="group" aria-label="Apartment view"><button data-view="3d" aria-pressed="true">3D</button><button data-view="top" aria-pressed="false">Top</button></div><div class="view-status" role="status">Drag to explore · Scroll to zoom</div></div>`;
function gallery() {
  const first = flats.find(flat => flat.furnished || flat.shell) ?? flats[0]!;
  const ready = flats.filter(flat => !flat.example && flat.shell).length;
  app.innerHTML = `${header()}<main><section class="hero"><div class="hero-copy"><p class="eyebrow">Komitas Park · Yerevan</p><h1>A floor plan.<br/>A place to call <em>home.</em></h1><p class="lead">Step inside before you move in. Explore the space, see how it could feel, and imagine your life here.</p><a class="primary-link" href="#residences">Find your perspective ${arrow}</a><div class="collection-note">${ready ? `${ready} real apartments reconstructed` : 'Collection in preparation'}<span>${first.example ? 'Explore Avani, our furnished example' : 'Original plans. Interactive spaces.'}</span></div></div><div class="hero-stage">${viewer()}<div class="hero-caption"><span>${first.example ? 'Example residence · not a Komitas flat' : escape(first.title)}</span><a href="${link(first)}">Explore this home ${arrow}</a></div></div></section>
    <section class="collection" id="residences"><div class="section-heading"><div><p class="eyebrow">The collection</p><h2>Make room for possibility.</h2></div><p>${collectionDescription(flats)}</p></div>
    <div class="residence-grid">${flats.map(flat => `<a class="residence" href="${link(flat)}"><div class="residence-image">${plan(flat)}<span class="residence-tag">${flat.example ? 'Example residence' : flat.furnished ? 'Designer furnished' : flat.shell ? 'Explore in 3D' : 'Coming into view'}</span></div><div class="residence-info"><div><p class="eyebrow">${flat.example ? 'Varpet example' : 'Komitas Park'}</p><h3>${escape(flat.title)}</h3><p>${area(flat)} <span>·</span> ${rooms(flat)}</p></div><span class="round-arrow">${arrow}</span></div></a>`).join('')}</div></section>
    <section class="closing"><p class="eyebrow">From space to possibility</p><h2>Help buyers see a life here.</h2><p>An interactive apartment belongs beside its floor plan. Give every home its own view, and every buyer a starting point.</p></section></main><footer>Varpet residences <span>Illustrative reconstructions · availability and specifications to be confirmed with the developer</span></footer>`;
  const view = mountViewer(app.querySelector('.viewer')!, first, first.furnished ? 'furnished' : 'shell'); dispose = view.dispose; handleImages();
}
function detail(flat: Flat) {
  const initial = initialState(flat, new URLSearchParams(location.search).get('state'));
  document.title = `${flat.title} · Varpet residences`;
  app.innerHTML = `${header(true)}<main class="detail"><div class="detail-heading"><div><p class="eyebrow">${flat.example ? 'Avani · example residence' : 'Komitas Park · Yerevan'}</p><h1>${escape(flat.title)}</h1></div><div class="headline-facts"><strong>${area(flat)}</strong><span>${rooms(flat)}</span></div></div>
    <div class="state-switch" role="group" aria-label="Furnishing state"><button data-state="shell" aria-pressed="${initial === 'shell'}" ${flat.shell ? '' : 'disabled'}>As built <span>Empty shell</span></button><button data-state="furnished" aria-pressed="${initial === 'furnished'}" ${flat.furnished ? '' : 'disabled'}>${flat.example ? 'Furnished example' : 'Furnished by the designer'}<span>${flat.furnished ? 'A place to imagine living' : 'Being prepared'}</span></button></div>
    <div class="comparison"><section class="plan-pane"><div class="pane-title"><span>01</span><h2>The developer’s plan</h2></div>${plan(flat)}<p class="plan-caption">Original developer material · available only when supplied locally</p></section><section class="space-pane"><div class="pane-title"><span>02</span><h2>Step inside the space</h2></div>${viewer()}</section></div>
    <div class="detail-bottom"><section class="designer-story" id="designer"><p class="eyebrow">${flat.example ? 'An example of what is possible' : 'Furnished around a real request'}</p><h2>A home with you in mind.</h2>${flat.requests.length ? flat.requests.map((request, index) => `<blockquote>“${escape(request)}”</blockquote><p class="fine-print">${escape(flat.requestOutcomes[index] ?? 'Recorded customer request')}</p>`).join('') : `<p>${flat.example ? 'Avani shows the experience while the Komitas Park collection is prepared. Its furniture is an example, not a recorded designer conversation.' : 'The designer’s conversation for this residence is being prepared.'}</p>`}<p class="fine-print">${flat.example ? escape(flat.priceNote) : 'The furnished view reflects the recorded designer result. The original shell stays available for comparison.'}</p><button class="primary-link explore-furnished" ${flat.furnished ? '' : 'disabled'}>Explore the furnished home ${arrow}</button></section>
    <aside class="furnishing-facts"><p class="eyebrow">${flat.example ? 'Example furnishings' : 'What the designer added'}</p><div class="budget"><strong>${price(flat.total)}</strong><span>${flat.pieces.length} pieces${flat.furnished ? '' : ' · furnishing pending'}</span></div><p class="fine-print">${escape(flat.priceNote)}</p><details><summary>View the furniture</summary><ul>${flat.pieces.map(piece => `<li><span>${escape(piece.name)}</span><strong>${price(piece.price)}</strong></li>`).join('') || '<li>Furniture is being selected.</li>'}</ul></details><p class="fine-print">Area: ${escape(flat.areaSource)}. ${flat.issue ? escape(flat.issue) : 'Reconstruction is illustrative; confirm dimensions against the developer’s documents.'}</p><a class="quiet-link" href="/embed/${flat.id}">Open the embedded view ${arrow}</a></aside></div></main><footer>Varpet residences<span>Every home begins with a possibility.</span></footer>`;
  const host = app.querySelector<HTMLElement>('.viewer')!, view = mountViewer(host, flat, initial); dispose = view.dispose;
  const choose = (state: 'shell' | 'furnished') => { view.setState(state); for (const control of app.querySelectorAll('button[data-state]')) control.setAttribute('aria-pressed', String((control as HTMLElement).dataset.state === state)); };
  for (const button of app.querySelectorAll<HTMLButtonElement>('button[data-state]')) button.onclick = () => choose(button.dataset.state as 'shell' | 'furnished');
  app.querySelector<HTMLButtonElement>('.explore-furnished')!.onclick = () => { choose('furnished'); host.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); };
  handleImages();
  if (location.hash === '#designer') app.querySelector('#designer')?.scrollIntoView();
}
function embedded(flat: Flat) {
  document.body.classList.add('embed'); document.title = `${flat.title} · Interactive apartment`;
  app.innerHTML = `${viewer(true)}<div class="embed-title"><span class="eyebrow">${flat.example ? 'Avani example' : 'Komitas Park'}</span><strong>${escape(flat.title)}</strong><span>${area(flat)}${flat.rooms ? ` · ${rooms(flat)}` : ''}</span></div><a class="embed-cta" href="${link(flat)}#designer" target="_blank" rel="noopener">Furnish it with the designer ${arrow}</a><a class="embed-credit" href="/" target="_blank" rel="noopener">by varpet</a>`;
  const view = mountViewer(app.querySelector('.viewer')!, flat, flat.furnished ? 'furnished' : 'shell'); dispose = view.dispose;
}
const current = flats.find(flat => flat.id === route[1]);
if (!route.length) gallery(); else if ((route[0] === 'flat' || embed) && current) embed ? embedded(current) : detail(current);
else app.innerHTML = `${header(true)}<main class="not-found"><p class="eyebrow">Residence unavailable</p><h1>Let’s find another perspective.</h1><p>This residence has not been published yet.</p><a class="primary-link" href="/">Explore the collection ${arrow}</a></main>`;
Object.defineProperty(window, '__SHOWCASE__', { value: { flats: flats.map(summary), current: current?.id ?? null }, writable: false });
window.addEventListener('pagehide', () => dispose());
