import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/*
 * Developer profiles and plan bundles (BUNDLE_API in src/portal/bundles-contract.ts).
 *
 * Reads are public: sample bundles shipped read-only from `apartments/`, plus bundles published through a
 * developer profile. Writes belong to the signed-in account: the session cookie is checked against the
 * accounts database (`accounts.sqlite`, same data directory), so profiles reuse the account sign-in.
 * Published data lives in `developers.sqlite` next to it. See docs/developer-profiles.md.
 */

const COOKIE_NAME = 'varpet_session';
const MAX_BODY_BYTES = 24 * 1024 * 1024;
const MAX_BLUEPRINT_BYTES = 3 * 1024 * 1024;
const MAX_BUNDLES_PER_DEVELOPER = 100;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const RESERVED_SLUGS = new Set(['api', 'new', 'mine', 'studio', 'admin', 'varpet', 'sample', 'samples', 'catalog', 'developers', 'bundles']);
const BUNDLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const IMAGE_TYPES = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hashToken = token => createHash('sha256').update(token).digest('hex');
const repoRootDefault = fileURLToPath(new URL('../../../', import.meta.url));
const editorRoot = fileURLToPath(new URL('../', import.meta.url));

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const badRequest = message => new HttpError(400, 'invalid_request', message);
/** A concurrent create lost the race to a UNIQUE constraint: report it like the pre-check does. */
function unique(action, conflict) {
  try { return action(); }
  catch (error) { if (/UNIQUE constraint failed/.test(error?.message ?? '')) throw conflict; throw error; }
}

function send(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers });
  response.end(JSON.stringify(data));
}

function readBody(request, limit) {
  if ((request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume();
    return Promise.reject(new HttpError(415, 'content_type', 'Send this request as application/json.'));
  }
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => { request.off('data', onData); request.off('end', onEnd); request.off('error', onError); request.off('aborted', onError); };
    const fail = error => { cleanup(); request.resume(); reject(error); };
    const tooLarge = () => new HttpError(413, 'body_too_large', 'This upload is too large. Keep the plan image under 3 MB and the apartment under 24 MB.');
    const onData = chunk => { size += chunk.length; if (size > limit) fail(tooLarge()); else chunks.push(chunk); };
    const onEnd = () => {
      cleanup();
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!object(value)) throw badRequest('Send a JSON object.');
        resolveBody(value);
      } catch (error) { reject(error instanceof HttpError ? error : badRequest('The request contains invalid JSON.')); }
    };
    const onError = () => fail(badRequest('The request was interrupted.'));
    request.on('data', onData); request.on('end', onEnd); request.on('error', onError); request.on('aborted', onError);
    if (Number(request.headers['content-length']) > limit) fail(tooLarge());
  });
}

function cookieToken(request) {
  const cookie = (request.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

const text = (value, max, label, { required = true } = {}) => {
  const trimmed = typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : null;
  if (trimmed === null || trimmed.length > max || (required && !trimmed)) {
    throw badRequest(required ? `Enter ${label} of 1–${max} characters.` : `Keep ${label} under ${max} characters.`);
  }
  return trimmed;
};

function profileInput(body) {
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!SLUG.test(slug) || slug.includes('--')) throw badRequest('Choose a profile address of 3–48 lowercase letters, numbers and single hyphens.');
  let website = typeof body.website === 'string' ? body.website.trim() : '';
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    let url;
    try { url = new URL(website); } catch { throw badRequest('Enter a website such as https://example.com.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || website.length > 200 || !url.hostname.includes('.')) {
      throw badRequest('Enter a website such as https://example.com.');
    }
    website = url.href;
  }
  return {
    slug, name: text(body.name, 80, 'a company name'), city: text(body.city, 80, 'a city', { required: false }),
    tagline: text(body.tagline, 140, 'a tagline', { required: false }), about: text(body.about, 2000, 'the about text', { required: false }),
    website: website || null,
  };
}

/** Floor area of room polygons, m² (the shoelace sum the templates use). */
function polygonArea(scene) {
  return scene.rooms.reduce((total, room) => total + Math.abs((room.polygon ?? []).reduce((sum, p, i, all) => {
    const q = all[(i + 1) % all.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2, 0);
}
const roundArea = value => Math.round(value * 10) / 10;
// "Bedroom 2" counts; "Balcony · both bedrooms" or "Bedroom closet" does not.
const countBedrooms = scene => scene.rooms.filter(room => /bed ?room|спальн|ննջ/i.test(room.name ?? '')
  && !/balcon|bath|closet|wardrobe|hall|ensuite|lodg/i.test(room.name ?? '')).length;

function decodeBlueprint(value) {
  const match = typeof value === 'string' ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value) : null;
  if (!match) throw badRequest('Attach the original floor plan as a PNG, JPEG or WebP image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_BLUEPRINT_BYTES) throw badRequest('The floor plan image must be under 3 MB.');
  const magic = IMAGE_TYPES[match[1]];
  if (!magic.every((byte, i) => bytes[i] === byte) || (match[1] === 'image/webp' && bytes.toString('latin1', 8, 12) !== 'WEBP')) {
    throw badRequest('The floor plan file does not match its image type.');
  }
  return { type: match[1], bytes };
}

const modelUrl = url => typeof url === 'string' && (/^https:\/\//.test(url) || /^\/[^/\\]/.test(url)
  || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(url));

function catalogInput(value, referenced) {
  if (!Array.isArray(value) || value.length > 1000) throw badRequest('The furniture list must be a list of up to 1000 catalog products.');
  const wanted = new Set(referenced);
  const products = [];
  for (const product of value) {
    if (!object(product) || !object(product.asset) || typeof product.asset.id !== 'string'
      || typeof product.priceSource !== 'string' || product.priceSource.length > 200
      || typeof product.sizeStatus !== 'string' || product.sizeStatus.length > 200
      || typeof product.attribution !== 'string' || product.attribution.length > 300) {
      throw badRequest('The furniture list contains an invalid catalog product.');
    }
    if (!wanted.has(product.asset.id) || products.some(known => known.asset.id === product.asset.id)) continue;
    if (object(product.asset.source) && product.asset.source.type === 'gltf' && !modelUrl(product.asset.source.url)) {
      throw badRequest(`“${String(product.asset.name ?? product.asset.id).slice(0, 80)}” uses a model address visitors cannot load.`);
    }
    products.push({ asset: product.asset, priceSource: product.priceSource, sizeStatus: product.sizeStatus, attribution: product.attribution });
  }
  return products;
}

/**
 * The editor's own `validateScene`, compiled for Node by Vite once per process. Returns
 * `{checkBundleScene, localCatalog, sceneCatalogIds}` (src/portal/developer-checks.ts).
 */
let checksPromise;
export function loadEditorChecks() {
  checksPromise ??= (async () => {
    const { build } = await import('vite');
    const output = await mkdtemp(join(tmpdir(), 'varpet-developer-checks-'));
    await build({ root: editorRoot, configFile: false, publicDir: false, logLevel: 'error', build: {
      ssr: join(editorRoot, 'src/portal/developer-checks.ts'), target: 'node22', outDir: output, emptyOutDir: false, minify: false,
      rolldownOptions: { output: { entryFileNames: 'developer-checks.mjs' } } } });
    return import(pathToFileURL(join(output, 'developer-checks.mjs')).href);
  })();
  checksPromise.catch(() => { checksPromise = undefined; });
  return checksPromise;
}

/** Catalog records the editor registers for a flat, as main.ts labels the bundled demo flat's models. */
const aboProduct = asset => ({ asset, priceSource: 'catalog · demo price', sizeStatus: 'catalog', attribution: 'Amazon Berkeley Objects, CC BY 4.0' });
const localProduct = asset => ({ asset, priceSource: 'illustrative demo price', sizeStatus: 'demo piece', attribution: 'Varpet demo furniture' });

const SAMPLE_NOTE = 'A sample collection prepared by Varpet from plans the developer published. Not a verified listing, offer or price list.';
const SAMPLE_DEVELOPERS = [
  { slug: 'sunday-towers', name: 'Sunday Towers', city: 'Yerevan', tagline: 'Building B · Arabkir, Yerevan',
    about: `${SAMPLE_NOTE} The plan and room areas come from the developer's published unit data for apartment B12121; Varpet traced it into 3D and furnished it with catalog pieces for illustration.` },
  { slug: 'orion', name: 'Orion', city: '', tagline: 'Top-floor plans from the developer’s floor-plate drawing',
    about: `${SAMPLE_NOTE} Types 7 and 8 were traced from the developer's floor-plate PDF, scaled to the printed total area, and furnished with catalog pieces for illustration. Location not supplied.` },
  { slug: 'm6', name: 'M6', city: '', tagline: 'A two-bedroom plan with two balconies',
    about: `${SAMPLE_NOTE} Traced from the M6 developer plan. The image has no printed dimensions, so the scale is an estimate from the printed room areas; the original plan and its measurement assumptions stay with the 3D model. Location not supplied.` },
];
const SAMPLE_BUNDLES = [
  { flat: 'sunday-b12121', developer: 'sunday-towers', name: 'B12121 · floor 12', building: 'Sunday Towers · B',
    area: root => Number(JSON.parse(readFileSync(join(root, 'apartment.json'), 'utf8')).data.surface_area) },
  { flat: 'orion-t7', developer: 'orion', name: 'Type 7 · top floor', building: 'Orion', area: printedTraceArea },
  { flat: 'orion-t8', developer: 'orion', name: 'Type 8 · top floor', building: 'Orion', area: printedTraceArea },
  { flat: 'm6-12-54', developer: 'm6', name: 'M6-12-54 · two balconies', building: null, local: true,
    area: root => Number(JSON.parse(readFileSync(join(root, 'areas.json'), 'utf8')).printedTotal) },
];
function printedTraceArea(root) {
  const match = /data-printed="([0-9.]+) m2"/.exec(readFileSync(join(root, 'trace.svg'), 'utf8').slice(0, 2000));
  return match ? Number(match[1]) : NaN;
}

/** Read-only samples from `apartments/`. A flat whose files are missing is skipped, never invented. */
function loadSamples(repoRoot) {
  const bundles = [];
  for (const sample of SAMPLE_BUNDLES) {
    const root = join(repoRoot, 'apartments', sample.flat);
    try {
      const blueprintPath = join(root, 'source.png');
      let scene, assets = null;
      if (sample.local) scene = JSON.parse(readFileSync(join(root, 'scene.furnished.json'), 'utf8'));
      else ({ scene, catalog: assets } = JSON.parse(readFileSync(join(root, 'startup.json'), 'utf8')));
      if (!object(scene) || !Array.isArray(scene.rooms) || !Array.isArray(scene.objects) || !existsSync(blueprintPath)) continue;
      let area = NaN;
      try { area = sample.area(root); } catch { /* fall back to the scene's rooms */ }
      const developer = SAMPLE_DEVELOPERS.find(item => item.slug === sample.developer);
      bundles.push({
        id: `sample-${sample.flat}`, developerSlug: developer.slug, developerName: developer.name, name: sample.name,
        building: sample.building, bedrooms: countBedrooms(scene),
        area: roundArea(Number.isFinite(area) && area > 0 ? area : polygonArea(scene)),
        blueprintUrl: `/api/bundles/sample-${sample.flat}/blueprint`, source: 'sample', furnishedPieces: scene.objects.length,
        updatedAt: statSync(join(root, sample.local ? 'scene.furnished.json' : 'startup.json')).mtime.toISOString(),
        scene, assets, local: Boolean(sample.local), blueprintPath,
      });
    } catch { /* A partial checkout keeps the other samples. */ }
  }
  return bundles;
}

/** Same-origin HTTP API. Requires Node >=22.13 (node:sqlite). */
export function createDevelopersHandler(options = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.VARPET_DATA_DIR ?? fileURLToPath(new URL('../.varpet', import.meta.url)));
  const repoRoot = resolve(options.repoRoot ?? repoRootDefault);
  const configuredOrigin = options.origin ?? process.env.VARPET_APP_ORIGIN;
  const appOrigin = configuredOrigin ? new URL(configuredOrigin).origin : null;
  const checks = options.checks ?? loadEditorChecks;
  const maxBodyBytes = Math.min(options.maxBodyBytes ?? MAX_BODY_BYTES, MAX_BODY_BYTES);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = join(dataDir, 'developers.sqlite');
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS developers (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      city TEXT NOT NULL, tagline TEXT NOT NULL, about TEXT NOT NULL, website TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bundles (
      id TEXT PRIMARY KEY, developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      name TEXT NOT NULL, building TEXT, bedrooms INTEGER NOT NULL, area REAL NOT NULL, pieces INTEGER NOT NULL,
      scene TEXT NOT NULL, catalog TEXT NOT NULL, blueprint BLOB NOT NULL, blueprint_type TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bundles_developer ON bundles(developer_id, updated_at);
  `);
  const samples = loadSamples(repoRoot);
  const sampleDevelopers = SAMPLE_DEVELOPERS.map(developer => ({ ...developer, website: null, logoUrl: null,
    bundles: samples.filter(bundle => bundle.developerSlug === developer.slug) })).filter(developer => developer.bundles.length);
  const reserved = slug => RESERVED_SLUGS.has(slug) || SAMPLE_DEVELOPERS.some(developer => developer.slug === slug);

  // Sessions belong to the accounts API; this handler only reads them.
  let accounts = null;
  const accountsPath = join(dataDir, 'accounts.sqlite');
  const signedInUser = request => {
    const token = cookieToken(request);
    if (!token) return null;
    if (!accounts) {
      if (!existsSync(accountsPath)) return null;
      accounts = new DatabaseSync(accountsPath);
      accounts.exec('PRAGMA busy_timeout = 5000;');
    }
    try {
      return accounts.prepare(`SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), Date.now()) ?? null;
    } catch { return null; } // Accounts not initialized yet: nobody is signed in.
  };
  const requireUser = request => {
    const user = signedInUser(request);
    if (!user) throw new HttpError(401, 'sign_in_required', 'Sign in to manage your developer profile.');
    return user;
  };
  const originFor = request => appOrigin ?? `${request.socket?.encrypted ? 'https' : 'http'}://${request.headers.host}`;

  const summaryOf = row => ({ id: row.id, developerSlug: row.slug, developerName: row.developer_name, name: row.name,
    building: row.building, bedrooms: row.bedrooms, area: row.area, blueprintUrl: `/api/bundles/${row.id}/blueprint`,
    source: 'published', furnishedPieces: row.pieces, updatedAt: row.updated_at });
  const sampleSummary = ({ scene, assets, local, blueprintPath, ...summary }) => summary;
  const bundleColumns = `bundles.id, bundles.name, bundles.building, bundles.bedrooms, bundles.area, bundles.pieces,
    bundles.updated_at, developers.slug, developers.name AS developer_name, developers.owner_id`;
  const publishedBundles = developerId => db.prepare(`SELECT ${bundleColumns} FROM bundles JOIN developers ON developers.id = bundles.developer_id
    ${developerId ? 'WHERE developers.id = ?' : ''} ORDER BY bundles.updated_at DESC, bundles.id`).all(...(developerId ? [developerId] : []));
  const developerRow = slug => db.prepare('SELECT * FROM developers WHERE slug = ?').get(slug);
  const developerSummary = row => ({ slug: row.slug, name: row.name, city: row.city, tagline: row.tagline, logoUrl: null,
    bundleCount: db.prepare('SELECT COUNT(*) AS count FROM bundles WHERE developer_id = ?').get(row.id).count });
  const developerFull = (row, user) => ({ ...developerSummary(row), about: row.about, website: row.website,
    ownedByViewer: Boolean(user && user.id === row.owner_id), bundles: publishedBundles(row.id).map(summaryOf) });
  const sampleDeveloperFull = developer => ({ slug: developer.slug, name: developer.name, city: developer.city, tagline: developer.tagline,
    bundleCount: developer.bundles.length, logoUrl: null, about: developer.about, website: null, ownedByViewer: false,
    bundles: developer.bundles.map(sampleSummary) });

  async function bundleInput(body, partial = false) {
    const name = text(body.name, 120, 'a plan name');
    const building = text(body.building, 80, 'the building name', { required: false }) || null;
    const scene = body.scene;
    if (!object(scene) || scene.format !== 'varpet.editor' || !Array.isArray(scene.rooms) || !Array.isArray(scene.objects)) {
      throw badRequest('Publish a Varpet apartment scene.');
    }
    const editor = await checks().catch(() => { throw new HttpError(503, 'checks_unavailable', 'Apartment checks are unavailable. Try again shortly.'); });
    let referenced;
    try { referenced = editor.sceneCatalogIds(scene); } catch (error) { throw badRequest(error instanceof Error ? error.message : 'Too many catalog products.'); }
    const catalog = catalogInput(body.catalog ?? [], referenced);
    const local = new Map(editor.localCatalog.map(asset => [asset.id, asset]));
    // Built-in demo pieces are part of the editor; supply them when the scene uses them.
    for (const id of referenced) if (!catalog.some(product => product.asset.id === id) && local.has(id)) catalog.push(localProduct(local.get(id)));
    const checked = editor.checkBundleScene(scene, catalog.map(product => product.asset));
    if (!checked.ok) throw new HttpError(422, 'invalid_scene', `This apartment does not pass the editor's checks: ${checked.errors.join(' ')}`.slice(0, 600));
    const bedrooms = body.bedrooms ?? countBedrooms(scene);
    if (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 20) throw badRequest('Bedrooms must be a whole number from 0 to 20.');
    const area = body.area ?? polygonArea(scene);
    if (typeof area !== 'number' || !Number.isFinite(area) || area < 1 || area > 5000) throw badRequest('Area must be between 1 and 5000 m².');
    const blueprint = partial && body.blueprint === undefined ? null : decodeBlueprint(body.blueprint);
    return { name, building, bedrooms, area: roundArea(area), pieces: scene.objects.length,
      scene: JSON.stringify(scene), catalog: JSON.stringify(catalog), blueprint };
  }

  function ownedBundle(id, user) {
    const row = db.prepare('SELECT bundles.id, developers.owner_id FROM bundles JOIN developers ON developers.id = bundles.developer_id WHERE bundles.id = ?').get(id);
    if (!row || samples.some(sample => sample.id === id)) throw new HttpError(404, 'not_found', 'This plan could not be found.');
    if (row.owner_id !== user.id) throw new HttpError(403, 'forbidden', 'Only the developer who published this plan can change it.');
  }

  async function fullBundle(id) {
    const sample = samples.find(bundle => bundle.id === id);
    if (sample) {
      let catalog = (sample.assets ?? []).map(aboProduct);
      if (sample.local) catalog = (await checks()).localCatalog.filter(asset => sample.scene.objects.some(item => item.assetId === asset.id)).map(localProduct);
      return { ...sampleSummary(sample), scene: sample.scene, catalog };
    }
    const row = db.prepare(`SELECT ${bundleColumns}, bundles.scene, bundles.catalog FROM bundles JOIN developers ON developers.id = bundles.developer_id WHERE bundles.id = ?`).get(id);
    if (!row) return null;
    return { ...summaryOf(row), scene: JSON.parse(row.scene), catalog: JSON.parse(row.catalog) };
  }

  let closed = false;
  const handler = async (request, response, next = () => send(response, 404, { error: 'Not found.', code: 'not_found' })) => {
    let url;
    try { url = new URL(request.url ?? '/', 'http://localhost'); } catch { return next(); }
    const path = url.pathname;
    if (path !== '/api/developers' && !path.startsWith('/api/developers/') && path !== '/api/bundles'
      && !path.startsWith('/api/bundles/') && path !== '/api/studio') return next();
    if (closed) return send(response, 503, { error: 'Profiles are restarting. Try again shortly.', code: 'unavailable' });
    try {
      const developerMatch = /^\/api\/developers\/([^/]{1,100})$/.exec(path);
      const publishMatch = /^\/api\/developers\/([^/]{1,100})\/bundles$/.exec(path);
      const bundleMatch = /^\/api\/bundles\/([^/]{1,100})$/.exec(path);
      const blueprintMatch = /^\/api\/bundles\/([^/]{1,100})\/blueprint$/.exec(path);
      const methods = path === '/api/developers' ? ['GET', 'POST'] : path === '/api/bundles' || path === '/api/studio' ? ['GET']
        : developerMatch ? ['GET', 'PUT'] : publishMatch ? ['POST'] : bundleMatch ? ['GET', 'PUT', 'DELETE'] : blueprintMatch ? ['GET'] : null;
      if (!methods) throw new HttpError(404, 'not_found', 'This endpoint does not exist.');
      if (!methods.includes(request.method)) {
        response.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'method_not_allowed', 'This endpoint does not support that method.');
      }
      if (request.method !== 'GET' && (!request.headers.origin || request.headers.origin !== originFor(request)
        || request.headers['sec-fetch-site'] === 'cross-site')) {
        throw new HttpError(403, 'origin_mismatch', 'This request must come from the Varpet page.');
      }
      const param = match => { try { return decodeURIComponent(match[1]); } catch { throw new HttpError(404, 'not_found', 'Not found.'); } };

      if (path === '/api/developers' && request.method === 'GET') {
        const published = db.prepare('SELECT * FROM developers ORDER BY updated_at DESC').all().map(developerSummary);
        const listed = [...sampleDevelopers.map(developer => ({ slug: developer.slug, name: developer.name, city: developer.city,
          tagline: developer.tagline, bundleCount: developer.bundles.length, logoUrl: null })), ...published];
        return send(response, 200, { developers: listed.sort((a, b) => b.bundleCount - a.bundleCount || a.name.localeCompare(b.name)) });
      }
      if (path === '/api/studio') {
        const user = signedInUser(request);
        const row = user ? db.prepare('SELECT * FROM developers WHERE owner_id = ?').get(user.id) : null;
        return send(response, 200, { user: user ? { id: user.id, name: user.name } : null, developer: row ? developerFull(row, user) : null });
      }
      if (path === '/api/developers') {
        const user = requireUser(request);
        const input = profileInput(await readBody(request, 32_768));
        if (reserved(input.slug)) throw new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.');
        if (db.prepare('SELECT id FROM developers WHERE owner_id = ?').get(user.id)) throw new HttpError(409, 'profile_exists', 'Your account already has a developer profile.');
        if (developerRow(input.slug)) throw new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.');
        const now = new Date().toISOString();
        unique(() => db.prepare(`INSERT INTO developers (id, owner_id, slug, name, city, tagline, about, website, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), user.id, input.slug, input.name, input.city, input.tagline, input.about, input.website, now, now),
          new HttpError(409, 'slug_taken', 'That profile address is taken, or your account already has a profile.'));
        return send(response, 201, { developer: developerFull(developerRow(input.slug), user) });
      }
      if (developerMatch) {
        const slug = param(developerMatch);
        if (request.method === 'GET') {
          const sample = sampleDevelopers.find(developer => developer.slug === slug);
          if (sample) return send(response, 200, { developer: sampleDeveloperFull(sample) });
          const row = developerRow(slug);
          if (!row) throw new HttpError(404, 'not_found', 'This developer profile could not be found.');
          return send(response, 200, { developer: developerFull(row, signedInUser(request)) });
        }
        const user = requireUser(request);
        const row = developerRow(slug);
        if (!row) throw new HttpError(404, 'not_found', 'This developer profile could not be found.');
        if (row.owner_id !== user.id) throw new HttpError(403, 'forbidden', 'Only the owner can edit this profile.');
        const input = profileInput(await readBody(request, 32_768));
        if (input.slug !== row.slug && (reserved(input.slug) || developerRow(input.slug))) throw new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.');
        unique(() => db.prepare(`UPDATE developers SET slug = ?, name = ?, city = ?, tagline = ?, about = ?, website = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
          .run(input.slug, input.name, input.city, input.tagline, input.about, input.website, new Date().toISOString(), row.id, user.id),
          new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.'));
        return send(response, 200, { developer: developerFull(developerRow(input.slug), user) });
      }
      if (publishMatch) {
        const user = requireUser(request);
        const row = developerRow(param(publishMatch));
        if (!row) throw new HttpError(404, 'not_found', 'This developer profile could not be found.');
        if (row.owner_id !== user.id) throw new HttpError(403, 'forbidden', 'Only the owner can publish to this profile.');
        const input = await bundleInput(await readBody(request, maxBodyBytes));
        if (db.prepare('SELECT COUNT(*) AS count FROM bundles WHERE developer_id = ?').get(row.id).count >= MAX_BUNDLES_PER_DEVELOPER) {
          throw new HttpError(409, 'too_many_bundles', `A profile can hold up to ${MAX_BUNDLES_PER_DEVELOPER} plans. Unpublish one first.`);
        }
        const id = `p-${randomUUID()}`, now = new Date().toISOString();
        db.prepare(`INSERT INTO bundles (id, developer_id, name, building, bedrooms, area, pieces, scene, catalog, blueprint, blueprint_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, row.id, input.name, input.building, input.bedrooms, input.area,
          input.pieces, input.scene, input.catalog, input.blueprint.bytes, input.blueprint.type, now, now);
        db.prepare('UPDATE developers SET updated_at = ? WHERE id = ?').run(now, row.id);
        return send(response, 201, { bundle: await fullBundle(id) });
      }
      if (path === '/api/bundles') {
        const slug = url.searchParams.get('developer');
        let bundles;
        if (slug) {
          const sample = sampleDevelopers.find(developer => developer.slug === slug);
          const row = sample ? null : developerRow(slug);
          bundles = sample ? sample.bundles.map(sampleSummary) : row ? publishedBundles(row.id).map(summaryOf) : [];
        } else bundles = [...samples.map(sampleSummary), ...publishedBundles().map(summaryOf)];
        return send(response, 200, { bundles });
      }
      if (blueprintMatch) {
        const id = param(blueprintMatch);
        const sample = samples.find(bundle => bundle.id === id);
        const row = sample ? null : BUNDLE_ID.test(id) ? db.prepare('SELECT blueprint, blueprint_type FROM bundles WHERE id = ?').get(id) : null;
        if (!sample && !row) throw new HttpError(404, 'not_found', 'This plan could not be found.');
        const bytes = sample ? readFileSync(sample.blueprintPath) : Buffer.from(row.blueprint);
        response.writeHead(200, { 'Content-Type': sample ? 'image/png' : row.blueprint_type, 'Content-Length': bytes.length,
          'Cache-Control': sample ? 'public, max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' });
        return response.end(bytes);
      }
      const id = param(bundleMatch);
      if (request.method === 'GET') {
        const bundle = BUNDLE_ID.test(id) ? await fullBundle(id) : null;
        if (!bundle) throw new HttpError(404, 'not_found', 'This plan could not be found.');
        return send(response, 200, { bundle });
      }
      const user = requireUser(request);
      ownedBundle(id, user);
      if (request.method === 'DELETE') {
        db.prepare('DELETE FROM bundles WHERE id = ?').run(id);
        return send(response, 200, { ok: true });
      }
      const input = await bundleInput(await readBody(request, maxBodyBytes), true);
      const now = new Date().toISOString();
      db.prepare(`UPDATE bundles SET name = ?, building = ?, bedrooms = ?, area = ?, pieces = ?, scene = ?, catalog = ?, updated_at = ?
        ${input.blueprint ? ', blueprint = ?, blueprint_type = ?' : ''} WHERE id = ?`)
        .run(input.name, input.building, input.bedrooms, input.area, input.pieces, input.scene, input.catalog, now,
          ...(input.blueprint ? [input.blueprint.bytes, input.blueprint.type] : []), id);
      return send(response, 200, { bundle: await fullBundle(id) });
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('[varpet-developers] Unexpected request failure', { type: error?.constructor?.name ?? 'Error', code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR' });
      if (!response.headersSent && !response.writableEnded) {
        if (error instanceof HttpError) send(response, error.status, { error: error.message, code: error.code });
        else send(response, 500, { error: 'This request could not be completed. Please try again.', code: 'server_error' });
      }
    }
  };
  handler.close = () => { if (closed) return; closed = true; db.close(); accounts?.close(); };
  return handler;
}

/** Install lazily so a production build does not create a database. Register after `accountsPlugin`. */
export function developersPlugin(options = {}) {
  const install = server => {
    const handler = createDevelopersHandler(options);
    server.middlewares.use(handler);
    server.httpServer?.once('close', () => handler.close());
  };
  return { name: 'varpet-developers', configureServer: install, configurePreviewServer: install };
}
