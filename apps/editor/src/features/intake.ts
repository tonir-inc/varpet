import './intake.css';
import type { CatalogAsset, EvidenceSource, Operation, SceneDocument, Vec2 } from '../contracts';
import { parseScene } from '../core/persistence';
import { validateScene } from '../core/validation';
import { measuredShell, mergeReconstruction, reconstructionDifferences, tracedShell, type MeasuredRoom } from './reconstruction';

interface IntakeOptions {
  getScene(): SceneDocument;
  getCatalog(): CatalogAsset[];
  getRevision(): number;
  execute(label: string, operations: Operation[], revision?: number): boolean;
  propose(scene: SceneDocument, title: string, description: string, revision: number): void;
  notice(message: string, error?: boolean): void;
}
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const option = (value: string, selected = '', label = value) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
const uid = () => crypto.randomUUID();
const readData = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the source file.')); reader.readAsDataURL(file);
});

export function createIntake(options: IntakeOptions) {
  const dialog = document.createElement('dialog'); dialog.className = 'intake-dialog'; document.body.append(dialog);
  let disposed = false;
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  function show(title: string, body: string) {
    dialog.innerHTML = `<div class="modal-heading"><h2>${esc(title)}</h2><button class="icon-button" data-close aria-label="Close source tools">×</button></div>${body}<p class="intake-error" role="alert"></p>`;
    query('[data-close]').onclick = () => dialog.close(); if (!dialog.open) dialog.showModal();
  }
  function fail(error: unknown) { query('.intake-error').textContent = error instanceof Error ? error.message : String(error); }
  function propose(scene: SceneDocument, title: string, description: string, revision: number) {
    const checked = validateScene(scene, options.getCatalog());
    if (!checked.ok) throw new Error(checked.errors.join(' '));
    dialog.close(); options.propose(scene, title, description, revision);
  }
  function keepSources(scene: SceneDocument) {
    const existing = options.getScene().project?.sources ?? [];
    for (const source of existing) if (!scene.project!.sources.some(s => s.id === source.id)) {
      const copy = structuredClone(source); delete copy.roomId; scene.project!.sources.push(copy);
    }
    return scene;
  }

  function sources() {
    const scene = options.getScene(); const list = scene.project?.sources ?? [];
    show('Evidence & measurements', `<p class="modal-intro">Keep original plans, photos and measurements with the apartment. Files stay on this device and are included in project JSON exports.</p>
      <div class="intake-grid"><section><h3>Add original files</h3><label>Source type<select id="source-kind">${option('plan')}${option('photo')}${option('document')}</select></label><label>Room (optional)<select id="source-room"><option value="">Whole apartment</option>${scene.rooms.map(r => option(r.id, '', r.name)).join('')}</select></label><label>Notes<textarea id="source-notes" rows="3" maxlength="2000" placeholder="What does this evidence establish?"></textarea></label><label class="intake-upload">Choose PNG, JPEG, WebP or PDF<input id="source-files" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple /></label><p class="muted">Up to 2 MB per original file. Large projects may exceed browser storage; export JSON to keep a portable copy.</p><button id="add-files" class="button primary">Add selected sources</button></section>
      <section><h3>Record a measurement</h3><label>Measurement name<input id="measure-name" maxlength="100" placeholder="Living room north wall" /></label><label>Value and method<textarea id="measure-notes" rows="4" maxlength="2000" placeholder="4.82 m between finished faces, measured with laser, 26 September"></textarea></label><button id="add-measure" class="button">Save measurement evidence</button><p class="muted">Link this source to the relevant property in Assumptions, then enter the actual geometry correction in Shell.</p></section></div>
      <h3 class="intake-section-title">Saved evidence · ${list.length}</h3><div class="intake-source-list">${list.map(s => `<article><div><strong>${esc(s.name)}</strong><p>${esc(s.kind)}${s.calibration ? ` · calibrated ${(s.calibration.pixels / s.calibration.metres).toFixed(1)} px/m` : ''}</p><p>${esc(s.notes ?? '')}</p></div><button class="button" data-view="${esc(s.id)}">View</button></article>`).join('') || '<p class="muted">No sources yet. Add a plan, room photos, or a measurement.</p>'}</div>`);
    query('#add-files').onclick = async () => {
      const files = [...(query<HTMLInputElement>('#source-files').files ?? [])]; const revision = options.getRevision();
      const kind = query<HTMLSelectElement>('#source-kind').value as EvidenceSource['kind']; const roomId = query<HTMLSelectElement>('#source-room').value; const notes = query<HTMLTextAreaElement>('#source-notes').value;
      try {
        if (!files.length || files.length > 10) throw new Error('Choose 1–10 source files.');
        query<HTMLButtonElement>('#add-files').disabled = true;
        const operations: Operation[] = [];
        for (const file of files) {
          if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error(`${file.name}: use PNG, JPEG, WebP, or PDF.`);
          if (file.size > 2_000_000) throw new Error(`${file.name} exceeds 2 MB. Choose a smaller source file.`);
          const source: EvidenceSource = { id: uid(), name: file.name.slice(0, 120), kind, notes, dataUrl: await readData(file), ...(roomId ? { roomId } : {}) };
          operations.push({ type: 'upsert-source', source });
        }
        if (!disposed && dialog.open && options.execute('Attach source evidence', operations, revision)) sources();
      } catch (error) { if (dialog.open) fail(error); }
      finally { const button = dialog.querySelector<HTMLButtonElement>('#add-files'); if (button) button.disabled = false; }
    };
    query('#add-measure').onclick = () => {
      const name = query<HTMLInputElement>('#measure-name').value.trim(), notes = query<HTMLTextAreaElement>('#measure-notes').value.trim();
      if (!name || !notes) { fail(new Error('Give the measurement a name, value, units, and method.')); return; }
      const source: EvidenceSource = { id: uid(), name, kind: 'measurement', notes };
      if (options.execute('Record measurement evidence', [{ type: 'upsert-source', source }])) sources();
    };
    dialog.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => viewSource(button.dataset.view!));
  }

  function viewSource(id: string) {
    const source = options.getScene().project?.sources.find(s => s.id === id); if (!source) return;
    show(source.name, `<button id="back-sources" class="button">← All sources</button><p class="modal-intro">${esc(source.notes ?? source.kind)}</p><div id="source-media"></div>`);
    query('#back-sources').onclick = sources;
    if (source.dataUrl?.startsWith('data:image/')) { const img = document.createElement('img'); img.src = source.dataUrl; img.alt = source.name; img.className = 'source-original'; query('#source-media').append(img); }
    else if (source.dataUrl?.startsWith('data:application/pdf')) { const object = document.createElement('object'); object.data = source.dataUrl; object.type = 'application/pdf'; object.className = 'source-pdf'; query('#source-media').append(object); }
    else if (source.url) { const link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'button'; link.textContent = 'Open source reference'; query('#source-media').append(link); }
  }

  function reconstruction() {
    show('Build the existing apartment', `<p class="modal-intro">Start with an empty shell, then review walls, entrance, windows and unknown details. Local tools use your measurements and traces. Automatic AI reconstruction is not connected.</p><div class="intake-methods"><button id="method-measure" class="intake-method"><strong>Enter measured rooms</strong><span>Room dimensions, elevations and balconies → connected walls.</span></button><button id="method-trace" class="intake-method"><strong>Trace a calibrated blueprint</strong><span>Two points establish scale. Trace the perimeter and partitions.</span></button><button id="method-import" class="intake-method"><strong>Review reconstruction JSON</strong><span>Compare incoming geometry by stable ID; choose the changes to accept.</span></button></div><p class="muted">Photos can be attached as evidence and used with measured dimensions. Unseen geometry and hidden services stay unknown.</p>`);
    query('#method-measure').onclick = () => measured(); query('#method-trace').onclick = trace; query('#method-import').onclick = importReconstruction;
  }

  function measured() {
    let rows: MeasuredRoom[] = [{ name: 'Main space', x: 0, z: 0, width: 5, depth: 4, elevation: 0, ceilingHeight: 2.7, zone: 'interior' }];
    show('Reconstruct from room dimensions', `<p class="modal-intro">Enter footprint dimensions between wall centerlines. X and Z place adjacent rooms; Y is the finished floor elevation. Shared edges become one wall. Openings are added in Shell after review.</p><div class="intake-row"><label>Apartment name<input id="shell-name" value="My apartment" maxlength="100" /></label><label>Provisional wall thickness (m)<input id="shell-thickness" type="number" min="0.02" max="1" step="0.01" value="0.16" /></label></div><div class="intake-table-wrap"><table class="intake-room-table"><thead><tr><th>Room</th><th>X</th><th>Z</th><th>Width</th><th>Depth</th><th>Floor Y</th><th>Ceiling</th><th>Space</th><th></th></tr></thead><tbody id="measured-rooms"></tbody></table></div><div class="intake-actions"><button id="add-measured-room" class="button">+ Room / balcony</button><label class="intake-check"><input id="site-measured" type="checkbox" /> Entered room dimensions are site measurements</label></div><p class="muted">Wall thickness and structural roles remain unconfirmed. Review labels and add entrance, doors, windows, and fixed features in Shell.</p><button id="propose-measured" class="button primary">Review empty shell</button>`);
    function renderRows() {
      query('#measured-rooms').innerHTML = rows.map((r, index) => `<tr data-row="${index}"><td><input data-key="name" aria-label="Room ${index + 1} name" value="${esc(r.name)}" /></td>${(['x', 'z', 'width', 'depth', 'elevation', 'ceilingHeight'] as const).map(k => `<td><input type="number" data-key="${k}" aria-label="Room ${index + 1} ${k}" value="${r[k]}" step="0.01" /></td>`).join('')}<td><select data-key="zone" aria-label="Room ${index + 1} type">${['interior', 'balcony', 'loggia', 'terrace'].map(v => option(v, r.zone)).join('')}</select></td><td><button class="icon-button" data-remove="${index}" aria-label="Remove room ${index + 1}" ${rows.length === 1 ? 'disabled' : ''}>×</button></td></tr>`).join('');
      dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach(input => input.onchange = () => {
        const index = Number(input.closest<HTMLElement>('[data-row]')!.dataset.row); const row = rows[index]!;
        const field = input.dataset.key!;
        if (field === 'name') row.name = input.value; else if (field === 'zone') row.zone = input.value as MeasuredRoom['zone']; else row[field as 'x'] = Number(input.value);
      });
      dialog.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(button => button.onclick = () => { try { readRows(); rows.splice(Number(button.dataset.remove), 1); renderRows(); } catch (error) { fail(error); } });
    }
    function readRows() {
      rows = [...dialog.querySelectorAll<HTMLTableRowElement>('[data-row]')].map((element, index) => {
        const value = (key: string) => element.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`)!.value;
        const number = (key: string) => { const raw = value(key).trim(); const n = Number(raw); if (!raw || !Number.isFinite(n)) throw new Error(`Enter a finite ${key} for room ${index + 1}.`); return n; };
        return { name: value('name'), x: number('x'), z: number('z'), width: number('width'), depth: number('depth'), elevation: number('elevation'), ceilingHeight: number('ceilingHeight'), zone: value('zone') as MeasuredRoom['zone'] };
      });
    }
    renderRows();
    query('#add-measured-room').onclick = () => { try { readRows(); if (rows.length >= 32) return; const last = rows.at(-1)!; rows.push({ ...last, name: `Space ${rows.length + 1}`, x: last.x + last.width }); renderRows(); } catch (error) { fail(error); } };
    query('#propose-measured').onclick = () => {
      try {
        readRows();
        const revision = options.getRevision();
        const scene = keepSources(measuredShell(query<HTMLInputElement>('#shell-name').value, rows, query<HTMLInputElement>('#shell-thickness').valueAsNumber, query<HTMLInputElement>('#site-measured').checked));
        propose(scene, 'Measured empty apartment', `${scene.rooms.length} spaces and ${scene.walls.length} connected wall segments. This replaces the current apartment and furnishings with an unfurnished shell, keeping source evidence. Starter ceiling lighting and room switches are editable design choices where they fit. Add openings after review. The complete replacement can be undone.`, revision);
      } catch (error) { fail(error); }
    };
  }

  function trace() {
    const plans = (options.getScene().project?.sources ?? []).filter(s => s.kind === 'plan' && s.dataUrl?.startsWith('data:image/'));
    if (!plans.length) { sources(); options.notice('Attach a PNG, JPEG or WebP blueprint as a plan, then choose Trace blueprint.'); return; }
    let source = structuredClone(plans[0]!); let scalePoints: Vec2[] = []; let outline: Vec2[] = []; let partitions: [Vec2, Vec2][] = []; let pendingPoint: Vec2 | null = null;
    let mode: 'scale' | 'outline' | 'partition' = 'scale';
    show('Trace the original blueprint', `<p class="modal-intro">First mark two points with a known distance. Trace the perimeter, then any partitions. These marks annotate your original evidence; the result is a live 3D shell.</p><div class="intake-row"><label>Plan<select id="trace-source">${plans.map(p => option(p.id, source.id, p.name)).join('')}</select></label><label>Known distance (m)<input id="trace-metres" type="number" min="0.1" max="100" step="0.01" value="${source.calibration?.metres ?? 5}" /></label><label>Ceiling height (assumed m)<input id="trace-height" type="number" min="0.5" max="6" step="0.01" value="2.7" /></label><label>Wall thickness (assumed m)<input id="trace-thickness" type="number" min="0.02" max="1" step="0.01" value="0.16" /></label></div><div class="intake-actions" role="group" aria-label="Blueprint tracing mode"><button data-mode="scale" class="button active">1. Set scale</button><button data-mode="outline" class="button">2. Perimeter</button><button data-mode="partition" class="button">3. Partitions</button><button id="trace-undo" class="button">Undo point</button><button id="trace-clear" class="button">Clear tracing</button></div><p id="trace-status" class="trace-status" aria-live="polite"></p><div class="trace-scroll"><div class="trace-image-wrap"><img id="trace-image" alt="Original blueprint; click to mark calibrated wall geometry" /><svg id="trace-marks" aria-hidden="true"></svg></div></div><p class="muted">Partitions snap to nearby perimeter vertices and wall segments. Close rooms with partitions to split spaces automatically. Openings and structural roles remain for review.</p><button id="propose-trace" class="button primary">Review traced 3D shell</button>`);
    const img = query<HTMLImageElement>('#trace-image'); const svg = query<SVGSVGElement & HTMLElement>('#trace-marks');
    function draw() {
      const w = img.naturalWidth || 1, h = img.naturalHeight || 1; svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const stroke = Math.max(2, w / 400); const line = (ps: Vec2[], color: string, closed = false) => `<polyline points="${[...ps, ...(closed && ps.length > 2 ? [ps[0]!] : [])].map(p => p.join(',')).join(' ')}" fill="${closed ? '#c2b6fa20' : 'none'}" stroke="${color}" stroke-width="${stroke}" />`;
      svg.innerHTML = line(scalePoints, '#e0b800') + line(outline, '#151515', true) + partitions.map(p => line(p, '#69dcb4')).join('') + [...scalePoints, ...outline, ...(pendingPoint ? [pendingPoint] : [])].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${stroke * 2}" fill="#ffffff" stroke="#151515" stroke-width="${stroke}"/>`).join('');
      query('#trace-status').textContent = mode === 'scale' ? `Scale: ${scalePoints.length}/2 points. Click the two ends of a known dimension.` : mode === 'outline' ? `${outline.length} perimeter points. Click in order around the outer wall centerline.` : `${partitions.length} partitions. ${pendingPoint ? 'Click the other end.' : 'Click the start and end of each partition.'}`;
      dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
    }
    function load() { scalePoints = []; outline = []; partitions = []; pendingPoint = null; mode = 'scale'; img.src = source.dataUrl!; draw(); }
    img.onload = draw; load();
    query<HTMLSelectElement>('#trace-source').onchange = event => { source = structuredClone(plans.find(p => p.id === (event.target as HTMLSelectElement).value)!); load(); };
    dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.onclick = () => { mode = button.dataset.mode as typeof mode; pendingPoint = null; draw(); });
    img.onclick = event => {
      const rect = img.getBoundingClientRect(); let point: Vec2 = [(event.clientX - rect.left) / rect.width * img.naturalWidth, (event.clientY - rect.top) / rect.height * img.naturalHeight];
      if (mode === 'scale') { if (scalePoints.length === 2) scalePoints = []; scalePoints.push(point); }
      else if (mode === 'outline') { if (outline.length >= 32) { fail(new Error('Use at most 32 outline vertices.')); return; } outline.push(point); }
      else {
        const candidates: Vec2[] = [...outline, ...partitions.flat()];
        const segments: [Vec2, Vec2][] = [...outline.map((p, i): [Vec2, Vec2] => [p, outline[(i + 1) % outline.length]!]), ...partitions];
        for (const [a, b] of segments) { const dx = b[0] - a[0], dz = b[1] - a[1], d = dx * dx + dz * dz; if (d > 0) { const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / d)); candidates.push([a[0] + t * dx, a[1] + t * dz]); } }
        let nearest = 12 * img.naturalWidth / rect.width;
        for (const p of candidates) { const d = Math.hypot(p[0] - point[0], p[1] - point[1]); if (d < nearest) { point = p; nearest = d; } }
        if (pendingPoint) { partitions.push([pendingPoint, point]); pendingPoint = null; } else pendingPoint = point;
      }
      draw();
    };
    query('#trace-undo').onclick = () => { if (mode === 'scale') scalePoints.pop(); else if (mode === 'outline') outline.pop(); else if (pendingPoint) pendingPoint = null; else partitions.pop(); draw(); };
    query('#trace-clear').onclick = () => { outline = []; partitions = []; pendingPoint = null; draw(); };
    query('#propose-trace').onclick = () => {
      try {
        if (scalePoints.length !== 2) throw new Error('Mark both calibration points first.');
        const metres = query<HTMLInputElement>('#trace-metres').valueAsNumber, pixels = Math.hypot(scalePoints[1]![0] - scalePoints[0]![0], scalePoints[1]![1] - scalePoints[0]![1]);
        if (!Number.isFinite(metres) || metres <= 0 || pixels < 5) throw new Error('Enter a positive known distance and mark two separated points.');
        if (pendingPoint) throw new Error('Finish the current partition or undo its first point.');
        source.calibration = { metres, pixels, origin: outline[0] ?? scalePoints[0]!, rotation: 0 };
        const scene = keepSources(tracedShell({ name: 'Apartment from blueprint', outline, partitions, pixelsPerMetre: pixels / metres, origin: source.calibration.origin, source, height: query<HTMLInputElement>('#trace-height').valueAsNumber, thickness: query<HTMLInputElement>('#trace-thickness').valueAsNumber }));
        propose(scene, 'Calibrated blueprint reconstruction', `${scene.rooms.length} enclosed spaces and ${scene.walls.length} wall segments traced from ${source.name}. Replaces the current apartment and furnishings with an unfurnished shell, preserving evidence. Starter ceiling lighting and room switches are editable design choices where they fit. Heights, thicknesses and structural roles remain assumptions; add doors and windows in Shell.`, options.getRevision());
      } catch (error) { fail(error); }
    };
  }

  function importReconstruction() {
    show('Review reconstruction geometry', `<p class="modal-intro">Import a Varpet scene JSON from a reconstruction workflow. Compare stable room/wall IDs and explicitly select changes. Unselected geometry, furniture and recorded decisions stay in place. Missing IDs are never silently deleted.</p><label>Reconstruction file<input id="reconstruction-file" type="file" accept=".json,application/json" /></label><div id="reconstruction-diff"></div>`);
    query<HTMLInputElement>('#reconstruction-file').onchange = async event => {
      const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
      const current = options.getScene(), revision = options.getRevision();
      try {
        if (file.size > 24_000_000) throw new Error('Use a reconstruction JSON smaller than 24 MB.');
        const incoming = parseScene(await file.text(), options.getCatalog()); if (disposed || !dialog.open) return;
        const diff = reconstructionDifferences(current, incoming);
        query('#reconstruction-diff').innerHTML = `<p class="modal-intro">${diff.length} proposed geometry changes. Existing IDs identify corrections; new IDs add elements. Match IDs before merging a reconstruction of the same apartment.</p>${diff.map(d => `<details class="reconstruction-change"><summary><label><input type="checkbox" data-change="${esc(d.id)}" /> ${esc(d.action)} ${esc(d.kind)} · ${esc(d.label)}</label></summary><div><strong>Existing</strong><pre>${esc(d.before)}</pre><strong>Proposed</strong><pre>${esc(d.after)}</pre></div></details>`).join('')}<button id="review-merge" class="button primary" ${diff.length ? '' : 'disabled'}>Review selected corrections</button>`;
        query('#review-merge').onclick = () => {
          try {
            const ids = new Set([...dialog.querySelectorAll<HTMLInputElement>('[data-change]:checked')].map(input => input.dataset.change!));
            if (!ids.size) throw new Error('Select at least one geometry change.');
            const candidate = mergeReconstruction(current, incoming, ids);
            propose(candidate, 'Reconstruction corrections', `${ids.size} selected geometry changes. Existing furniture, unselected geometry and decisions are preserved. Affected assumptions need review.`, revision);
          } catch (error) { fail(error); }
        };
      } catch (error) { if (dialog.open) fail(error); }
    };
  }

  return { sources, reconstruction, destroy() { disposed = true; dialog.remove(); } };
}
