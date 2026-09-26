import type { CatalogAsset, SceneDocument } from '../contracts';
import { analyzeProject, componentPosition, polygonArea, wallLength } from '../core/renovation';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = (value: unknown) => {
  let str = String(value ?? ''); if (/^[=+@\-\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replaceAll('"', '""')}"`;
};
export function projectSchedule(scene: SceneDocument, catalog: CatalogAsset[]): string {
  const rows: unknown[][] = [['Category', 'ID', 'Name', 'Property', 'Value', 'Unit', 'Status / phase', 'Evidence / notes']];
  const p = scene.project;
  for (const room of scene.rooms) {
    rows.push(['Room', room.id, room.name, 'Floor area', polygonArea(room.polygon).toFixed(3), 'm2', p?.metadata[room.id]?.phase ?? 'existing', p?.metadata[room.id]?.zone ?? 'interior']);
    rows.push(['Room', room.id, room.name, 'Ceiling height', p?.metadata[room.id]?.ceilingHeight ?? '', 'm', '', '']);
  }
  for (const wall of scene.walls) {
    rows.push(['Wall', wall.id, p?.metadata[wall.id]?.name ?? wall.id, 'Length × height × thickness', `${wallLength(wall).toFixed(3)} × ${wall.height} × ${wall.thickness}`, 'm', p?.metadata[wall.id]?.phase ?? 'existing', `Structure: ${p?.metadata[wall.id]?.structuralRole ?? 'unknown'}`]);
    for (const o of wall.openings) rows.push(['Opening', o.id, p?.metadata[o.id]?.role ?? o.kind, 'Offset / width / height / sill', [o.offset, o.width, o.height, o.sill].join(' / '), 'm', p?.metadata[o.id]?.phase ?? 'existing', `Host ${wall.id}; ${p?.metadata[o.id]?.mechanism ?? 'unspecified'}`]);
  }
  for (const c of p?.components ?? []) rows.push(['Component', c.id, c.name, 'Position / dimensions', `${componentPosition(scene, c).join(', ')} / ${c.dimensions.join(' × ')}`, 'm', c.phase, c.notes ?? '']);
  for (const r of p?.routes ?? []) rows.push(['Route', r.id, r.name, r.system, r.points.map(v => v.join(',')).join(' → '), 'm', r.phase, `${r.from ?? 'unconnected'} → ${r.to ?? 'unconnected'}; ${r.notes ?? ''}`]);
  for (const a of p?.assumptions ?? []) rows.push(['Assumption', a.id, a.entityId, a.property, a.value, '', a.status, `${a.sourceKind}; ${a.sourceIds.join(', ')}; ${a.question ?? a.rationale}`]);
  for (const s of p?.sources ?? []) rows.push(['Source', s.id, s.name, s.kind, s.calibration ? `${s.calibration.pixels} pixels / ${s.calibration.metres} m` : '', '', '', s.notes ?? '']);
  for (const t of p?.tasks ?? []) rows.push(['Task', t.id, t.title, t.trade, t.allowance, p?.currency ?? 'USD', t.status, `${t.notes ?? ''}; depends on ${t.dependsOn.join(', ')}`]);
  for (const line of analyzeProject(scene, catalog).quantities) rows.push(['Quantity', line.id, line.name, 'Quantity / estimated cost', `${line.quantity.toFixed(3)} / ${line.cost.toFixed(2)}`, `${line.unit} / ${p?.currency ?? 'USD'}`, '', 'Conceptual estimate; verify allowances and product pricing']);
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function projectReport(scene: SceneDocument, catalog: CatalogAsset[]): string {
  const analysis = analyzeProject(scene, catalog), project = scene.project;
  const table = (headers: string[], rows: unknown[][]) => `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(scene.name)} · Review package</title><style>body{font:14px/1.6 "Sofia Sans",system-ui,sans-serif;color:#151515;background:#f4f4f1;margin:40px auto;max-width:1120px;padding:0 24px}h1{font-family:"Source Serif 4",Georgia,serif;font-size:32px;margin-bottom:0}h2{margin-top:38px}p{color:#6b6962}table{border-collapse:collapse;width:100%;font-size:12px;background:white}th,td{text-align:left;padding:9px 12px;border:1px solid #deddd8;overflow-wrap:anywhere;vertical-align:top}th{background:#efeee9}.summary{padding:20px;background:#ffffff;border:1px solid #deddd8;border-radius:3px}@media print{body{margin:0;background:white}h2{break-after:avoid}tr{break-inside:avoid}}</style><main><p>VARPET · APARTMENT REVIEW</p><h1>${esc(scene.name)}</h1><p>Exported ${esc(new Date().toISOString())} · Scene format ${scene.version} · ${esc(project?.mode ?? 'correct')} mode</p><div class="summary">${analysis.floorArea.toFixed(2)} m² modeled floor area · ${scene.rooms.length} spaces · ${scene.walls.length} wall segments · ${analysis.issues.length} review items<br>Inventory, material and work allowances: ${analysis.totalCost.toFixed(2)} ${esc(project?.currency ?? 'USD')}<br>Baseline comparison: ${analysis.changes.added} added, ${analysis.changes.removed} removed, ${analysis.changes.changed} changed</div><p>This package describes the modeled apartment and conceptual proposals. Unresolved evidence, quantities and trade requirements need review. A passed geometric test is not construction approval. Source files and the complete model are included in the separate project JSON export.</p>
  <h2>Spaces</h2>${table(['Space', 'Type', 'Area m²', 'Floor elevation m', 'Ceiling height m'], scene.rooms.map(r => [r.name, project?.metadata[r.id]?.zone ?? 'interior', polygonArea(r.polygon).toFixed(2), project?.metadata[r.id]?.elevation ?? 0, project?.metadata[r.id]?.ceilingHeight ?? 'Unknown']))}
  <h2>Walls and openings</h2>${table(['Element', 'Dimensions m', 'Role / mechanism', 'Work / review'], scene.walls.flatMap(w => [[project?.metadata[w.id]?.name ?? w.id, `${wallLength(w).toFixed(2)} × ${w.height} × ${w.thickness}`, project?.metadata[w.id]?.structuralRole ?? 'unknown', `${project?.metadata[w.id]?.phase ?? 'existing'} / ${project?.metadata[w.id]?.review ?? 'unreviewed'}`], ...w.openings.map(o => [o.id, `${o.width} × ${o.height}; sill ${o.sill}; offset ${o.offset}`, `${project?.metadata[o.id]?.role ?? o.kind} / ${project?.metadata[o.id]?.mechanism ?? 'unspecified'}`, project?.metadata[o.id]?.phase ?? 'existing'])]))}
  <h2>Assumptions and measurements</h2>${table(['Element / property', 'Value', 'Status / source kind', 'Evidence', 'Next action'], (project?.assumptions ?? []).map(a => [`${a.entityId} · ${a.property}`, a.value, `${a.status} / ${a.sourceKind}`, a.sourceIds.map(id => project?.sources.find(s => s.id === id)?.name ?? id).join(', '), a.question ?? a.rationale]))}
  <h2>Review items</h2>${table(['Severity', 'Element', 'Issue', 'Detail'], analysis.issues.map(i => [i.severity, i.entityId ?? 'Project', i.title, i.detail]))}
  <h2>Components and services</h2>${table(['Element', 'Type', 'Position / route', 'Connections / notes'], [...(project?.components ?? []).map(c => [c.name, c.kind, componentPosition(scene, c).map(v => v.toFixed(2)).join(', '), c.control ? `Controls ${c.control.targets.join(', ')}` : c.notes ?? '']), ...(project?.routes ?? []).map(r => [r.name, r.system, r.points.map(p => p.join(',')).join(' → '), `${r.from ?? 'Unconnected'} → ${r.to ?? 'Unconnected'}; ${r.notes ?? ''}`])])}
  <h2>Quantities and allowances</h2>${table(['Item', 'Quantity', 'Unit', `Estimated cost ${project?.currency ?? 'USD'}`], analysis.quantities.map(q => [q.name, q.quantity.toFixed(3), q.unit, q.cost.toFixed(2)]))}
  <h2>Work packages</h2>${table(['Task', 'Trade', 'Status', 'Dependencies', 'Notes'], (project?.tasks ?? []).map(t => [t.title, t.trade, t.status, t.dependsOn.map(id => project?.tasks.find(d => d.id === id)?.title ?? id).join(', '), t.notes ?? '']))}
  <h2>Evidence register</h2>${table(['ID', 'Source', 'Type', 'Notes'], (project?.sources ?? []).map(s => [s.id, s.name, s.kind, s.notes ?? '']))}
  </main></html>`;
}
