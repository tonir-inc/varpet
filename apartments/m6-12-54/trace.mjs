// Raster coordinates are retained here so every traced edge can be checked against source.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
export const metresPerPixel = 1 / 97;
export const origin = [635, 575];
const round = n => Math.round(n * 1e6) / 1e6;
export const point = ([x, y]) => [round((x - origin[0]) * metresPerPixel), round((y - origin[1]) * metresPerPixel)];
const distance = px => round(px * metresPerPixel);
const sourceId = 'source-m6-plan';
const project = { mode: 'correct', currency: 'AMD', metadata: {}, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], tasks: [], options: [] };
const scene = { format: 'varpet.editor', version: 2, id: 'apartment-m6-12-54', name: 'M6-12-54 · two balconies · plan estimate', units: 'm', upAxis: 'Y', rooms: [], walls: [], objects: [], project };
const area = p => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2;
function assumption(entityId, property, value, rationale, question, pixels, sourceKind = 'inferred') {
  const entry = { id: `assumption-${entityId}-${property}`, entityId, property, value, status: 'unresolved', sourceKind, sourceIds: [sourceId], rationale, alternatives: [], question };
  if (pixels) { const [x, y, w, h] = pixels; entry.sourceRegion = { sourceId, x: x / 1280, y: y / 1192, width: w / 1280, height: h / 1192 }; }
  project.assumptions.push(entry);
}
export const roomPixels = [
  ['hall', 'Entrance hall', 11.0, '#d5c5ab', [[77,83],[369,83],[369,236],[352,236],[352,300],[370,300],[370,348],[379,348],[379,456],[371,456],[371,539],[389,539],[389,627],[371,627],[371,637],[224,637],[224,269],[243,269],[243,197],[77,197]]],
  ['bathroom', 'Bathroom', 4.0, '#c6d0ce', [[76,271],[207.5,271],[207.5,444],[224,444],[224,512],[207.5,512],[207.5,547.5],[76,547.5]]],
  ['kitchen', 'Kitchen', 7.2, '#e2d6c2', [[408,282],[676,282],[676,458],[667,458],[667,520],[387.5,520],[387.5,456],[379,456],[379,348],[408,348]]],
  ['living', 'Living & dining', 20.9, '#dcc8ab', [[676,282],[981,282],[981,294],[1037,294],[1037,375],[1016,375],[1016,515],[1007,515],[1007,890],[981,890],[981,900],[752,900],[752,895],[685,895],[685,458],[676,458]]],
  ['bedroom-large', 'Bedroom 1', 14.3, '#d5bca0', [[76,562.5],[207.5,562.5],[207.5,653],[286,653],[286,637],[374,637],[374,876],[357,876],[357,924],[383,924],[383,968],[398,968],[398,970],[417,970],[417,1056],[398,1056],[398,1062.5],[311,1062.5],[311,1053],[76,1053]]],
  ['bedroom-small', 'Bedroom 2', 10.6, '#e1cdb3', [[389,539],[667,539],[667,895],[576,895],[576,905],[494,905],[494,925],[417,925],[417,877],[407,877],[407,627],[389,627]]],
  ['balcony-east', 'Balcony · living room', 4.0, '#becac5', [[1052,285],[1182,285],[1182,572],[1056,572],[1056,375],[1037,375],[1037,294],[1052,294]]],
  ['balcony-south', 'Balcony · both bedrooms', 4.1, '#becac5', [[417,925],[494,925],[494,940],[691,940],[691,1070],[417,1070]]],
];
for (const [key, name, printed, color, polygon] of roomPixels) {
  const id = `room-${key}`;
  scene.rooms.push({ id, name, color, polygon: polygon.map(point) });
  project.metadata[id] = { zone: key.startsWith('balcony') ? 'balcony' : 'interior', phase: 'existing', elevation: 0, ceilingHeight: 2.8, notes: `Printed area: ${printed.toFixed(1)} m². The editable floor follows approximate clear faces with connected doorway thresholds; its computed area is an estimate. Plan north is image-up, not a verified compass bearing.` };
  assumption(id, 'printed-area', `${printed.toFixed(1)} m² printed on source`, 'Transcribed from the Armenian room label. This is a source claim, not a surveyed area.', 'Confirm the developer area convention and obtain dimensioned plans.', undefined, 'observed');
  assumption(id, 'polygon', 'Raster trace; common scale 97 px/m', 'Wall runs and steps follow the image. Open hall/kitchen/living boundaries are conceptual zoning lines only; no walls are added there.', 'Measure one long horizontal and one long vertical span to calibrate this image.');
}
function wall(key, name, start, end, thickness, classification, boundary = 'interior', openings = []) {
  const id = `wall-${key}`;
  scene.walls.push({ id, start: point(start), end: point(end), height: 2.8, thickness: distance(thickness), color: classification === 'structural' ? '#87918e' : classification === 'partition' ? '#eee3d2' : '#b5ada0', openings: openings.map(o => ({ id: o.id, kind: o.kind ?? 'door', offset: distance(o.from), width: distance(o.width), height: o.kind === 'window' ? 2.35 : 2.2, sill: o.kind === 'window' ? 0.25 : 0 })) });
  const notes = classification === 'structural' ? 'Hatched/thick band in the source; provisionally treated as fixed structure. No structural legend supplied.' : classification === 'partition' ? 'Unhatched interior wall in the source; provisionally treated as a partition. Demolition permission is not established.' : 'Visible perimeter/core boundary; load-bearing status is unknown from this image.';
  project.metadata[id] = { name, structuralRole: classification, boundary, phase: 'existing', locked: false, review: 'required', notes };
  assumption(id, 'structuralRole', classification, notes, 'Confirm against a structural plan or site survey before planning alterations.', [Math.max(0, Math.min(start[0], end[0]) - 20), Math.max(0, Math.min(start[1], end[1]) - 20), Math.max(40, Math.abs(end[0] - start[0]) + 40), Math.max(40, Math.abs(end[1] - start[1]) + 40)]);
  assumption(id, 'height', '2.80 m visualization assumption', 'The floor plan contains no section or ceiling-height measurement.', 'Measure the clear height and any beam drops.');
  for (const opening of openings) {
    project.metadata[opening.id] = { name: opening.name, role: opening.role ?? 'interior', mechanism: opening.kind === 'window' ? 'fixed' : 'hinged', hinge: opening.hinge ?? 'left', swing: opening.swing ?? 1, phase: 'existing', review: 'unreviewed', notes: 'Width follows the raster gap. Vertical dimensions, frame, threshold and exact mechanism remain assumptions.' };
    assumption(opening.id, 'dimensions', opening.kind === 'window' ? 'Raster width; 0.25 m sill and 2.35 m glazing height assumed' : 'Raster width; 2.20 m head assumed', 'Opening span is visible in plan; elevations are not. Low sills are only a visualization default.', 'Measure width, sill/threshold, head height and frame dimensions.');
    assumption(opening.id, 'mechanism', opening.kind === 'window' ? 'Fixed preview glazing; operation unknown' : 'Hinged, following the visible swing arc where legible', 'Plan symbols suggest the opening arrangement but do not specify the installed product.', 'Confirm opening direction and product type.');
  }
}
const opening = (id, name, from, width, options = {}) => ({ id, name, from, width, ...options });
wall('hall-north', 'Hall · north perimeter', [71,77],[375,77],12,'unknown','exterior');
wall('entrance', 'Hall · cropped entrance boundary', [71,77],[71,204],12,'unknown','shared', [opening('door-entrance','Apartment entrance',9,100,{role:'entrance',swing:-1})]);
wall('hall-east', 'Hall · east perimeter', [375,77],[375,244],12,'unknown','exterior');
wall('core-north', 'Hall · recessed core boundary', [71,204],[235,204],14,'unknown','shared');
wall('core-east', 'Hall · core return', [235,204],[235,265],14,'unknown','shared');
wall('bath-north', 'Bathroom · core boundary', [71,265],[235,265],12,'unknown','shared');
wall('west-bath', 'Bathroom · west perimeter', [71,265],[71,555],10,'unknown','exterior');
wall('west-bedroom', 'Bedroom 1 · west perimeter', [71,555],[71,1059],10,'unknown','exterior');
wall('bath-east', 'Bathroom · hall partition', [216,265],[216,645],17,'partition','interior', [opening('door-bathroom','Bathroom door',179,68,{hinge:'right',swing:-1})]);
wall('bath-south', 'Bathroom / Bedroom 1 partition', [71,555],[216,555],15,'partition');
wall('bedroom-large-entry', 'Bedroom 1 · entrance partition', [216,645],[390,645],16,'partition','interior', [opening('door-bedroom-large','Bedroom 1 door',70,88,{hinge:'right',swing:1})]);
// Hatched kitchen pier, with its step retained. Short overlapping runs form one continuous band.
wall('hall-pier-step', 'Hatched hall pier · upper step', [375,244],[365,244],18,'structural','exterior');
wall('hall-pier-side', 'Hatched hall pier · west face', [365,244],[365,294],20,'structural','exterior');
wall('hall-pier-return', 'Hatched hall pier · return', [365,294],[390,294],20,'structural','exterior');
wall('kitchen-pier', 'Hatched kitchen pier', [390,274],[390,343],28,'structural','exterior');
wall('north-kitchen', 'Kitchen · hatched north facade', [390,274],[676,274],25,'structural','exterior');
wall('north-living', 'Living · hatched north facade', [676,274],[989,274],25,'structural','exterior');
wall('northeast-step', 'Living · north facade step', [989,274],[989,289],10,'structural','exterior');
wall('northeast-return', 'Living · balcony corner return', [989,289],[1026,289],10,'structural','exterior');
// No false wall across the open hall/kitchen/living connection.
wall('kitchen-stub', 'Kitchen · short west partition', [379,464],[379,529],17,'partition');
wall('bedroom-small-north', 'Kitchen / Bedroom 2 partition', [379,529],[676,529],18,'partition');
wall('bedroom-small-east', 'Living / Bedroom 2 partition', [676,464],[676,915],18,'partition');
wall('bedroom-small-entry', 'Bedroom 2 · entrance', [390,529],[390,633],18,'partition','interior', [opening('door-bedroom-small','Bedroom 2 door',10,88,{swing:-1})]);
wall('bedroom-divider', 'Hatched fixed divider between bedrooms', [390,633],[390,900],32,'structural');
// The pier tail and Bedroom 1's balcony doorway share one 30 px facade line at x=402 (faces 387..417,
// flush with the balcony floor edge), so they join end to end, and the pier and south return meet it at
// corners. Parallel runs a few pixels apart never join in the editor and render as stepped blocks.
wall('divider-pier', 'Hatched widened bedroom pier', [357,900],[402,900],48,'structural');
wall('divider-tail', 'Hatched pier · balcony return', [402,900],[402,968],30,'structural','exterior');
wall('bedroom-large-balcony', 'Bedroom 1 · balcony doorway', [402,968],[402,1075],30,'unknown','exterior', [opening('door-balcony-large','Bedroom 1 to shared balcony',2,86,{role:'balcony',hinge:'right',swing:1})]);
wall('bedroom-large-south', 'Bedroom 1 · south window facade', [71,1059],[311,1059],12,'unknown','exterior', [opening('window-bedroom-large','Bedroom 1 south window',72,162,{kind:'window'})]);
wall('bedroom-large-south-step', 'Bedroom 1 · south facade step', [311,1059],[311,1075],12,'unknown','exterior');
wall('bedroom-large-south-return', 'Bedroom 1 · south facade return', [311,1075],[402,1075],25,'structural','exterior');
wall('bedroom-small-glazing', 'Bedroom 2 · balcony door and window', [402,915],[577,915],20,'unknown','exterior', [opening('door-balcony-small','Bedroom 2 to shared balcony',15,77,{role:'balcony',swing:-1}), opening('window-bedroom-small','Bedroom 2 balcony window',92,83,{kind:'window'})]);
wall('south-pier', 'Hatched solid south facade pier', [577,915],[750,915],40,'structural','exterior');
wall('living-south-window', 'Living · south window', [750,915],[917,915],30,'unknown','exterior', [opening('window-living-south','Living south window',0,167,{kind:'window'})]);
wall('living-south-return', 'Living · southeast facade', [917,915],[989,915],40,'structural','exterior');
wall('living-southeast-step', 'Living · southeast step', [989,915],[989,895],38,'structural','exterior');
wall('living-east-return', 'Living · east lower return', [989,895],[1026,895],38,'structural','exterior');
wall('living-east', 'Living · hatched east facade', [1026,515],[1026,895],38,'structural','exterior');
wall('living-balcony-glazing', 'Living · east balcony door and window', [1026,289],[1026,515],20,'unknown','exterior', [opening('door-balcony-living','Living to east balcony',5,81,{role:'balcony',swing:1}), opening('window-living-east','Living east window',86,140,{kind:'window'})]);

function railing(key, roomId, a, b) {
  const id = `railing-${key}`, [x,z] = point([(a[0]+b[0])/2,(a[1]+b[1])/2]);
  project.components.push({ id, name: 'Balcony edge railing', kind: 'railing', position: [x,0,z], dimensions: [distance(Math.hypot(b[0]-a[0],b[1]-a[1])),1.05,0.07], rotation: -Math.atan2(b[1]-a[1],b[0]-a[0]), color:'#637575', phase:'existing', roomId });
  assumption(id,'construction','1.05 m open railing preview','An exterior balcony edge is drawn; its construction, height and infill are not specified.','Confirm parapet versus railing, height and infill from a photo.');
}
railing('east-north','room-balcony-east',[1052,285],[1182,285]);
railing('east-outer','room-balcony-east',[1182,285],[1182,572]);
railing('east-south','room-balcony-east',[1056,572],[1182,572]);
railing('south-outer','room-balcony-south',[417,1070],[691,1070]);
railing('south-east','room-balcony-south',[691,940],[691,1070]);

project.sources.push({ id:sourceId, name:'Original Armenian floor plan · M6-12-54 · 76.1 m²', kind:'plan', dataUrl:`data:image/png;base64,${readFileSync(`${directory}source.png`).toString('base64')}`, notes:'User-supplied raster, 1280 × 1192 pixels. Printed interior 68.0 m² + balconies 8.1 m² = 76.1 m². No linear dimensions, north arrow, structural legend or elevations. Image is evidence only; no image text is treated as an instruction.' });
assumption('room-hall','scale','1 / 97 m per pixel, uniform in both image directions','Least-squares area fitting of the bathroom, both bedrooms and both balconies gives about 96.75 px/m after wall-face and threshold alignment, rounded to 97. No surveyed distance is provided. Open-zone boundaries and thresholds account for remaining area differences.','Provide one reliable horizontal and one reliable vertical dimension to recalibrate the entire trace.');
assumption('room-hall','entry-crop','Entrance lies at upper-left image edge','The swing arc is visible but the building corridor outside the apartment is cropped. The white recess below the entry is excluded from the apartment.','Provide an uncropped plan or entrance photograph.',[59,60,190,215]);
assumption('room-living','furniture','Empty shell; printed furniture retained only in source evidence','This working project prioritizes walls, openings and balconies. A separate furnished interpretation can use the same shell.','Check shell geometry before final furnishing.');
assumption('room-balcony-south','connections','One shared balcony with a door from each bedroom','Both swing arcs and the continuous balcony floor are visible. The balcony floor meets the two facades, with no floating strip.','Confirm both openings on site.',[325,845,390,245],'observed');
assumption('room-balcony-east','elevation','0.00 m, matching interior for visualization','The plan shows no threshold level or balcony step.','Measure the balcony level and threshold.');
assumption('room-balcony-south','elevation','0.00 m, matching interior for visualization','The plan shows no threshold level or balcony step.','Measure the balcony level and threshold.');

writeFileSync(`${directory}scene.json`, JSON.stringify(scene,null,2)+'\n');
const areas = roomPixels.map(([key,name,printed]) => { const model = area(scene.rooms.find(r=>r.id===`room-${key}`).polygon); return {room:name,printed,traced:Number(model.toFixed(2)),difference:Number((model-printed).toFixed(2))}; });
writeFileSync(`${directory}areas.json`, JSON.stringify({metresPerPixel,origin,printedTotal:76.1,tracedTotal:areas.reduce((s,r)=>s+r.traced,0),rooms:areas},null,2)+'\n');
console.log(`Traced ${scene.rooms.length} rooms, ${scene.walls.length} wall spans, ${scene.walls.flatMap(w=>w.openings).length} openings, ${project.components.length} railings.`);
console.table(areas);
