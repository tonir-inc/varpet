import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';
import type { Operation, SceneDocument } from '../contracts';
import { renderEntityInspector, renderAssetChoices } from './inspector';

/** Browser regression checks: native HTML validity cannot be proved by the node runner. */
export function checkInspectorDOM(container: HTMLElement): string {
  let count = 0;
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); count++; };
  const store = new EditorStore(demoScene, localCatalog);
  let id = 'window-west';
  let preview = 0;
  const execute = (operations: Operation[], label: string) => store.execute({id:crypto.randomUUID(),source:'human',baseRevision:store.revision,label,operations},true).ok;
  const config = {getScene:()=>store.scene,getCatalog:()=>localCatalog,execute,notice:()=>{},refresh:render,advanced:()=>{},getDoorAngle:()=>preview,testDoor:(_:string,angle:number)=>{preview=angle;}};
  function render() { renderEntityInspector(container,id,config); }
  const stop = store.subscribe(render);
  try {
    render();
    check(container.querySelector('form')!.checkValidity(), 'Untouched opening form must be valid');
    check(execute([{type:'migrate-project'},{type:'set-metadata',id,patch:{frameWidth:0.045,leafThickness:0.0375}},{type:'update-opening',id,patch:{offset:4.5001234}}],'Precise source dimensions'), 'Precise source dimensions are accepted');
    const offset = container.querySelector<HTMLInputElement>('[name="offset"]')!;
    check(offset.valueAsNumber === 4.5001234, 'Rendering retains the original offset precision');
    check(container.querySelector('form')!.checkValidity(), '45 mm frame and fractional dimensions remain valid');
    container.querySelector<HTMLInputElement>('[name="width"]')!.value = '2.3';
    container.querySelector('form')!.requestSubmit();
    const opening = store.scene.walls.flatMap(w=>w.openings).find(o=>o.id===id)!;
    check(opening.width === 2.3 && opening.offset === 4.5001234, 'Editing width preserves precise offset');
    check(store.scene.project?.metadata[id]?.frameWidth === 0.045 && store.scene.project.metadata[id]?.leafThickness === 0.0375, 'Editing width preserves precise frame dimensions');
    id = 'door-entry';
    check(execute([{type:'update-opening',id,patch:{sill:0.1234}}],'Raised door'), 'Raised door source is accepted');
    container.querySelector<HTMLInputElement>('[name="width"]')!.value = '1';
    container.querySelector('form')!.requestSubmit();
    check(store.scene.walls.flatMap(w=>w.openings).find(o=>o.id===id)?.sill === 0.1234, 'Door base survives unrelated width edits');
    container.querySelector<HTMLButtonElement>('[data-opening-type="sliding"]')!.click();
    check(store.scene.project?.metadata[id]?.mechanism === 'sliding', 'Door type control executes checked edit');
    const revision = store.revision;
    container.querySelector<HTMLButtonElement>('[data-angle="90"]')!.click();
    check(preview === Math.PI / 2 && store.revision === revision, 'Opening preview changes no document revision');
    store.undo();
    check(!store.scene.project?.metadata[id]?.mechanism, 'Undo restores unspecified type');
    check(!container.querySelector('[data-opening-type][aria-pressed="true"]'), 'Unspecified does not appear confirmed');
    check(execute([{type:'upsert-component',component:{id:'qa-cabinet',name:'Removed cabinet',kind:'cabinet',position:[-1,0,0],dimensions:[0.3,0.6,0.3],rotation:0,color:'#777777',phase:'remove'}}],'Removed cabinet'), 'Removed component is accepted');
    id = 'qa-cabinet'; render();
    check(container.querySelector<HTMLInputElement>('#component-color')!.disabled, 'Removed component finish control is disabled');
    const before = store.revision;
    container.querySelector<HTMLInputElement>('#component-color')!.dispatchEvent(new Event('change'));
    check(store.revision === before, 'Removed component handler cannot submit a finish edit');
    const plant = store.scene.objects.find(o=>o.id==='living-olive')!;
    renderAssetChoices(container,plant,config);
    const select = container.querySelector('select')!;
    select.value = 'plant-small'; select.dispatchEvent(new Event('change'));
    check(store.scene.objects.find(o=>o.id===plant.id)?.assetId === 'plant-small', 'Decoration replacement keeps the selected identity');
    return `Inspector DOM checks passed: ${count} assertions.`;
  } finally { stop(); }
}
