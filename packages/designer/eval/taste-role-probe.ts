/** Inspect role-specific real catalog evidence without changing live service behavior. */
import {searchCatalog} from '../src/catalog.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const root=process.argv[2];if(!root)throw Error('Supply an output directory');mkdirSync(root,{recursive:true});
const roles:Record<string,Record<string,string>>={industrial:{sofa:'Industrial',chair:'Modern',rug:'Modern',lamp:'Modern',table:'Industrial',shelf:'Industrial'},boho:{sofa:'Modern',chair:'Rustic',rug:'Bohemian',lamp:'Modern',table:'Rustic',shelf:'Rustic'}};
const terms:Record<string,string>={sofa:'upholstered sofa',chair:'upholstered accent chair',rug:'large area rug 8 feet',lamp:'floor lamp',table:'coffee table',shelf:'bookcase shelf'};
const fit:Record<string,object>={sofa:{max_w:2.8,max_d:1.2},chair:{max_w:1.1,max_d:1.15},table:{max_w:1.5,max_d:.85,max_h:.6},lamp:{max_w:.65,max_d:.65},shelf:{max_w:1.4,max_d:.5}};
for(const [style,kinds] of Object.entries(roles)){
 const evidence:Record<string,unknown>={};
 const entries=Object.entries(kinds);
 for(let i=0;i<entries.length;i+=2)await Promise.all(entries.slice(i,i+2).map(async([kind,tag])=>{const request={kind,styles:[tag],text:terms[kind],...fit[kind],limit:20};let result=await searchCatalog(request);if(result.status==='unavailable')result=await searchCatalog(request);evidence[kind]={request,result};console.log(style,kind,result.status,result.results.length);}));
 writeFileSync(`${root}/${style}.json`,JSON.stringify(evidence,null,2));
}
