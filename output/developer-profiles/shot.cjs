// Quick screenshot helper: node output/developer-profiles/shot.cjs <path> <name> [mobile] [reduced]
const {chromium}=require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const [,,path,name,mobile,reduced]=process.argv;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 const context=await browser.newContext({viewport:mobile==='1'?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1});
 const page=await context.newPage();
 if(process.env.LOGIN){const body={name:'Studio QA',email:process.env.LOGIN,password:'a long private password'};const o={headers:{Origin:'http://localhost:5182'}};
  let r=await context.request.post('http://localhost:5182/api/account/login',{...o,data:body});if(!r.ok())r=await context.request.post('http://localhost:5182/api/account/register',{...o,data:body});console.log('auth',r.status());}
 await page.emulateMedia({reducedMotion:reduced==='1'?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 await page.route('**/fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.goto('http://localhost:5182'+path);await page.waitForTimeout(3500);
 await page.addStyleTag({content:'#app.portal-host{height:auto!important;overflow:visible!important}'});await page.waitForTimeout(300);
 await page.screenshot({path:__dirname+'/'+name,fullPage:true});
 console.log('errors',JSON.stringify(errors));await browser.close();
})();
