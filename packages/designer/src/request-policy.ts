/** Customer-authored history, never model-generated set_intent fields, owns exclusions. */
const aliases:Record<string,string>={couch:'sofa',couches:'sofa',sofas:'sofa',loveseat:'sofa',loveseats:'sofa',armchair:'chair',armchairs:'chair',chairs:'chair',rugs:'rug',carpet:'rug',carpets:'rug',lamps:'lamp',lights:'lamp',tables:'table',shelves:'shelf',bookcase:'shelf',bookcases:'shelf',beds:'bed',cabinets:'cabinet',wardrobes:'wardrobe',dressers:'dresser',desks:'desk',nightstands:'nightstand',stools:'stool',ottomans:'ottoman',benches:'bench',plants:'plant',light:'lamp'};
export const canonicalKind=(value:string)=>aliases[value.toLowerCase()]??value.toLowerCase();
const nouns='couches|couch|sofas?|loveseats?|armchairs?|chairs?|rugs?|carpets?|lamps?|lights?|tables?|shelves|shelf|bookcases?|beds?|cabinets?|wardrobes?|dressers?|desks?|nightstands?|stools?|ottomans?|benches|bench|plants?';
/** Conservative English direct-object clauses. Mentions in relative/location clauses do not release a ban. */
export function requestPolicy(requests:readonly string[]){
 const blocked=new Set<string>();
 const verbs=/\b(get rid of|take out|bring back|would like|remove|delete|replace|without|no|add|put|bring|buy|want|need|with|keep|move)\b/g;
 const noun=new RegExp(`\\b(${nouns})\\b`);
 const continuation=new RegExp(`^\\s*(?:,\\s*(?:(?:and|or)\\s+)?|(?:and|or)\\s+)(?:(?:the|a|an|any|old|new|small|large)\\s+)*(${nouns})\\b`);
 for(const request of requests){
  const text=request.toLowerCase().replaceAll('’',"'").replace(/take\s+(.+?)\s+out\b/g,'remove $1');
  for(const clause of text.split(/[.;!?]|\b(?:but|then)\b/)){
   const actions=[...clause.matchAll(verbs)];
   for(let n=0;n<actions.length;n++){
    const action=actions[n]!,verb=action[1]!,start=action.index!,end=start+action[0].length;
    const prefix=clause.slice(0,start).split(/\band\b|,/).at(-1)!;
    const negated=/\b(?:do not|don't|never|not|no)\b/.test(prefix);
    const removing=['remove','delete','replace','without','no','get rid of','take out'].includes(verb);
    if(['keep','move'].includes(verb)||(removing&&negated))continue;
    const mode=removing||negated?'remove':'add';
    // Only the action's direct noun phrase; location and relative clauses are references.
    const phrase=clause.slice(end,actions[n+1]?.index??clause.length).split(/\b(?:where|which|that|because|when|before|after|beside|behind|near|under|over|in|on|at|from|for|to|of|instead)\b/)[0]!;
    const first=phrase.match(noun);if(!first)continue;
    if(/^[-]|^\s+(?:covers?|cushions?|fabric|upholstery|colou?rs?)\b/.test(phrase.slice(first.index!+first[0].length)))continue;
    const kinds=[first[1]!];let rest=phrase.slice(first.index!+first[0].length),next:RegExpMatchArray|null;
    while((next=rest.match(continuation))){rest=rest.slice(next[0].length);if(!/^[-]|^\s+(?:covers?|cushions?|fabric|upholstery|colou?rs?)\b/.test(rest))kinds.push(next[1]!);}
    for(const kind of kinds)if(mode==='remove')blocked.add(canonicalKind(kind));else blocked.delete(canonicalKind(kind));
   }
  }
 }
 return {blocked_kinds:[...blocked]};
}
