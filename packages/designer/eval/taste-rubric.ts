import {requestPolicy,canonicalKind} from '../src/request-policy.js';
/** Independent acceptance capacity rule, deliberately separate from candidate generation. */
export function seatingRubric(items:readonly {kind:string;size:readonly number[]}[],requests:readonly string[]){
 const blocked=requestPolicy(requests).blocked_kinds;
 return {seating:items.some(i=>i.kind==='sofa'&&i.size[0]!>=1.4)||items.filter(i=>i.kind==='chair'&&i.size[0]!>=.6).length>=2,removed_kinds:items.every(i=>!blocked.includes(canonicalKind(i.kind)))};
}
