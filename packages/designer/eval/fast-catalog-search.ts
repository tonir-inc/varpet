/** Live search timing: identical requests, no fixture or replay substitution. */
import {writeFileSync} from 'node:fs';
import {createHttpCatalogQuery} from '../src/catalog.js';
import {SearchCache} from '../src/catalog-acceleration.js';
const query=createHttpCatalogQuery({url:process.env.VARPET_CATALOG_URL??'http://localhost:8765/mcp'}),cache=new SearchCache(query);
const rows:any[]=[];
for(const kind of ['sofa','chair','bed','table'])for(let repetition=1;repetition<=3;repetition++){
 const input={kind,limit:20};
 for(const arm of ['before','after']){
  const started=performance.now();try{
   const result:any=arm==='before'?await query(input):await cache.query(input);
   rows.push({kind,repetition,arm,seconds:(performance.now()-started)/1000,count:result.results?.length??0,ids:result.results?.map((r:any)=>r.id),status:'ok'});
  }catch(error){rows.push({kind,repetition,arm,seconds:(performance.now()-started)/1000,status:'error',error:String(error)});}
  writeFileSync(new URL('./fast-runs/catalog-search-live.json',import.meta.url),JSON.stringify({measured_at:new Date().toISOString(),mode:'live upstream vs service SearchCache; first after is a miss',rows,stats:cache.stats},null,2)+'\n');
  console.log(JSON.stringify(rows.at(-1)));
 }
}
