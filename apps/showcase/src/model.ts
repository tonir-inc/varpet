import type { CatalogAsset, SceneDocument } from '../../editor/src/contracts';
import { validateScene } from '../../editor/src/core/validation';
import { demoScene, localCatalog } from '../../editor/src/core/demo';

export type FlatState = 'shell' | 'drawn' | 'furnished';
type AssetRecords = CatalogAsset[] | { assets: CatalogAsset[]; currency?: string };
interface DrawnAudit { drawn: number; placed: number; omitted: { role: string; name: string; reason: string }[] }
export interface InputRecord { id: string; planAvailable?: boolean; facts: Record<string, unknown>; shell: SceneDocument | null; furnished: SceneDocument | null; drawn?: SceneDocument | null; drawnCatalog?: AssetRecords; drawnAudit?: DrawnAudit | null; catalog: AssetRecords; conversation: Record<string, unknown> | null }
export interface Flat { id: string; planAvailable: boolean; title: string; example: boolean; shell: SceneDocument | null; furnished: SceneDocument | null; catalog: CatalogAsset[]; drawn: SceneDocument | null; drawnCatalog: CatalogAsset[]; drawnAudit: DrawnAudit | null; drawnNote: string; area: number | null; rooms: number | null; areaSource: string; requests: string[]; requestOutcomes: string[]; pieces: { id: string; name: string; price: number | null }[]; total: number | null; issue: string; priceNote: string }
const positive = (value: unknown): number | null => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function areaOf(scene: SceneDocument): number { return scene.rooms.reduce((sum, room) => sum + Math.abs(room.polygon.reduce((a, p, i) => { const q = room.polygon[(i + 1) % room.polygon.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2, 0); }
export function makeFlat(input: InputRecord): Flat {
  const { id, facts, conversation } = input;
  const catalog = Array.isArray(input.catalog) ? input.catalog : input.catalog.assets;
  let shell = input.shell, furnished = input.furnished, drawn = input.drawn ?? null, issue = '';
  const drawnCatalog = Array.isArray(input.drawnCatalog) ? input.drawnCatalog : input.drawnCatalog?.assets ?? [];
  if (drawn && !validateScene(drawn, drawnCatalog).ok) { drawn = null; issue = 'The developer-drawn view is awaiting complete, checked furniture records.'; }
  const drawnAudit = input.drawnAudit ?? null;
  const omissions = new Map<string, number>();
  for (const item of drawnAudit?.omitted ?? []) { const role = (item.role || item.name || 'piece').replaceAll('_', ' '); omissions.set(role, (omissions.get(role) ?? 0) + 1); }
  const drawnNote = drawnAudit ? `${drawnAudit.placed} of ${drawnAudit.drawn} drawn pieces shown; ${drawnAudit.drawn - drawnAudit.placed} not placed. Missing catalog matches or blocked positions: ${[...omissions].map(([role, count]) => `${role} × ${count}`).join(', ') || 'none recorded'}.` : 'Completeness has not been confirmed; a placement audit is not available.';
  if (shell) { const check = validateScene(shell, catalog); if (!check.ok) { shell = null; issue = `The reconstructed shell is awaiting review. ${check.errors.join(' ')}`; } }
  if (furnished) { const check = validateScene(furnished, catalog); if (!check.ok) { furnished = null; issue = 'The furnished view is awaiting complete, checked furniture records.'; } }
  const requests = Array.isArray(conversation?.requests) ? conversation.requests.filter((r): r is string => typeof r === 'string')
    : Array.isArray(conversation?.steps) ? conversation.steps.map(step => typeof step === 'object' && step ? (step as { request?: unknown }).request : undefined).filter((r): r is string => typeof r === 'string') : [];
  const steps = Array.isArray(conversation?.steps) ? conversation.steps.filter((step): step is Record<string, unknown> => Boolean(step && typeof step === 'object' && typeof (step as {request?: unknown}).request === 'string')) : [];
  const requestOutcomes = steps.map(step => step.outcome === 'proposal' && step.editor_accepted === true ? 'Applied to this view' : step.outcome === 'question' ? 'Designer asked a question' : step.outcome === 'decline' ? 'Designer declined this request' : 'Recorded request; no applied change confirmed');
  const currency = conversation?.catalogCurrency ?? conversation?.currency ?? (!Array.isArray(input.catalog) ? input.catalog.currency : undefined);
  const previousIds = new Set(shell?.objects.map(object => object.id));
  const pieces = (furnished?.objects ?? []).filter(object => !previousIds.has(object.id)).map(object => {
    const asset = catalog.find(asset => asset.id === object.assetId);
    return { id: object.id, name: asset?.name ?? object.name, price: currency === 'AMD' && asset && Number.isSafeInteger(asset.price) && asset.price >= 0 ? asset.price : null };
  });
  const developerArea = positive(facts.area_m2 ?? facts.area ?? facts.total_area_m2 ?? facts.total_area);
  return { id, planAvailable: input.planAvailable === true, title: `Residence ${id.replace(/^b/, '').replace('-t', ' · ')}`, example: false, shell, furnished, catalog, drawn, drawnCatalog, drawnAudit, drawnNote,
    area: developerArea ?? (shell || drawn || furnished ? areaOf((shell ?? drawn ?? furnished)!) : null), rooms: positive(facts.rooms ?? facts.room_count), areaSource: developerArea ? 'Developer plan' : 'Derived from the reconstructed floor',
    requests, requestOutcomes, pieces, total: furnished && pieces.every(piece => piece.price !== null) ? pieces.reduce((sum, piece) => sum + piece.price!, 0) : null,
    issue, priceNote: furnished ? 'Catalog estimates in AMD; not a retailer quotation. Paint and labour excluded.' : 'Furniture selection and pricing are being prepared.' };
}
export function exampleFlat(): Flat {
  const shell = structuredClone(demoScene); shell.objects = [];
  return { id: 'avani', planAvailable: false, title: 'The Avani apartment', example: true, shell, furnished: demoScene, catalog: localCatalog, drawn: null, drawnCatalog: [], drawnAudit: null, drawnNote: '',
    area: areaOf(shell), rooms: null, areaSource: 'Derived from the example scene', requests: [], requestOutcomes: [],
    pieces: demoScene.objects.map(object => ({ id: object.id, name: object.name, price: null })), total: null, issue: '',
    priceNote: 'Example furniture. No designer run or AMD purchase quote is claimed.' };
}
export function buildFlats(records: InputRecord[]): Flat[] { const flats = records.map(makeFlat); return flats.some(flat => flat.shell || flat.furnished || flat.drawn) ? flats : [...flats, exampleFlat()]; }
export const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 });
export const price = (value: number | null) => value === null ? 'Not quoted' : `${number(value)} ֏`;
export const summary = (flat: Flat) => ({ id: flat.id, title: flat.title, example: flat.example, area_m2: flat.area, area_source: flat.areaSource, rooms: flat.rooms, shell_ready: Boolean(flat.shell), furnished_ready: Boolean(flat.furnished), drawn_ready: Boolean(flat.drawn), drawn_note: flat.drawnNote, drawn_audit: flat.drawnAudit, added_pieces: flat.pieces, total_amd: flat.total, price_note: flat.priceNote, requests: flat.requests, request_outcomes: flat.requestOutcomes });

export const initialState = (flat: Flat, requested: string | null): FlatState => {
  if ((requested === 'shell' || requested === 'drawn' || requested === 'furnished') && flat[requested]) return requested;
  return flat.shell ? 'shell' : flat.furnished ? 'furnished' : flat.drawn ? 'drawn' : 'shell';
};
export const collectionDescription = (flats: Flat[]) => { const real = flats.filter(flat => !flat.example); return real.length ? `${real.length} residences · ${real.filter(flat => flat.furnished).length} furnished views${flats.some(flat => flat.example) ? ' · Avani example available' : ''}` : 'Ten Komitas Park residences are being prepared. Start with the Avani example.'; };

/** Standalone pages have no editor API. Preserve source identities and resolve only its optimization URLs. */
export function publicModelResolver(flats: Flat[], optimizationUrl: (url: string) => string | undefined, mirror?: string): (url: string) => string {
  const sources = new Map<string, string>();
  for (const flat of flats) for (const asset of [...flat.catalog, ...flat.drawnCatalog]) {
    if (asset.source.type !== 'gltf') continue;
    const original = asset.source.url.split('#')[0]!;
    const optimized = optimizationUrl(original);
    if (!optimized) continue;
    if (sources.has(optimized) && sources.get(optimized) !== original) throw new Error(`Conflicting model sources for ${optimized}`);
    sources.set(optimized, original);
  }
  return url => sources.has(url) ? mirror ? new URL(url.split('/').pop()!, `${mirror.replace(/\/$/, '')}/`).href : sources.get(url)! : url;
}
