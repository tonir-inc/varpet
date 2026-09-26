import type { CatalogAsset, SceneDocument, SceneObject, Vec3 } from '../contracts';
import type { DesignerEvent } from '../adapters/designer-events';
import type { FinishViewport } from '../render/viewport';
import { designerPieceName, designerToolLabel } from './designer-steps';
import './design-construction.css';

type BuildEvent = Extract<DesignerEvent, { type: 'build' }>;
type Point = { x: number; y: number; visible: boolean };
interface BuildCard { root: HTMLElement; name: HTMLElement; state: HTMLElement; reason: HTMLElement }
interface PreviewMark {
  id: string;
  corners: Vec3[];
  group: SVGGElement;
  footprint: SVGPolygonElement;
  edges: SVGPathElement;
  card: HTMLElement;
  custom: boolean;
}

const NS = 'http://www.w3.org/2000/svg';
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
const BUILD_LABELS: Record<BuildEvent['state'], string> = {
  queued: 'Queued', building: 'Building', fixing: 'Refining', done: 'Model ready', failed: 'Could not build',
};
// Presentation durations only. These never imply progress by a designer or builder.
// Assembly staggers its parts over at most 1,400 ms, followed by a 380 ms landing.
const ASSEMBLY_SETTLE_MS = 1900;
const PLACEMENT_SETTLE_MS = 650;
const FADE_MS = 380;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; return node;
}

function bounds(object: SceneObject, asset: CatalogAsset): Vec3[] {
  const [w, h, d] = asset.dimensions.map((v, i) => v * object.scale[i]!) as Vec3;
  const c = Math.cos(object.rotation), s = Math.sin(object.rotation);
  const out: Vec3[] = [];
  for (const y of [0, h]) for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
    out.push([object.position[0] + dx! * c + dz! * s, object.position[1] + y, object.position[2] - dx! * s + dz! * c]);
  }
  return out;
}

/**
 * Disposable designer annotations over the existing live viewport.
 * Events are observations only: they cannot supply placement or modify a scene.
 * Call preview only after the caller has checked and displayed the proposal scene.
 */
export function createDesignConstruction(host: HTMLElement, viewport: FinishViewport) {
  const root = element('div', 'design-construction');
  root.hidden = true;
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('design-construction-drawing'); svg.setAttribute('aria-hidden', 'true');
  const cards = element('div', 'design-construction-pins');
  cards.setAttribute('aria-hidden', 'true');
  const activity = element('div', 'design-construction-activity');
  activity.setAttribute('role', 'status'); activity.setAttribute('aria-live', 'polite'); activity.hidden = true;
  const activityIcon = element('span', 'design-construction-activity-icon');
  activityIcon.setAttribute('aria-hidden', 'true');
  const activityText = element('span', 'design-construction-activity-text');
  activity.append(activityIcon, activityText);
  const rack = element('div', 'design-construction-builds');
  rack.setAttribute('aria-label', 'Furniture being built'); rack.setAttribute('role', 'list'); rack.tabIndex = 0;
  root.append(svg, cards, activity, rack); host.append(root);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const builds = new Map<string, BuildCard>();
  const marks = new Map<string, PreviewMark>();
  const presented = new Map<string, string>();
  const numbers = new Map<string, number>();
  let disposed = false, settleTimer = 0, fadeTimer = 0, fading = false;

  const numberFor = (id: string) => {
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
    return numbers.get(id)!;
  };
  const cancelTimers = () => {
    window.clearTimeout(settleTimer); window.clearTimeout(fadeTimer); settleTimer = 0; fadeTimer = 0;
  };
  const updateVisibility = () => {
    root.hidden = activity.hidden && rack.childElementCount === 0 && marks.size === 0;
  };
  const removeMarks = () => {
    cancelTimers();
    marks.clear(); svg.replaceChildren(); cards.replaceChildren();
    fading = false; root.classList.remove('is-settling'); updateVisibility();
  };

  // Reposition existing nodes on a renderer frame; never recreate DOM while the camera moves.
  const draw = () => {
    if (disposed || !marks.size) return;
    const width = host.clientWidth, height = host.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
    const placed: { x: number; y: number; width: number; height: number }[] = [];
    for (const mark of marks.values()) {
      const points = mark.corners.map(point => viewport.project(point));
      const visible = points.some(point => point?.visible);
      // A clipped wireframe may extend outside the canvas, but points behind the camera must not join.
      const valid = visible && points.every((point): point is Point => point !== null && Number.isFinite(point.x) && Number.isFinite(point.y));
      mark.group.style.display = valid ? '' : 'none'; mark.card.hidden = !valid;
      if (!valid) continue;
      const full = points as Point[];
      mark.footprint.setAttribute('points', full.slice(0, 4).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
      mark.edges.setAttribute('d', EDGES.map(([a, b]) => `M${full[a]!.x.toFixed(1)} ${full[a]!.y.toFixed(1)}L${full[b]!.x.toFixed(1)} ${full[b]!.y.toFixed(1)}`).join(''));
      const visiblePoints = full.filter(point => point.visible);
      const top = visiblePoints.reduce((best, point) => point.y < best.y ? point : best);
      const cardWidth = mark.card.offsetWidth, cardHeight = mark.card.offsetHeight;
      const x = Math.max(12, Math.min(width - cardWidth - 12, top.x - cardWidth / 2));
      let y = Math.max(12, Math.min(height - cardHeight - 12, top.y - cardHeight - 14));
      // A small deterministic stack keeps names legible while orbiting a dense proposal.
      for (let attempt = 0; attempt < 8; attempt++) {
        const overlap = placed.find(other => x < other.x + other.width + 6 && x + cardWidth + 6 > other.x
          && y < other.y + other.height + 6 && y + cardHeight + 6 > other.y);
        if (!overlap) break;
        const above = overlap.y - cardHeight - 6;
        y = above >= 12 ? above : Math.min(height - cardHeight - 12, overlap.y + overlap.height + 6);
      }
      mark.card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      placed.push({ x, y, width: cardWidth, height: cardHeight });
    }
  };

  const settle = () => {
    if (disposed || !marks.size || fading) return;
    if (viewport.loading()) {
      window.clearTimeout(settleTimer); settleTimer = 0;
      return;
    }
    if (settleTimer) return;
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      if (disposed || viewport.loading()) return;
      fading = true; root.classList.add('is-settling');
      fadeTimer = window.setTimeout(removeMarks, reducedMotion.matches ? 0 : FADE_MS);
    }, reducedMotion.matches ? 0 : [...marks.values()].some(mark => mark.custom) ? ASSEMBLY_SETTLE_MS : PLACEMENT_SETTLE_MS);
  };
  const stopFrames = viewport.onFrame(() => { draw(); settle(); });
  const resize = new ResizeObserver(draw); resize.observe(host);
  const motionChanged = () => {
    if (reducedMotion.matches && marks.size) { cancelTimers(); removeMarks(); }
  };
  reducedMotion.addEventListener('change', motionChanged);

  const clear = () => {
    removeMarks(); builds.clear(); presented.clear(); numbers.clear(); rack.replaceChildren();
    activity.hidden = true; activityText.textContent = ''; root.classList.remove('has-failure'); updateVisibility();
  };

  return {
    event(event: DesignerEvent): void {
      if (disposed) return;
      activity.hidden = false;
      if (event.type === 'tool') {
        activity.dataset.state = event.phase;
        // The service summary is bounded customer-facing text. Errors retain its reason.
        activityText.textContent = event.phase === 'error' ? event.summary : designerToolLabel(event);
      } else {
        let card = builds.get(event.slotId);
        if (!card) {
          const cardRoot = element('div', 'design-construction-build'); cardRoot.setAttribute('role', 'listitem');
          const number = element('span', 'design-construction-number'); number.textContent = String(numberFor(event.slotId)).padStart(2, '0');
          const text = element('div', 'design-construction-build-text');
          const name = element('strong', 'design-construction-build-name');
          const piece = designerPieceName(event.slotId).replace(/^(the |a )/, '');
          name.textContent = piece.charAt(0).toUpperCase() + piece.slice(1);
          const state = element('span', 'design-construction-build-state');
          const reason = element('span', 'design-construction-build-reason'); reason.hidden = true;
          text.append(name, state, reason); cardRoot.append(number, text); rack.append(cardRoot);
          card = { root: cardRoot, name, state, reason }; builds.set(event.slotId, card);
        }
        card.root.dataset.state = event.state; card.state.textContent = BUILD_LABELS[event.state];
        card.reason.hidden = !event.reason; card.reason.textContent = event.reason ?? '';
        activity.dataset.state = event.state;
        activityText.textContent = `${BUILD_LABELS[event.state]}: ${card.name.textContent}${event.reason ? ` — ${event.reason}` : ''}`;
        root.classList.toggle('has-failure', [...builds.values()].some(build => build.root.dataset.state === 'failed'));
      }
      updateVisibility();
    },
    preview(scene: SceneDocument, catalog: CatalogAsset[], changedIds: string[]): void {
      if (disposed) return;
      const objects = new Map(scene.objects.map(object => [object.id, object]));
      const assets = new Map(catalog.map(asset => [asset.id, asset]));
      const current = new Set(changedIds);
      for (const [id, mark] of marks) if (!current.has(id) || !objects.has(id)) {
        mark.group.remove(); mark.card.remove(); marks.delete(id);
      }
      let added = false;
      for (const id of current) {
        const object = objects.get(id), asset = object && assets.get(object.assetId);
        if (!object || !asset) continue;
        const signature = JSON.stringify([scene.id, object.assetId, object.position, object.rotation, object.scale, object.color, asset.source]);
        if (presented.get(id) === signature) continue;
        presented.set(id, signature);
        const old = marks.get(id); old?.group.remove(); old?.card.remove();
        const custom = asset.id.startsWith('custom-') || (asset.source.type === 'gltf' && asset.source.url.includes('/designer/files/'));
        const group = document.createElementNS(NS, 'g');
        const footprint = document.createElementNS(NS, 'polygon'); footprint.classList.add('design-construction-footprint');
        const edges = document.createElementNS(NS, 'path'); edges.classList.add('design-construction-wire');
        group.append(footprint, edges); svg.append(group);
        const card = element('div', 'design-construction-pin');
        const number = element('span', 'design-construction-number');
        number.textContent = String(numberFor(builds.has(asset.id) ? asset.id : id)).padStart(2, '0');
        const name = element('span', 'design-construction-pin-name'); name.textContent = object.name || asset.name;
        card.append(number, name); cards.append(card);
        marks.set(id, { id, corners: bounds(object, asset), group, footprint, edges, card, custom });
        // The caller owns the checked preview; these only animate its rendered models.
        if (!reducedMotion.matches) {
          if (custom) viewport.animateAssembly(id); else viewport.animatePlacement(id);
        }
        const build = builds.get(asset.id);
        if (build?.root.dataset.state === 'done') { build.root.remove(); builds.delete(asset.id); }
        added = true;
      }
      if (added) { cancelTimers(); fading = false; root.classList.remove('is-settling'); }
      // Keep failed builds visible after a successful partial proposal.
      activity.hidden = true; updateVisibility(); draw(); settle();
    },
    clear,
    dispose(): void {
      if (disposed) return;
      disposed = true; clear(); stopFrames(); resize.disconnect();
      reducedMotion.removeEventListener('change', motionChanged); root.remove();
    },
  };
}
