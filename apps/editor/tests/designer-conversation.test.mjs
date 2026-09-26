import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-notes-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'conversation-test-entry', resolveId(id) { if (id.endsWith('conversation-test-entry')) return '\0conversation-test-entry'; },
  load(id) { if (id === '\0conversation-test-entry') return `export * from '${root}/src/adapters/designer-http.ts'; export * from '${root}/src/ui/designer-panel.ts'; export * from '${root}/src/core/demo.ts';`; },
}], build: { ssr: 'conversation-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'conversation.mjs' } } } });
const { createDesignerHttpAdapter, askDesigner, createDesignerConversation, createRecordedDesigner, designerMarkdown, demoScene, localCatalog } = await import(pathToFileURL(join(output, 'conversation.mjs')));
const proposal = { id: 'notes-proposal', title: 'A softer chair colour', description: 'Paint the lounge chair sage.', command: {
  id: 'notes-command', label: 'Paint the lounge chair', source: 'designer', baseRevision: 0,
  operations: [{ type: 'update', id: 'lounge-chair', patch: { color: '#81947a' } }],
} };
const notes = 'Paint and labour are not priced.\n<script>alert("plain text")</script>';
const reply = extra => ({ type: 'proposal', conversationId: 'notes-thread', proposal, ...extra });
const response = value => new Response(`${JSON.stringify(value)}\n`, { headers: { 'Content-Type': 'application/x-ndjson' } });
function adapter(value, onNotes) { return createDesignerHttpAdapter({ catalog: localCatalog, onNotes, fetch: async () => response(value) }); }
function memoryStorage() { const data = new Map(); return {
  getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key),
}; }
function conversation(extra = {}) { return { history: true, snapshot: () => ({ scene: demoScene, revision: 0 }),
  onProposal() {}, ask: async () => reply({ notes }), ...extra }; }

test('message, suggestions and streamed text cross the HTTP boundary', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const answer = { type: 'message', conversationId: 'c', message: '**Minimalism** means fewer competing elements.', suggestions: ['Make it warmer'] };
  globalThis.fetch = async () => new Response([
    {type:'progress',message:'Thinking about your question'}, {type:'message_delta',delta:'**Minimalism** '}, answer,
  ].map(JSON.stringify).join('\n')+'\n', {headers:{'Content-Type':'application/x-ndjson'}});
  const progress=[], deltas=[];
  const result=await askDesigner({scene:demoScene,revision:0,request:'What is minimalism?'},{onProgress:s=>progress.push(s),onMessageDelta:s=>deltas.push(s)});
  assert.deepEqual(result,answer); assert.deepEqual(deltas,['**Minimalism** ']); assert.equal(progress[0],'Thinking about your question');
});
test('message suggestions reject malformed values and enforce the four-chip boundary', async t => {
  const previous=globalThis.fetch; t.after(()=>{globalThis.fetch=previous;});
  for(const suggestions of [null, 'x', [''], [3], Array(5).fill('x')]) {
    globalThis.fetch=async()=>response({type:'message',conversationId:'c',message:'Answer',suggestions});
    const result=await askDesigner({scene:demoScene,revision:0,request:'Why?'});
    assert.equal(result.type,'error'); assert.match(result.message,/suggestions/i);
  }
  globalThis.fetch=async()=>response({type:'message',conversationId:'c',message:'Answer',suggestions:Array(4).fill('x')});
  assert.equal((await askDesigner({scene:demoScene,revision:0,request:'Why?'})).type,'message');
});
test('follow-up answers retain proposal context, suggestions, notes and approval state', async()=>{
  const requests=[], before=structuredClone(demoScene);
  const chat=createDesignerConversation(conversation({ask:async req=>{requests.push(req); return requests.length===1?reply({notes}):{type:'message',conversationId:'notes-thread',message:'**Sage** is calmer.',suggestions:['Make it warmer']};}}));
  await chat.send('Paint the chair'); await chat.send('Why this layout?');
  assert.equal(requests[1].conversationId,'notes-thread');
  assert.equal(chat.state.messages[1].status,'pending'); assert.equal(chat.state.messages[1].notes,notes);
  assert.deepEqual(chat.state.messages.at(-1).suggestions,['Make it warmer']);
  assert.deepEqual(demoScene,before);
});
test('streamed draft is replaced once by the final answer and ignored after cancellation', async()=>{
  let opts, finish; const pending=new Promise(r=>{finish=r;});
  const chat=createDesignerConversation(conversation({ask:(_req,o)=>{opts=o;return pending;}}));
  const running=chat.send('Why?'); opts.onMessageDelta('A calm '); opts.onMessageDelta('palette.');
  assert.equal(chat.state.draft,'A calm palette.');
  finish({type:'message',conversationId:'c',message:'A calm palette.'}); await running;
  assert.equal(chat.state.draft,''); assert.equal(chat.state.messages.length,2);
  opts.onMessageDelta('late'); assert.equal(chat.state.draft,'');
});
test('retry resends the failed request in the same thread without applying anything', async()=>{
  const requests=[]; const chat=createDesignerConversation(conversation({ask:async req=>{requests.push(req); return requests.length===1?{type:'error',message:'Disconnected'}:{type:'message',conversationId:'c',message:'Here is why.'};}}));
  await chat.send('Why?'); assert.equal(chat.state.messages.at(-1).retryRequest,'Why?');
  await chat.retry(); assert.equal(requests.length,2); assert.equal(requests[1].request,'Why?');
  assert.equal(chat.state.messages.at(-1).text,'Here is why.');
});

test('light markdown renders emphasis and lists while all HTML and links stay inert',()=>{
  const html=designerMarkdown('**Calm** and *warm*.\n\n- Less clutter\n- More light\n\n<img src=x onerror=alert(1)> [bad](javascript:alert(1))');
  assert.match(html,/<strong>Calm<\/strong>/); assert.match(html,/<em>warm<\/em>/);
  assert.match(html,/<ul><li>Less clutter<\/li><li>More light<\/li><\/ul>/);
  assert.doesNotMatch(html,/<img|<a |<script/i); assert.match(html,/&lt;img/);
});

test('recorded demo answers a design question without proposing an edit',async()=>{
 const result=await createRecordedDesigner(0)({scene:demoScene,revision:0,request:'What does minimalistic mean?'});
 assert.equal(result.type,'message'); assert.match(result.message,/Recorded demo/);
});
test('cancel clears streamed text immediately and rejects late chunks',async()=>{
 let opts,finish; const chat=createDesignerConversation(conversation({ask:(_req,o)=>{opts=o;return new Promise(r=>{finish=r;});}}));
 const running=chat.send('Why?'); opts.onMessageDelta('Partial answer'); chat.cancel();
 assert.equal(chat.state.draft,'');opts.onMessageDelta('late');assert.equal(chat.state.draft,'');
 finish({type:'message',conversationId:'late',message:'Late answer'});await running;
 assert.notEqual(chat.state.messages.at(-1).text,'Late answer');
});
