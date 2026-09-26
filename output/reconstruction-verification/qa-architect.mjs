import { createServer } from 'node:http';
const rooms = [{id:'qa-room',name:'Reconstructed living room',polygon:[[20,20],[24,20],[24,24],[20,24]],color:'#ddcfb9'}];
const walls = [
  {id:'qa-north',start:[20,20],end:[24,20],height:2.7,thickness:.15,color:'#f0ebe1',openings:[]},
  {id:'qa-east',start:[24,20],end:[24,24],height:2.7,thickness:.15,color:'#f0ebe1',openings:[]},
  {id:'qa-south',start:[24,24],end:[20,24],height:2.7,thickness:.15,color:'#f0ebe1',openings:[]},
  {id:'qa-west',start:[20,24],end:[20,20],height:2.7,thickness:.15,color:'#f0ebe1',openings:[]},
];
createServer(async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5174');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method === 'OPTIONS'){res.writeHead(204).end();return;}
  if(req.url !== '/structure' || req.method !== 'POST'){res.writeHead(404).end();return;}
  let data=''; for await(const chunk of req)data+=chunk;
  const payload=JSON.parse(data);
  if(!payload.plan?.data){res.writeHead(400).end();return;}
  res.writeHead(200,{'Content-Type':'application/x-ndjson'});
  res.end(JSON.stringify({type:'progress',message:'Test reconstruction checked'})+'\n'+JSON.stringify({type:'structure',rooms,walls,notes:['Synthetic QA response; no model call.']})+'\n');
  console.log('Accepted synthetic plan, returned 1 room / 4 walls');
}).listen(8789,'127.0.0.1',()=>console.log('Synthetic architect at 8789'));
