import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
import { createAccountsHandler } from './accounts.mjs';
import { createFlatsMiddleware } from './flats.mjs';

async function invoke(handler, url, origin) {
  const req = Readable.from([Buffer.from('{}')]);
  Object.assign(req,{url,method:'POST',headers:{origin,host:'127.0.0.1:4173','content-type':'application/json'},socket:{}});
  const res = { headers:{}, setHeader(k,v){this.headers[k]=v;},writeHead(status){this.status=status;},end(body){this.body=body;} };
  await handler(req,res,() => {throw Error('unexpected next');});
  return res;
}

test('public env origin works for all write plugins, with direct local access retained', async t => {
  const old = process.env.VARPET_PUBLIC_ORIGIN;
  process.env.VARPET_PUBLIC_ORIGIN = 'https://varpet.snek.page';
  t.after(() => { if(old === undefined) delete process.env.VARPET_PUBLIC_ORIGIN; else process.env.VARPET_PUBLIC_ORIGIN = old; });
  const directory = await mkdtemp(join(tmpdir(), 'varpet-public-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const accounts = createAccountsHandler({dataDir:directory,origin:'http://localhost:5173'});
  t.after(() => accounts.close());
  const flats = createFlatsMiddleware({origin:'http://localhost:5173',fetch:async () => new Response('{}', {status:200})});
  const root = fileURLToPath(new URL('../',import.meta.url));
  await build({root,configFile:false,publicDir:false,logLevel:'silent',build:{ssr:join(root,'server/sharing.ts'),target:'node22',outDir:directory,emptyOutDir:false,rolldownOptions:{output:{entryFileNames:'sharing.mjs'}}}});
  const {createSharingMiddleware} = await import(pathToFileURL(join(directory,'sharing.mjs')));
  const sharing = createSharingMiddleware({directory:join(directory,'shares')});
  for(const origin of ['https://varpet.snek.page','http://127.0.0.1:4173','https://varpet.snek.page.evil','https://varpet.snek.page/path']) {
    const foreign = origin.endsWith('.evil') || origin.endsWith('/path');
    assert.equal((await invoke(accounts,'/api/account/login',origin)).status,foreign?403:400);
    assert.equal((await invoke(flats,'/api/flats',origin)).status,foreign?403:200);
    assert.equal((await invoke(sharing,'/api/shares',origin)).status,foreign?403:400);
  }
  delete process.env.VARPET_PUBLIC_ORIGIN;
  assert.equal((await invoke(flats,'/api/flats',undefined)).status,403);
  assert.equal((await invoke(accounts,'/api/account/login',undefined)).status,403);
});

test('architect UI displays the server rate limit reason for both build routes', async t => {
  const directory = await mkdtemp(join(tmpdir(),'varpet-rate-ui-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const root = fileURLToPath(new URL('../',import.meta.url));
  await build({root,configFile:false,publicDir:false,logLevel:'silent',build:{ssr:join(root,'src/adapters/architect-http.ts'),target:'node22',outDir:directory,rolldownOptions:{output:{entryFileNames:'architect.mjs'}}}});
  const {createArchitectHttpAdapter,buildFurnishedFlat} = await import(pathToFileURL(join(directory,'architect.mjs')));
  const message='Build limit reached (3 per hour). Please try again in an hour.';
  const fetcher=async () => new Response(JSON.stringify({error:message}),{status:429});
  const plan=new File(['plan'],'plan.png');
  await assert.rejects(createArchitectHttpAdapter({url:'https://varpet.snek.page',fetch:fetcher,pickFiles:async()=>[plan]}).reconstruct(new AbortController().signal),{message});
  await assert.rejects(buildFurnishedFlat({plan,photos:[],name:'Test'},()=>{},{url:'https://varpet.snek.page',fetch:fetcher}),{message});
});
