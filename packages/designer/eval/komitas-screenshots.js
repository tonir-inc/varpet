// Run through Playwright browser_run_code_unsafe(filename=...). Uses the real editor renderer.
async (page) => {
  await page.goto('http://127.0.0.1:5193/');
  await page.setViewportSize({width:1600,height:1200});
  const root='/Users/ashotarushanyan/AshProjects/varpet-dservice/packages/designer/eval/komitas';
  const ids=await page.evaluate(async root=>(await(await fetch('/@fs'+root+'/ground-truth.json')).json()).map(r=>r.id),root);
  const results=[];
  for(const id of ids) {
    const ready=await page.evaluate(async({root,id})=>{
      const m=await fetch('/@fs'+root+'/'+id+'.metrics.json');if(!m.ok)return false;
      const metrics=await m.json();const response=await fetch('/@fs'+root+'/'+id+(metrics.accepted?'.scene.json':'.rejected.json'));
      if(!response.ok)return false;const scene=await response.json();
      const {createViewport}=await import('/src/render/viewport.ts');window.komitasViewport?.dispose();
      document.body.innerHTML='<div id="komitas-viewport" style="position:fixed;inset:0"></div><div id="komitas-label" style="position:fixed;top:24px;left:24px;padding:14px 20px;background:white;color:#242424;font:20px sans-serif;z-index:10"></div>';
      window.komitasErrors=[];window.komitasLabel=id+' · '+(metrics.accepted?'ACCEPTED':'NOT ACCEPTED · see gate report');
      window.komitasViewport=createViewport(document.getElementById('komitas-viewport'),{onSelect(){},onTransform(){},onInteraction(){},onError(e){window.komitasErrors.push(e)}});
      window.komitasViewport.setScene(scene,[]);window.komitasViewport.setLayer('ceilings',false);window.komitasViewport.setWalls('cutaway');
      return true;
    },{root,id});
    if(!ready)continue;
    await page.waitForTimeout(200);
    for(const [view,suffix] of [['top','top'],['perspective','3d']]) {
      await page.evaluate(view=>{window.komitasViewport.setView(view);window.komitasViewport.focus();document.getElementById('komitas-label').textContent=window.komitasLabel+(view==='top'?' · North ↑':' · 3D');},view);
      await page.waitForTimeout(750);
      await page.screenshot({path:root+'/'+id+'-'+suffix+'.png',scale:'css'});
    }
    results.push({id,errors:await page.evaluate(()=>window.komitasErrors)});
  }
  return results;
}
