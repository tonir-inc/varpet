/** Run in a browser at /grouping-qa.html; uses the real viewport, controls and store. */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewport } from './viewport';
import { EditorStore } from '../core/store';
import { demoScene, localCatalog } from '../core/demo';
import type { Operation } from '../contracts';

const output = document.querySelector<HTMLPreElement>('#results')!;
let assertions = 0, commandId = 0, revision = 0, commits = 0;
const lines: string[] = [];
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
  assertions++; lines.push(`PASS ${message}`); output.textContent = lines.join('\n');
}
const near = (a: number, b: number) => Math.abs(a-b)<1e-7;
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
let controls: TransformControls;
const attach = TransformControls.prototype.attach;
TransformControls.prototype.attach = function(object) { controls = this; return attach.call(this, object); };
const store = new EditorStore(demoScene, localCatalog);
const ids = store.scene.objects.slice(0,2).map(object => object.id);
const apply = (operation: Operation, baseRevision=store.revision) => store.execute({id:`group-browser-${++commandId}`,label:'Group browser check',source:'human',baseRevision,operations:[operation]},true);
const viewport = createViewport(document.querySelector<HTMLElement>('#viewport')!, {
  onSelect() {}, onError(message) { throw new Error(message); },
  onInteraction(active) { if (active) revision=store.revision; },
  onTransform(id,patch) { commits++; apply({type:'update',id,patch},revision); viewport.setScene(store.scene,localCatalog); viewport.setSelection(ids[0]!); },
});
store.subscribe(() => viewport.setScene(store.scene,localCatalog));
function roots(): THREE.Object3D[] {
  const scene=controls!.object!.parent!;
  return ids.map(id => scene.children.find(child=>child.userData.objectId===id)!);
}
function begin() { controls!.dispatchEvent({type:'mouseDown',mode:controls!.mode}); }
function change(dx: number, dz: number) {
  controls!.object!.position.x += dx; controls!.object!.position.z += dz;
  controls!.dispatchEvent({type:'objectChange'});
}
function end() { controls!.dispatchEvent({type:'mouseUp',mode:controls!.mode}); }
try {
  assert(apply({type:'group',id:'browser-group',objectIds:ids}).ok,'group created through checked command');
  viewport.setScene(store.scene,localCatalog); viewport.setSelection(ids[0]!); viewport.setTool('move'); await tick();
  const original=store.scene.objects.filter(object=>ids.includes(object.id));
  const before=store.revision;
  begin(); change(0.5,0.25);
  assert(roots().every((root,i)=>near(root.position.x,original[i]!.position[0]+0.5)&&near(root.position.z,original[i]!.position[2]+0.25)),'all group members follow during live drag');
  assert(store.revision===before,'preview leaves authoritative scene unchanged');
  viewport.cancelInteraction();
  assert(roots().every((root,i)=>near(root.position.x,original[i]!.position[0])&&near(root.position.z,original[i]!.position[2])),'cancel restores every rendered group member');
  assert(commits===0 && store.revision===before,'cancel creates no history');
  begin(); change(0.5,0.25); end();
  assert(commits===1 && store.revision===before+1,'group release commits exactly once');
  assert(ids.every((id,i)=>near(store.scene.objects.find(object=>object.id===id)!.position[0],original[i]!.position[0]+0.5)),'checked release moves every member');
  store.undo(); await tick();
  assert(roots().every((root,i)=>near(root.position.x,original[i]!.position[0])),'one undo restores all rendered members');
  begin(); change(150,0); end();
  assert(roots().every((root,i)=>near(root.position.x,original[i]!.position[0])),'rejected placement restores every rendered member');
  viewport.setTool('rotate'); begin();
  controls!.object!.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),original[0]!.rotation+Math.PI/2);
  controls!.dispatchEvent({type:'objectChange'});
  const dx=original[1]!.position[0]-original[0]!.position[0], dz=original[1]!.position[2]-original[0]!.position[2];
  assert(near(roots()[1]!.position.x,original[0]!.position[0]+dz)&&near(roots()[1]!.position.z,original[0]!.position[2]-dx),'rotation orbits members in live preview');
  viewport.cancelInteraction();
  viewport.setTool('scale'); assert(!controls!.object,'group resize handle is disabled');
  viewport.setSelection(ids[0]!,[...ids,store.scene.objects[2]!.id]); viewport.setTool('move');
  assert(!controls!.object,'mixed multiselection cannot move a partial group');
  viewport.dispose(); TransformControls.prototype.attach=attach;

  const frame=document.createElement('iframe'); frame.src='/?grouping-ui-check'; document.body.append(frame);
  await new Promise<void>(resolve=>frame.onload=()=>resolve());
  const doc=frame.contentDocument!;
  const until = async (predicate:()=>boolean) => { const start=performance.now(); while(!predicate()) { if(performance.now()-start>15000)throw new Error('UI did not become ready'); await tick(); } };
  await until(()=>!!doc.querySelector('[data-object]'));
  const click=(selector:string,shiftKey=false)=>{ const target=doc.querySelector<HTMLElement>(selector); if(!target)throw new Error(`Missing control ${selector}`); target.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey})); };
  const rows=[...doc.querySelectorAll<HTMLElement>('[data-object]')].slice(0,2).map(row=>row.dataset.object!);
  click(`[data-object="${rows[0]}"]`); click(`[data-object="${rows[1]}"]`,true);
  assert(doc.querySelectorAll('.object-row.selected').length===2,'Shift-click selects two furniture rows');
  click('#group-furniture');
  assert(doc.querySelector('#inspector')!.textContent!.includes('Furniture group'),'Group action opens the group inspector');
  assert(doc.querySelector('#revision')!.textContent==='Revision 1','grouping creates one revision');
  const x=doc.querySelector<HTMLInputElement>('[data-group-axis="0"]')!, xBefore=Number(x.value);
  x.value=String(xBefore+0.5); x.dispatchEvent(new Event('change',{bubbles:true}));
  assert(doc.querySelector('#revision')!.textContent==='Revision 2','numeric group move commits once');
  click('#undo');
  assert(Number(doc.querySelector<HTMLInputElement>('[data-group-axis="0"]')!.value)===xBefore,'UI undo restores the group position');
  click('#close-inspector'); click(`[data-object="${rows[0]}"]`);
  assert(doc.querySelectorAll('.object-row.selected').length===2,'selecting any member selects the saved group');
  click('#ungroup-furniture');
  assert(doc.querySelectorAll('.object-row.selected').length===1 && !!doc.querySelector('#object-name'),'Ungroup returns to individual editing');
  lines.push(`PASS ${assertions} browser grouping assertions`); output.textContent=lines.join('\n');
} catch(error) {
  output.textContent=lines.join('\n')+`\nFAIL ${error instanceof Error ? error.stack : String(error)}`;
  TransformControls.prototype.attach=attach;
}
