import { CustomSlots, reserveSlotSchema, buildPieceSchema } from './custom-slots.js';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { parseOps, parseScene, sceneSummary } from './adapter.js';
import type { Scene } from './scene.js';
import { sun } from './metrics/sun.js';
import { spaceMetrics } from './metrics/space.js';
import { place, placeInputSchema } from './place.js';
import { checkLayout, scoreLayout } from './layout.js';
import { intentSchema } from './request.js';
import { DesignerSession } from './session.js';
import {placeBatch,placementsSchema} from './place-batch.js';
import {searchCatalog,searchCatalogInputSchema,proxyCatalogQuery,type CatalogQuery} from './catalog.js';
import {ask,askInputSchema} from './ask.js';
import {opsToolSchema,placeToolSchema} from './tool-inputs.js';
import {candidateSheet} from './catalog-vision.js';
import {designRoom,type DesignCandidate} from './taste/design.js';

export function result(data: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data) }], ...(isError ? { isError: true } : {}) };
}

export function createServer(input: Scene, options:{catalogQuery?:CatalogQuery; proposalsDir?:string; customerRequests?:readonly string[];buildsDir?:string;conversationId?:string;turnId?:string}={}) {
  const scene = parseScene(input);
  const proposalsDir = options.proposalsDir ?? process.env.VARPET_PROPOSALS_DIR;
  const session = new DesignerSession(scene,options.customerRequests);
  const buildsDir=options.buildsDir??process.env.VARPET_BUILDS_DIR;
  const slots=buildsDir?new CustomSlots({buildsDir,conversationId:options.conversationId??process.env.VARPET_CONVERSATION_ID??'',turnId:options.turnId??process.env.VARPET_TURN_ID??''}):undefined;
  let styleCandidates:DesignCandidate[]=[];
  let stylePlanning=false;
  const productVision=process.env.VARPET_VISION_PRODUCTS==='1',seenProducts=new Set<string>();
  const server = new McpServer({ name: 'varpet-designer', version: '0.0.0' });
  if(productVision)server.registerTool('show_candidates',{
    description:'Look before choosing. Show exact catalog renders (shop photo fallback) for 1–12 shortlisted IDs. Check visual style, silhouette, palette and broken models. Blank tiles are unknown. Required before purchasing when product vision is enabled.',
    inputSchema:{item_ids:z.array(z.string().min(1)).min(1).max(12)},
  },async({item_ids})=>{
    try {const sheet=await candidateSheet(item_ids);item_ids.forEach(id=>seenProducts.add(id));return sheet;}
    catch(error){return result(String(error),true);}
  });
  if(slots){
    server.registerTool('reserve_slot',{description:'Search the catalog first. Reserve a private grey custom cabinet, table or shelf only when no product fits size and style. Boxy pieces only; no sofas, armchairs or upholstered beds. Never copy a named design: choose a generic function and size. Size W/D/H comes from scene geometry, not the picture. Maximum three per turn; estimate is sample AMD, workshop confirms.',inputSchema:reserveSlotSchema},async input=>{try{const slot=await slots.reserve(input);stylePlanning=false;return result(slot);}catch(error){return result(String(error),true);}});
    server.registerTool('build_piece',{description:'After propose passes the layout checks, queue this stored custom slot for a separate builder. Returns immediately; never write the part program yourself or wait for the build. The service runs up to four builders and enforces the stored dimensions within 1 cm.',inputSchema:buildPieceSchema},async({slotId})=>{try{return result(await slots.queue(slotId));}catch(error){return result(String(error),true);}});
  }
  server.registerTool('scene_summary', {
    description: 'Rooms, walls with compass directions, openings, furniture, keeps and fixed items. An empty room_ids selects none.',
    inputSchema: { room_ids: z.array(z.string()).optional() },
  }, ({ room_ids }) => {
    try {
      const summary = sceneSummary(scene, room_ids);
      const selected = new Set(summary.rooms.map(room=>room.id));
      // Neighboring walls may own doors that swing into a selected room.
      const rooms = selected.size ? spaceMetrics(scene).rooms.filter(room=>selected.has(room.room_id)) : [];
      const free_area_m2 = Math.round(rooms.reduce((sum,room)=>sum+room.free_area_m2,0)*1e10)/1e10;
      return result({ ...summary, metrics: {rooms,free_area_m2} });
    }
    catch (error) { return result(String(error), true); }
  });
  server.registerTool('sun', {
    description: 'Direct sun and floor patches over Yerevan in UTC+4. Missing north is unknown. Defaults to the four 2026 seasonal dates; no current-clock assumptions.',
    inputSchema: {
      room_id: z.string().optional(), window_id: z.string().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hours: z.array(z.number().finite().min(0).max(24)).max(48).optional(),
    },
  }, options => {
    try { return result(sun(scene,options)); }
    catch (error) { return result(String(error),true); }
  });
  server.registerTool('place', {
    description: 'Find checked poses from relations, never raw coordinates. Use single item_id/item + room_id + relations, OR placements:[those requests] to rearrange up to six pieces together. Batch temporarily lifts only requested movable pieces, returns fully checked combined ops and scores; place anchors before dependents. Scene unchanged.',
    inputSchema: placeToolSchema,
  }, request => {
    try {
      const {placements,...single}=request;
      if(placements) {
        if(Object.values(single).some(value=>value!==undefined)) throw new Error('Use placements or single-item arguments, not both');
        return result(placeBatch(scene,placementsSchema.parse(placements),{compareBaseline:true}));
      }
      return result(place(scene,placeInputSchema.parse(single)));
    }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('set_intent', {
    description: 'Store the request: room, kinds/counts to add/remove/move, kept items, optional dram budget and preferences. For paint or furniture colour set colors:[{target:"wall"|"item",id,color:"#RRGGBB"}]. Use matching color ops in propose. A wall colour paints both faces and all segments sharing source_id. Paint/labour costs are unquoted.',
    inputSchema: intentSchema,
  }, intent => {
    try { return result(session.setIntent(intent)); }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('check_layout', {
    description: 'Compare preview ops with the starting scene. New or worsened violations block; existing non-worsened violations are notes to mention, not a reason to fix unrelated rooms. Returns coordinates, overlap depths and incremental purchase price.',
    inputSchema: {ops:opsToolSchema},
  }, ({ops}) => {
    try { const check=checkLayout(scene,parseOps(ops),{compareBaseline:true});return result(check,!check.ok); }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('score_layout', {
    description: 'Compare before/after open floor, largest rectangle, circulation, potential window sunlight, function clearances and incremental cost. Pure rearranges cost zero; missing north or prices stay unknown.',
    inputSchema: {ops:opsToolSchema},
  }, ({ops}) => {
    try { return result(scoreLayout(scene,parseOps(ops))); }
    catch(error) { return result(String(error),true); }
  });
  server.registerTool('propose', {
    description: 'For a style remake, first search_catalog with room_id, style_request and remake:true, then propose its checked candidate_id without writing coordinates. Otherwise store checked furniture or colour ops for user review. Colour op: {type:"color",target:"wall"|"item",id,color:"#RRGGBB"}; declare exact colours in set_intent first. Group move ops transform all members. Refuses new/worsened physical violations or unmet intent. Returns an unapplied proposal; explicit user acceptance remains required.',
    inputSchema: {ops:opsToolSchema.optional(),candidate_id:z.string().optional(),rationale:z.string().min(1).max(4000)},
  }, async ({ops,candidate_id,rationale}) => {
    if(candidate_id){
      const candidate=styleCandidates.find(c=>c.id===candidate_id);
      if(!candidate||ops)return result({ok:false,errors:[{check:'candidate',message:'Choose a returned candidate_id alone; do not supply or invent ops.'}]},true);
      const declared=session.getIntent();
      if(declared?.room_id&&declared.room_id!==candidate.intent.room_id)return result({ok:false,errors:[{check:'request_room',message:'The selected candidate is outside the declared request room.'}]},true);
      ops=candidate.ops;session.setIntent({...declared,...candidate.intent});
    }else if(stylePlanning)return result({ok:false,errors:[{check:'composition',message:'Style plans require choosing one of the two checked candidate IDs.'}]},true);
    if(productVision){
      const missing=(ops??[]).filter(op=>op.type==='add'&&!op.item.sku?.startsWith('custom-')&&!seenProducts.has(op.item.sku??'')).map(op=>op.type==='add'?op.item.sku:undefined);
      if(missing.length)return result({ok:false,errors:[{check:'visual_evidence',message:'Call show_candidates before selecting these products; inspect appearance and retry.',item_ids:missing}]},true);
    }
    let assets:Awaited<ReturnType<CustomSlots['validateOps']>>=[];
    try{assets=slots?await slots.validateOps(parseOps(ops)):[];}catch(error){return result(String(error),true);}
    const proposal=session.propose(ops,rationale);
    if (proposal.ok && proposalsDir) {
      const temporary = join(proposalsDir, `.${proposal.proposal_id}-${randomUUID()}.tmp`);
      try {
        await mkdir(proposalsDir, { recursive: true });
        await writeFile(temporary, JSON.stringify({...proposal.proposal,...(assets?.length?{assets}:{})}), { flag: 'wx', mode: 0o600 });
        await rename(temporary, join(proposalsDir, `${proposal.proposal_id}.json`));
      } catch {
        await rm(temporary, { force: true }).catch(() => {});
        return result({ ok: false, errors: [{ check: 'persistence',
          message: 'Could not save the checked proposal for the editor; retry after checking the proposal directory.' }] }, true);
      }
    }
    if(proposal.ok&&assets?.length)await slots!.markProposed(assets);
    return result({...proposal,...(assets?.length?{assets}:{})},!proposal.ok);
  });
  server.registerTool('search_catalog', {
    description:'For ANY whole-room style request, use room_id plus style_request (the customer words), remake:true and optional remove_ids/excluded_roles. Searches every program kind and returns two complete physically checked compositions ranked by taste. Propose candidate_id; do not write coordinates or omit essentials. For single products, find sized, priced catalog furniture. Returns item descriptions for place, plus size/price provenance. Mock prices are explicitly labeled; unavailable catalog is never replaced with invented products.',
    inputSchema:searchCatalogInputSchema.extend({room_id:z.string().optional(),style_request:z.string().optional(),remake:z.boolean().optional(),remove_ids:z.array(z.string()).optional(),excluded_roles:z.array(z.string()).optional()}),
  },async request=>{
    const {room_id,style_request,remake,remove_ids,excluded_roles,...productQuery}=request;
    const query=options.catalogQuery??(process.env.VARPET_CATALOG_PROXY?proxyCatalogQuery(room_id,style_request?{remake,remove_ids}:{}):undefined);
    if(style_request){
      stylePlanning=true;styleCandidates=[];
      try{
        if(!room_id)throw new Error('Style requests require room_id');
        const plan=await designRoom(scene,{room_id,style_request,remake,remove_ids,excluded_roles,customer_requests:options.customerRequests},query);
        styleCandidates=plan.candidates;
        return result({knowledge:plan.knowledge,missing_kinds:plan.catalog.missing_kinds,unavailable_kinds:plan.catalog.unavailable_kinds,incomplete_kinds:plan.catalog.incomplete_kinds,retried_kinds:plan.catalog.retried_kinds,reason:(!plan.candidates.length&&(plan.catalog.incomplete_kinds.length||plan.catalog.unavailable_kinds.length))?'Catalog or fit search is incomplete; no absence or impossibility is proven.':plan.reason,selected_id:plan.selected_id,
          candidates:plan.candidates.map(c=>({id:c.id,intent:c.intent,composition:c.composition,items:c.ops.filter(op=>op.type==='add').map(op=>op.item),physical_checks_passed:c.checks.ok,cost_dram:c.checks.price.cost_dram}))});
      }catch(error){return result({ok:false,reason:String(error)},true);}
    }
    const catalog=await searchCatalog(productQuery,query);
    if(catalog.status==='available')slots?.searchedCatalog(productQuery.kind);
    return result(catalog,catalog.status==='unavailable');
  });
  server.registerTool('ask', {
    description:'Ask the customer one concise question, optionally with two to four choices, then wait for their next message.',
    inputSchema:askInputSchema,
  },request=>result(ask(request)));
  if(process.env.VARPET_CATALOG_PROXY)server.registerTool('show_candidates',{
    description:'Inspect rendered previews of up to 16 IDs returned by the current room-fit search. Use for appearance judgement; pictures do not replace physical checks.',
    inputSchema:{item_ids:z.array(z.string()).min(1).max(16)},
  },async({item_ids})=>{
    const response=await fetch(process.env.VARPET_CATALOG_PROXY+'show',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_ids,context:process.env.VARPET_CATALOG_CONTEXT}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)return result({error:'Candidate previews unavailable'},true);
    return await response.json();
  });
  return server;
}

async function main() {
  const sceneArg = process.argv.indexOf('--scene');
  const scenePath = sceneArg >= 0 ? process.argv[sceneArg+1] : process.env.VARPET_SCENE;
  if (!scenePath) throw new Error('Supply --scene /absolute/path/to/scene.json or VARPET_SCENE');
  const scene = parseScene(JSON.parse(await readFile(scenePath,'utf8')));
  let customerRequests:string[]=[];
  try { const value:unknown=JSON.parse(await readFile(`${scenePath}.requests.json`,'utf8'));
    if(!Array.isArray(value)||!value.every(v=>typeof v==='string'))throw new Error('Customer requests must be strings');
    customerRequests=value;
  } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  await createServer(scene,{customerRequests}).connect(new StdioServerTransport());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
