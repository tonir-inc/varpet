const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const route = new RegExp(`^/api/flats(?:/(${UUID})(?:/(thumbnail|versions|restore)(?:/([1-9][0-9]*))?)?)?$`);
const revision = n => Number.isSafeInteger(n) && n > 0;
const fail = (status, message) => Object.assign(new Error(message), {status});
function readBody(req, limit) {
 return new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  const cleanup = () => { req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onError); };
  const stop = error => { cleanup(); req.resume(); reject(error); };
  const onError = () => stop(fail(400, 'Request interrupted.'));
  const onData = chunk => { size += chunk.length; if (size > limit) stop(fail(413, 'Body exceeds 25 MB.')); else chunks.push(Buffer.from(chunk)); };
  const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks).toString()); };
  req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onError);
  if (Number(req.headers['content-length']) > limit) stop(fail(413, 'Body exceeds 25 MB.'));
 });
}
export function createFlatsMiddleware(options = {}) {
 const base = (options.base ?? process.env.VARPET_FLATS_URL ?? options.url ?? process.env.VARPET_CATALOG_URL ?? 'http://100.107.246.46:8765/mcp').replace(/\/mcp\/?$/, '').replace(/\/$/, '');
 const fetcher = options.fetch ?? fetch;
 return async (req,res,next) => {
  if (!/^\/api\/flats(?:[/?]|$)/.test(req.url ?? '')) return next();
  const send = (status,data) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
   const [path,query=''] = req.url.split('?'); const match=route.exec(path);
   if(!match) throw fail(400,'Invalid flat path.');
   const [,id,action,version]=match;
   if(version && (action!=='versions'||!revision(Number(version)))) throw fail(400,'Invalid revision.');
   const allowed=!id?['GET','POST']:!action?['GET','PUT','PATCH','DELETE']:action==='restore'?['POST']:['GET'];
   if(!allowed.includes(req.method)) throw fail(405,'Method not allowed.');
   const params=new URLSearchParams(query);
   if([...params].some(([k,v])=>id||req.method!=='GET'||k!=='include_deleted'||!['0','1'].includes(v))) throw fail(400,'Invalid query.');
   let body;
   if(req.method!=='GET') {
    const origin=options.origin ? new URL(options.origin).origin : `${req.socket?.encrypted?'https':'http'}://${req.headers.host}`;
    if(req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site') throw fail(403,'Same-origin writes only.');
    if(req.method!=='DELETE') {
     if((req.headers['content-type']??'').split(';')[0].trim()!=='application/json') throw fail(415,'Send application/json.');
     const text = await readBody(req, Math.min(options.maxBodyBytes ?? 25*1024*1024, 25*1024*1024));
     try { body = JSON.parse(text); } catch { throw fail(400, 'Invalid JSON.'); }
     if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'Expected a JSON object.');
     if(req.method==='PUT'&&!revision(body.base_revision)||action==='restore'&&!revision(body.revision))throw fail(400,'Invalid revision.');
    }
   }
   const upstream=await fetcher(`${base}${path.slice(4)}${query?'?'+params.toString():''}`,{method:req.method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(options.timeoutMs??30000),redirect:'error'});
   const bytes=Buffer.from(await upstream.arrayBuffer());
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')??'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
  } catch(error){req.resume();send(error.status??(error.name==='TimeoutError'?504:502),{error:{code:error.status?'invalid_request':'unavailable',message:error.status?error.message:'Team saves service unavailable.'}});}
 };
}
export function flatsPlugin(options={}) {
 // Braces matter: a value returned from configureServer is run by Vite as a post hook.
 const configure=server=>{server.middlewares.use(createFlatsMiddleware(options));};
 return {name:'varpet-flats',configureServer:configure,configurePreviewServer:configure};
}
