import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createFlatsMiddleware } from '../server/flats.mjs';
const id='12345678-1234-1234-1234-123456789abc';
async function request(path, method='GET', body, options={}) {
 const calls=[]; const handler=createFlatsMiddleware({url:'http://catalog.test/mcp',fetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({error:{code:'conflict',current_revision:3}}),{status:409});},...options});
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]); Object.assign(req,{url:path,method,headers:{host:'localhost:5173',origin:'http://localhost:5173','content-type':'application/json',...options.headers},socket:{}});
 let status,data; await handler(req,{writeHead(s){status=s;},end(b){data=b;}},()=>{status=404;}); return {status,data,calls};
}
test('relay allows contract routes and preserves conflict JSON',async()=>{const r=await request(`/api/flats/${id}`,'PUT',{base_revision:2});assert.equal(r.status,409);assert.equal(r.calls[0].url,`http://catalog.test/flats/${id}`);assert.equal(JSON.parse(r.data).error.current_revision,3);});
test('relay rejects path injection, invalid revisions, unsupported methods and foreign writes',async()=>{
 for(const p of ['/api/flats/../health','/api/flats/%2e%2e/health',`/api/flats/${id}/versions/0`,`/api/flats/${id}/versions/1e2`]){const r=await request(p);assert.equal(r.calls.length,0);}
 assert.equal((await request(`/api/flats/${id}`,'POST',{})).status,405);
 assert.equal((await request('/api/flats','POST',{}, {headers:{origin:'http://evil.test'}})).status,403);
 assert.equal((await request(`/api/flats/${id}`,'PUT',{base_revision:-1})).status,400);
 assert.equal((await request('/api/flats','POST',{name:'large'}, {maxBodyBytes:2})).status,413);
});
test('thumbnail bytes and status pass through without JSON conversion',async()=>{const r=await request(`/api/flats/${id}/thumbnail`,'GET',undefined,{fetch:async()=>new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}})});assert.equal(r.status,200);assert.deepEqual([...r.data],[255,216,255]);});
test('relay times out upstream and only exposes a safe error',async()=>{const r=await request('/api/flats','GET',undefined,{timeoutMs:5,fetch:async(_url,init)=>new Promise((_,reject)=>{const keepAlive=setTimeout(()=>{},50);init.signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(init.signal.reason);});})});assert.equal(r.status,504);assert.equal(JSON.parse(r.data).error.code,'unavailable');});
test('relay routes every contract endpoint and does not forward cookies',async()=>{for(const [path,method,body] of [['','GET'],['','POST',{name:'Team'}],[`/${id}`,'GET'],[`/${id}`,'PATCH',{name:'New'}],[`/${id}`,'DELETE'],[`/${id}/versions`,'GET'],[`/${id}/versions/2`,'GET'],[`/${id}/restore`,'POST',{revision:2}]]){const r=await request('/api/flats'+path,method,body);assert.equal(r.calls.length,1);assert.equal(r.calls[0].init.headers.cookie,undefined);}});
