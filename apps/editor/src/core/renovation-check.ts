/** V2 acceptance checks: new coverage without altering the original v1 assertions. */
import type { Operation, SceneDocument, CatalogAsset } from '../contracts';
import {demoScene,localCatalog} from './demo';
import {EditorStore} from './store';
import {migrateScene,componentPosition,analyzeProject} from './renovation';
import {validateScene} from './validation';
import {serializeScene,parseScene} from './persistence';
let n=0; function assert(condition: unknown, message: string): asserts condition { n++; if (!condition) throw Error(message); }
const scene=migrateScene({...demoScene,objects:[]});
assert(validateScene(scene,localCatalog).ok,'migration valid');
assert(scene.project!.metadata[scene.walls[0]!.id]!.structuralRole==='unknown','migration not confirmed');
const store=new EditorStore(scene,localCatalog);let id=0;
const exec=(ops: Operation[])=>store.execute({id:`c-${id++}`,label:'Check',source:'human',baseRevision:store.revision,operations:ops},true);
const apply=(ops: Operation[])=>{const result=exec(ops);assert(result.ok,JSON.stringify(result));};
apply([{type:'add-room',room:{id:'balcony',name:'Balcony',polygon:[[10,0],[13,0],[13,2],[10,2]],color:'#cccccc'}},{type:'set-metadata',id:'balcony',patch:{zone:'balcony',elevation:0.1}}]);
apply([{type:'add-wall',wall:{id:'edit-wall',start:[10,0],end:[13,0],height:2.7,thickness:.2,color:'#ffffff',openings:[]}}]);
apply([{type:'add-opening',wallId:'edit-wall',opening:{id:'edit-door',kind:'door',offset:.5,width:.9,height:2.1,sill:0}}]);
apply([{type:'set-metadata',id:'edit-door',patch:{role:'entrance',mechanism:'hinged',hinge:'right',swing:-1}}]);
apply([{type:'upsert-source',source:{id:'measurement',name:'Width measurement',kind:'measurement'}},{type:'upsert-assumption',assumption:{id:'width',entityId:'edit-door',property:'width',value:'0.9 m',status:'measured',sourceKind:'measured',sourceIds:['measurement'],rationale:'Site measure',alternatives:[]}}]);
apply([{type:'upsert-component',component:{id:'lamp1',name:'Light',kind:'light',position:[11,2,1],rotation:0,dimensions:[.2,.2,.2],color:'#ffffff',phase:'new',light:{brightness:100,temperature:3000,enabled:true}}},{type:'upsert-component',component:{id:'switch1',name:'Switch',kind:'switch',position:[0,0,0],rotation:0,dimensions:[.08,.08,.04],color:'#ffffff',phase:'new',host:{wallId:'edit-wall',offset:2,elevation:1.1,side:1},control:{type:'two-way',targets:['lamp1'],gangs:1}}}]);
apply([{type:'upsert-route',route:{id:'wire1',name:'Cable',system:'electrical',points:[[0,0,0],[11,2,1]],from:'switch1',to:'lamp1',phase:'new',diameter:.01}}]);
const oldX=componentPosition(store.scene,store.scene.project!.components[1]!)[0];
apply([{type:'update-wall',id:'edit-wall',patch:{start:[11,0],end:[14,0]}}]);
assert(componentPosition(store.scene,store.scene.project!.components[1]!)[0]===oldX+1,'host follows wall');
assert(store.scene.project!.routes[0]!.points[0]![0]===oldX+1,'route follows host');
assert(store.scene.rooms.find(r=>r.id==='balcony')!.polygon[0]![0]===11,'room follows wall');
assert(store.scene.project!.assumptions[0]!.status==='stale','changed inference stale');
const before=store.scene;assert(!exec([{type:'delete-component',id:'lamp1'}]).ok,'dangling control and route blocked');assert(before===store.scene,'failed atomic');
apply([{type:'capture-baseline'},{type:'create-option',id:'option1',name:'Option 1'}]);
apply([{type:'update-opening',id:'edit-door',patch:{width:1}}]);
assert(store.scene.project!.metadata['edit-wall']!.review==='required','renovation wall review');
apply([{type:'create-option',id:'option2',name:'Option 2'},{type:'update-opening',id:'edit-door',patch:{width:1.1}}]);
apply([{type:'switch-option',id:'option1'}]);
assert(store.scene.walls.find(w=>w.id==='edit-wall')!.openings[0]!.width===1,'option restored');
apply([{type:'restore-baseline'}]);
assert(store.scene.walls.find(w=>w.id==='edit-wall')!.openings[0]!.width===.9,'baseline restored');
apply([{type:'split-wall',id:'edit-wall',offset:1.6,newId:'edit-wall-2'}]);
assert(store.scene.project!.components[1]!.host!.wallId==='edit-wall-2','split transfers hosts');
apply([{type:'join-walls',id:'edit-wall',otherId:'edit-wall-2'}]);
assert(String(store.scene.project!.components[1]!.host!.wallId)==='edit-wall','join transfers hosts');
const json=serializeScene(store.scene);assert(serializeScene(parseScene(json,localCatalog))===json,'v2 lossless');
assert(analyzeProject(store.scene,localCatalog).issues.length>0,'issues reported');
const checkBad=(mutate: (scene: SceneDocument) => void,label: string)=>{const bad=structuredClone(store.scene);mutate(bad);let result;try{result=validateScene(bad,localCatalog)}catch(e){throw Error(`${label} threw: ${e}`)}assert(!result.ok,label)};
checkBad(s=>(s.project as unknown as Record<string,unknown>).bad=1,'unknown project fields');
checkBad(s=>s.project!.components[0]!.position[0]=NaN,'NaN rejected');
checkBad(s=>s.project!.components.push(null as never),'null component');
checkBad(s=>s.project!.sources.push(null as never),'null source');
checkBad(s=>s.project!.materials.push(null as never),'null material');
checkBad(s=>s.project!.tasks.push(null as never),'null task');
checkBad(s=>s.project!.sources[0]!.dataUrl='data:image/svg+xml;base64,YQ==','SVG blocked');
checkBad(s=>s.project!.options[0]!.snapshot.rooms[0]!.polygon=[],'invalid inactive geometry');


// Shared evidence can target an entity that exists only in another saved option.
apply([{type:'create-option',id:'evidence-option',name:'Evidence option'}]);
apply([{type:'add-wall',wall:{id:'only-in-option',start:[20,0],end:[22,0],height:2.7,thickness:.2,color:'#ffffff',openings:[]}}, {type:'upsert-assumption',assumption:{id:'option-assumption',entityId:'only-in-option',property:'structure',value:'Unknown',status:'unresolved',sourceKind:'unknown',sourceIds:[],rationale:'Needs assessment',alternatives:[]}}]);
apply([{type:'switch-option',id:'option1'}]);
assert(store.scene.project!.assumptions.some(a=>a.id==='option-assumption'),'shared assumption survives option switching');
apply([{type:'restore-baseline'}]);
assert(store.scene.project!.assumptions.some(a=>a.id==='option-assumption'),'shared assumption survives baseline restoration');

// Inference invalidation propagates through dependent assumptions without silently losing evidence.
apply([{type:'upsert-assumption',assumption:{id:'cabinet-dependency',entityId:'lamp1',property:'clearance',value:'Fits',status:'accepted',sourceKind:'inferred',sourceIds:[],rationale:'Depends on door width',alternatives:[],dependsOn:['width']}}]);
apply([{type:'upsert-source',source:{id:'measurement',name:'Revised measurement',kind:'measurement'}}]);
assert(store.scene.project!.assumptions.find(a=>a.id==='cabinet-dependency')!.status==='stale','staleness propagates through inference dependencies');

// Raised balcony doors are explicit v2 geometry; v1 remains unchanged.
apply([{type:'update-opening',id:'edit-door',patch:{sill:.1,height:2}}]);
assert(store.scene.walls.find(w=>w.id==='edit-wall')!.openings[0]!.sill===.1,'v2 accepts raised door opening');
apply([{type:'set-metadata',id:'balcony',patch:{elevation:.2}}]);
const floating = structuredClone(store.scene);
floating.objects = [{id:'floating-probe',name:'Floating probe',assetId:localCatalog[0]!.id,position:[90,2,90],rotation:0,scale:[1,1,1]}];
assert(validateScene(floating,localCatalog).ok && validateScene(floating,localCatalog).warnings.some(w=>w.includes('floor plan')),'v2 unsupported elevation is a visible correction warning');

// Material quantities retain dimensionally meaningful units and exclude removed work.
apply([{type:'upsert-material',material:{id:'paint',name:'Paint',color:'#eeeeee',unit:'m2',unitCost:5,thickness:.001,wastePercent:10}},{type:'upsert-finish',finish:{id:'wall-paint',entityId:'edit-wall',materialId:'paint',surface:'wall-front'}}]);
assert(analyzeProject(store.scene,localCatalog).quantities.some(q=>q.id==='wall-paint' && q.cost>0),'finish quantity and cost derived');
checkBad(s=>{s.project!.materials.find(m=>m.id==='paint')!.unit='each'},'mismatched finish unit rejected');
apply([{type:'set-project',patch:{mode:'renovate'}},{type:'delete-wall',id:'edit-wall'}]);
assert(!analyzeProject(store.scene,localCatalog).quantities.some(q=>q.id==='wall-paint'),'removed wall finish excluded from cost');
assert(analyzeProject(store.scene,localCatalog).issues.some(i=>i.id==='removed-host:switch1'),'mounted fixtures on removed wall need relocation');

// Boundary checks reject semantic network errors and malformed nested records.
checkBad(s=>{s.project!.components.find(c=>c.id==='switch1')!.control!.targets=['lamp1','lamp1']},'duplicate switch control rejected');
checkBad(s=>{s.project!.routes[0]!.from='missing'},'dangling physical route rejected');
checkBad(s=>{s.project!.routes[0]!.system='water-hot'},'incompatible service endpoint rejected');
checkBad(s=>{s.project!.routes[0]!.points[0]=[50,0,50]},'disconnected route endpoint rejected');
checkBad(s=>{s.project!.assumptions[0]!.sourceIds=['missing']},'missing evidence rejected');
checkBad(s=>{s.project!.assumptions.find(a=>a.id==='width')!.dependsOn=['cabinet-dependency']},'inference cycle rejected');
checkBad(s=>{s.project!.tasks=[{id:'a',title:'A',trade:'General',status:'todo',entityIds:[],dependsOn:['b'],allowance:0},{id:'b',title:'B',trade:'General',status:'todo',entityIds:[],dependsOn:['a'],allowance:0}]},'work dependency cycle rejected');
const rejectedRevision=store.revision;
assert(!exec([{type:'set-metadata',id:'missing',patch:{phase:'new'}}]).ok && store.revision===rejectedRevision,'missing metadata entity rejects without revision');
assert(!exec([{type:'set-project',patch:{mode:'correct',secret:1} as never}]).ok,'unsupported operation patch rejects');
const beforeUndo=serializeScene(store.scene);
apply([{type:'set-project',patch:{currency:'EUR'}}]);
assert(store.undo().ok && serializeScene(store.scene)===beforeUndo,'v2 undo restores exact metadata/evidence/options');
assert(store.redo().ok && store.scene.project!.currency==='EUR','v2 redo restores renovation data');

// Splitting and rejoining preserve the complete finish area without duplicating the cost.
const finishStore = new EditorStore(migrateScene({...demoScene,objects:[]}),localCatalog);
let finishCommand=0;
const finishExec=(operations:Operation[])=>finishStore.execute({id:`finish-${finishCommand++}`,label:'Finish topology check',source:'human',baseRevision:finishStore.revision,operations},true);
function finishApply(operations:Operation[]):void { const result=finishExec(operations);assert(result.ok,result.errors.join(' ')); }
finishApply([{type:'add-wall',wall:{id:'finish-wall',start:[20,0],end:[24,0],height:2.7,thickness:.2,color:'#eeeeee',openings:[]}},{type:'upsert-material',material:{id:'wall-coat',name:'Wall coating',color:'#ffffff',unit:'m2',unitCost:10,thickness:.002,wastePercent:5}},{type:'upsert-finish',finish:{id:'coat-front',entityId:'finish-wall',surface:'wall-front',materialId:'wall-coat'}}]);
const initialFinishCost=analyzeProject(finishStore.scene,localCatalog).totalCost;
finishApply([{type:'split-wall',id:'finish-wall',offset:2,newId:'finish-wall-other'}]);
assert(finishStore.scene.project!.finishes.length===2,'split copies finish onto second segment');
assert(Math.abs(analyzeProject(finishStore.scene,localCatalog).totalCost-initialFinishCost)<1e-8,'split preserves total coated area and cost');
finishApply([{type:'upsert-assumption',assumption:{id:'second-width',entityId:'finish-wall-other',property:'length',value:'2 m',status:'accepted',sourceKind:'inferred',sourceIds:[],rationale:'Split measurement',alternatives:[]}}]);
finishApply([{type:'join-walls',id:'finish-wall',otherId:'finish-wall-other'}]);
assert(Number(finishStore.scene.project!.finishes.length)===1,'join deduplicates matching surface finishes');
assert(Math.abs(analyzeProject(finishStore.scene,localCatalog).totalCost-initialFinishCost)<1e-8,'join preserves total coated area and cost');
assert(finishStore.scene.project!.assumptions.find(a=>a.id==='second-width')!.status==='stale','joined second-segment assumption is stale');
assert(finishStore.scene.project!.assumptions.find(a=>a.id==='second-width')!.entityId==='finish-wall','joined evidence relinks to retained wall');
finishApply([{type:'split-wall',id:'finish-wall',offset:2,newId:'finish-wall-other'}]);
finishApply([{type:'set-metadata',id:'finish-wall-other',patch:{structuralRole:'structural'}}]);
let joinBefore=finishStore.scene;
assert(!finishExec([{type:'join-walls',id:'finish-wall',otherId:'finish-wall-other'}]).ok && finishStore.scene===joinBefore,'join rejects conflicting structural role atomically');
finishApply([{type:'set-metadata',id:'finish-wall-other',patch:{structuralRole:'unknown'}}]);
finishApply([{type:'delete-finish',id:finishStore.scene.project!.finishes.find(f=>f.entityId==='finish-wall-other')!.id}]);
joinBefore=finishStore.scene;
assert(!finishExec([{type:'join-walls',id:'finish-wall',otherId:'finish-wall-other'}]).ok && finishStore.scene===joinBefore,'join rejects partial incompatible finishes atomically');

// Review uses live renovation networks; demolished supply and controls do not satisfy connectivity.
const networkScene=migrateScene({...demoScene,objects:[]});
networkScene.project!.components=[{id:'net-light',name:'Network light',kind:'light',position:[0,2,0],dimensions:[.2,.2,.2],rotation:0,color:'#ffffff',phase:'new',light:{brightness:800,temperature:3000,enabled:true}},{id:'net-switch',name:'Network switch',kind:'switch',position:[1,1,0],dimensions:[.1,.1,.1],rotation:0,color:'#ffffff',phase:'new',control:{type:'single',targets:['net-light'],gangs:1}}];
networkScene.project!.routes=[{id:'net-wire',name:'Network wire',system:'electrical',points:[[1,1,0],[0,2,0]],from:'net-switch',to:'net-light',phase:'new',diameter:.01}];
assert(!analyzeProject(networkScene,localCatalog).issues.some(i=>i.id==='supply:net-light'),'active connection satisfies supply drawing check');
networkScene.project!.routes[0]!.phase='remove';
assert(analyzeProject(networkScene,localCatalog).issues.some(i=>i.id==='supply:net-light'),'removed wire does not satisfy supply drawing check');
networkScene.project!.routes[0]!.phase='new';networkScene.project!.components[1]!.phase='remove';
assert(analyzeProject(networkScene,localCatalog).issues.some(i=>i.id==='control:net-light'),'removed switch does not satisfy lighting control check');
assert(analyzeProject(networkScene,localCatalog).issues.some(i=>i.id==='removed-endpoint:net-wire'),'active route to removed equipment requires review');
assert(analyzeProject(networkScene,localCatalog).issues.some(i=>i.id==='supply:net-light'),'removed supply endpoint does not satisfy supply drawing check');

// Mechanical updates invalidate directly hosted evidence, even without manually entered dependency links.
finishApply([{type:'upsert-component',component:{id:'hosted-proof',name:'Mounted light',kind:'light',position:[0,0,0],dimensions:[.2,.2,.2],rotation:0,color:'#ffffff',phase:'existing',host:{wallId:'finish-wall',offset:1,elevation:1,side:1},light:{brightness:800,temperature:3000,enabled:true}}},{type:'upsert-route',route:{id:'following-proof',name:'Following route',system:'electrical',points:[[21,1,.2],[21,2,1]],from:'hosted-proof',diameter:.01,phase:'existing'}},{type:'add-opening',wallId:'finish-wall-other',opening:{id:'connected-opening',kind:'window',offset:.4,width:.5,height:1,sill:1}}]);
for(const entityId of ['hosted-proof','following-proof','connected-opening']) finishApply([{type:'upsert-assumption',assumption:{id:`proof-${entityId}`,entityId,property:'position',value:'Confirmed for view',status:'accepted',sourceKind:'observed',sourceIds:[],rationale:'Recorded geometry',alternatives:[]}}]);
finishApply([{type:'update-wall',id:'finish-wall',patch:{end:[22,1]}}]);
for(const entityId of ['hosted-proof','following-proof','connected-opening']) assert(finishStore.scene.project!.assumptions.find(a=>a.id===`proof-${entityId}`)!.status==='stale',`indirect ${entityId} geometry invalidates its assumption`);

// Door envelopes match actual split leaves and ignore furnishings proposed for removal.
const swingCatalog:CatalogAsset[]=[{id:'swing-asset',name:'Swing probe',category:'Check',kind:'table',dimensions:[.2,.8,.2],color:'#eeeeee',price:0,source:{type:'procedural'}}];
const swingScene=migrateScene({format:'varpet.editor',version:1,id:'swing-scene',name:'Swing scene',units:'m',upAxis:'Y',rooms:[{id:'swing-room',name:'Swing room',polygon:[[-5,-5],[5,-5],[5,5],[-5,5]],color:'#eeeeee'}],walls:[{id:'swing-wall',start:[-2,0],end:[2,0],height:2.7,thickness:.2,color:'#ffffff',openings:[{id:'swing-door',kind:'door',offset:1,width:2,height:2.1,sill:0}]}],objects:[{id:'swing-probe',name:'Swing probe',assetId:'swing-asset',position:[0,0,1.4],rotation:0,scale:[1,1,1]}]});
swingScene.project!.metadata['swing-door']={mechanism:'double'};
assert(!analyzeProject(swingScene,swingCatalog).issues.some(i=>i.id==='swing:swing-door:swing-probe'),'double door uses two half-width swept leaves');
swingScene.project!.metadata['swing-door']={mechanism:'hinged'};
assert(analyzeProject(swingScene,swingCatalog).issues.some(i=>i.id==='swing:swing-door:swing-probe'),'single full leaf detects actual obstacle');
swingScene.project!.metadata['swing-probe']={phase:'remove'};
assert(!analyzeProject(swingScene,swingCatalog).issues.some(i=>i.id==='swing:swing-door:swing-probe'),'removed furniture does not block proposed swing');
swingScene.walls.push({id:'mount-wall',start:[.4,1.1],end:[.4,5.1],height:2.7,thickness:.2,color:'#ffffff',openings:[]});
swingScene.project!.components.push({id:'rotated-host',name:'Rotated mounted cabinet',kind:'cabinet',position:[0,0,0],dimensions:[2,.8,.1],rotation:0,color:'#ffffff',phase:'new',host:{wallId:'mount-wall',offset:1,elevation:0,side:1}});
assert(analyzeProject(swingScene,swingCatalog).issues.some(i=>i.id==='swing:swing-door:rotated-host'),'door obstacle respects world rotation of mounted equipment');
export const renovationAssertions=n;
console.log(`Renovation checks passed (${n} assertions).`);
