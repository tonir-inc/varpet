// Test-only MCP record for browser verification; never part of the application catalog.
import { createServer } from 'node:http';
const row={id:'abo:qa-model',name:'QA database model',kind:'chair',size_m:[.8,.8,1],fit_size_m:[.8,.8,1],price:80000,currency:'AMD',price_source:'mock',source:'abo',license:'CC BY 4.0',size_status:'estimated',glb_url:'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/L/B01N2PLWIL.glb'};
createServer(async(req,res)=>{
 if(req.method!=='POST'){res.writeHead(req.method==='DELETE'?200:405);res.end();return;}
 let text='';for await(const chunk of req)text+=chunk;
 const m=JSON.parse(text);if(m.id===undefined){res.writeHead(202);res.end();return;}
 let result;
 if(m.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'catalog-browser-qa',version:'1'}};
 else {const {name,arguments:a={}}=m.params;let payload;
 if(name==='search_furniture')payload={results:(!a.kind||a.kind==='chair')&&(!a.text||row.name.toLowerCase().includes(a.text.toLowerCase()))?[row]:[]};
 else if(name==='get_item')payload=a.item_id===row.id?row:{error:'no item'};
 else payload={kinds:{chair:1}};
 result={content:[{type:'text',text:JSON.stringify(payload)}]};}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));
}).listen(8766,'127.0.0.1',()=>console.log('Test-only MCP fixture listening on 8766'));
