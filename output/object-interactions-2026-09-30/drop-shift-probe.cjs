const {chromium}=require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'), path=require('node:path');
const extra=`
    const shiftAt = [27.613,0,18.137];
    const shiftDrag = (type, shift) => {
      const delivered = new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data,shiftKey:shift,...point(shiftAt)});
      canvas.dispatchEvent(delivered); return delivered;
    };
    const previewBounds = () => controls.getHelper().parent.getObjectByName('Furniture drop preview');
    const liveDropCue = () => [...document.querySelectorAll('.placement-measurement')].find(element=>!element.hidden)?.textContent || '';
    viewport.setSnap(true); data=begin(); revision=store.revision;
    const shiftHover = shiftDrag('dragover',true);
    let shiftPreviewPixel = point([previewBounds().position.x,0,previewBounds().position.z]);
    check(liveDropCue().includes('Smooth') && Math.hypot(shiftPreviewPixel.clientX-shiftHover.clientX,shiftPreviewPixel.clientY-shiftHover.clientY)<1e-4,'catalog Shift hover displays Smooth and follows exact delivered pointer pixel');
    shiftDrag('dragover',false);
    check(liveDropCue().includes('Snap on') && Math.abs(previewBounds().position.x*4-Math.round(previewBounds().position.x*4))<1e-6 && Math.abs(previewBounds().position.z*4-Math.round(previewBounds().position.z*4))<1e-6,'catalog Shift release restores snapped preview and cue on the same pointer');
    const shiftCommits=commits, shiftDrop=shiftDrag('drop',true);
    shiftPreviewPixel=point(lastPosition());
    check(store.revision===revision+1 && commits===shiftCommits+1 && Math.hypot(shiftPreviewPixel.clientX-shiftDrop.clientX,shiftPreviewPixel.clientY-shiftDrop.clientY)<1e-4,'catalog drop re-evaluates Shift and commits one exact smooth position');
    store.undo(); viewport.setSnap(true); data=begin(); revision=store.revision;
    shiftDrag('dragover',true); shiftDrag('drop',false);
    check(store.revision===revision+1 && lastPosition().every((n,i)=>i===1 || Math.abs(n*4-Math.round(n*4))<1e-6),'releasing Shift at drop commits a snapped position');
    store.undo(); viewport.setSnap(false); data=begin(); revision=store.revision;
    shiftDrag('dragover',true); shiftDrag('dragover',false);
    check(liveDropCue().includes('Smooth'),'catalog modifier release preserves user Snap off preference');
    const offDrop=shiftDrag('drop',false), offPixel=point(lastPosition());
    check(store.revision===revision+1 && Math.hypot(offPixel.clientX-offDrop.clientX,offPixel.clientY-offDrop.clientY)<1e-4,'catalog Snap off commits exact delivered position after modifier release');
    store.undo(); viewport.setSnap(true); data=begin(); shiftDrag('dragover',true); revision=store.revision; viewport.cancelInteraction();
    check(store.revision===revision && !interacting && !liveDropCue(),'canceling catalog precision hover clears feedback without a history entry');
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
 const errors=[];
 try {
   const page=await browser.newPage(); page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/src/render/furniture-drop-qa.ts',async route=>{
     const response=await route.fetch(),body=await response.text(), marker=/viewport\.setSnap\(true\);\s*revision = store\.revision;\s*data = begin\(\);/;
     if(!marker.test(body)) throw new Error('Catalog QA marker missing');
     await route.fulfill({response,body:body.replace(marker,match=>extra+match)});
   });
   await page.goto('http://127.0.0.1:5191/furniture-drop-qa.html'); await page.locator('#run').click();
   await page.waitForFunction(()=>/COMPLETE|FAIL/.test(document.querySelector('#result').textContent),{timeout:45000});
   const output=await page.locator('#result').textContent();
   fs.writeFileSync(path.join(__dirname,'drop-shift-results.json'),JSON.stringify({output,errors},null,2));
   if(output.includes('FAIL')||errors.length) throw new Error(output+'\n'+errors.join('\n'));
   console.log(JSON.stringify({result:output.split('\n').at(-1),errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
