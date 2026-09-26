"""Independent demo rubric in editor XZ coordinates; no designer checker is imported.
Geometry is a conservative 10 cm grid proxy, not a human aesthetic verdict.
"""
import heapq
import math
import re

RESERVED={5180,5190,8787,8788}
def port(value):
 value=int(value)
 if value in RESERVED or not 1024<=value<=65535:raise ValueError('Reserved or invalid port')
 return value

def gate(passed,total,tier):
 return total>=10 and passed==total if tier==1 else total>=10 and passed/total>=.8

def tokens(telemetry):
 usage=(telemetry or {}).get('usage')
 if not usage:return None
 if isinstance(usage.get('totalTokens'),int):return usage['totalTokens']
 for a,b in [('input_tokens','output_tokens'),('inputTokens','outputTokens')]:
  if isinstance(usage.get(a),int) and isinstance(usage.get(b),int):return usage[a]+usage[b]
 return None

def tier2(bedroom):
 return [dict(key=k,request=r,state=s) for k,r,s in [
 ('paint',f'Paint the {bedroom} walls warm white','empty'),
 ('red','Paint the apartment red','empty'),
 ('bigger-furnished','Make the living room feel bigger','furnished'),
 ('bigger-empty','Make the living room feel bigger','empty'),
 ('sofa','Move the sofa so it faces the window','furnished'),
 ('armchair','Add an armchair for reading by the window','furnished'),
 ('desk','Add a desk by the window','furnished'),
 ('bedroom','Furnish the bedroom: a double bed, two nightstands and a wardrobe','empty'),
 ('advice','What does minimalist mean for a small flat?','empty'),
 ('structural','Knock down the wall between the kitchen and the living room','empty'),
 ('impossible','Put a double bed in the bathroom','empty'),
 ('failed-followup','Show me another option','previous')]]

def kind(asset):
 name=asset.get('name','').lower();k=asset.get('kind','unknown')
 if k in ('table','cabinet','nightstand') and re.search(r'night\s*stand|bedside|beside table',name):return 'nightstand'
 if k=='wardrobe' or k in ('cabinet','dresser') and re.search(r'wardrobe|armoire',name):return 'wardrobe'
 if k=='desk' or k=='table' and re.search(r'\bdesk\b|workstation|writing.*(?:office|table)',name):return 'desk'
 if k=='table' and re.search(r'coffee|cocktail',name):return 'coffee'
 if k=='chair' and re.search(r'armchair|lounge|accent|reading|recliner',name):return 'armchair'
 return k

def axes(o):
 a=o.get('rotation',0);return (math.cos(a),-math.sin(a)),(math.sin(a),math.cos(a))
def dot(a,b):return a[0]*b[0]+a[1]*b[1]
def sub(a,b):return (a[0]-b[0],a[1]-b[1])
def pos(o):return (o['position'][0],o['position'][2])
def add(a,b,t=1):return (a[0]+b[0]*t,a[1]+b[1]*t)
def size(o,a):return [d*s for d,s in zip(a.get('dimensions',[0,0,0]),o.get('scale',[1,1,1]))]
def footprint(o,a):
 w,_,d=size(o,a);right,front=axes(o);p=pos(o)
 return [add(add(p,right,x*w/2),front,y*d/2) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
def edges(poly):return list(zip(poly,poly[1:]+poly[:1]))
def segment(p,a,b):
 v=sub(b,a);t=max(0,min(1,dot(sub(p,a),v)/max(1e-12,dot(v,v))))
 return math.dist(p,add(a,v,t))
def inside(p,poly):
 if any(segment(p,a,b)<1e-8 for a,b in edges(poly)):return True
 return sum((a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0] for a,b in edges(poly))%2==1

def room_for(scene,pattern):return next((r for r in scene['rooms'] if re.search(pattern,r['name'],re.I)),None)
def objects_in(scene,room,catalog):
 assets={a['id']:a for a in catalog}
 return [(o,assets[o['assetId']]) for o in scene['objects'] if o.get('assetId') in assets and (room is None or inside(pos(o),room['polygon']))]
def opening_spans(scene,room,kind_filter):
 out=[]
 for w in scene['walls']:
  v=sub(w['end'],w['start']);length=math.hypot(*v)
  if not length:continue
  for op in w.get('openings',[]):
   if op['kind']!=kind_filter:continue
   a=add(w['start'],v,op['offset']/length);b=add(a,v,op['width']/length);mid=add(a,sub(b,a),.5)
   if min(segment(mid,x,y) for x,y in edges(room['polygon']))<=.2:out.append((a,b,op['width']))
 return out

def face_window(scene,room,o):
 front=axes(o)[1]
 return any(dot(front,sub(t,pos(o)))/max(1e-9,math.dist(t,pos(o)))>=math.cos(math.radians(20)) for a,b,_ in opening_spans(scene,room,'window') for t in (a,add(a,sub(b,a),.5),b))
def window_distance(scene,room,o):return min((segment(pos(o),a,b) for a,b,_ in opening_spans(scene,room,'window')),default=math.inf)
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def intersects(a,b,c,d):
 v=sub(b,a);w=sub(d,c);den=cross(v,w)
 if abs(den)<1e-10:return min(segment(a,c,d),segment(b,c,d),segment(c,a,b),segment(d,a,b))<1e-9
 t=cross(sub(c,a),w)/den;u=cross(sub(c,a),v)/den
 return 0<=t<=1 and 0<=u<=1
def wall_borders(w,room):
 v=sub(w['end'],w['start']);length=math.hypot(*v)
 if length<1e-9:return False
 direction=(v[0]/length,v[1]/length)
 for a,b in edges(room['polygon']):
  delta=sub(b,a)
  if abs(cross(direction,delta))>.1 or abs(cross(direction,sub(a,w['start'])))>.2:continue
  low,high=sorted([dot(sub(a,w['start']),direction),dot(sub(b,w['start']),direction)])
  if min(length,high)-max(0,low)>.1:return True
 return False
def polygon_gap(a,b):
 if any(inside(p,b) for p in a) or any(inside(p,a) for p in b) or any(intersects(x,y,u,v) for x,y in edges(a) for u,v in edges(b)):return 0.
 return min([segment(p,c,d) for p in a for c,d in edges(b)]+[segment(p,c,d) for p in b for c,d in edges(a)])

def walkway(scene,room,catalog,target):
 """Widest grid route: room-door interior to target, minimum includes doorway width.
 10 cm nodes, 4-neighbour connectivity; subtract half diagonal for sampling error.
 """
 poly=room['polygon'];obstacles=[footprint(o,a) for o,a in objects_in(scene,room,catalog) if kind(a)!='rug']
 for c in scene.get('project',{}).get('components',[]):
  if c.get('phase')=='remove' or c['position'][1]>.1 or not inside(pos(c),poly):continue
  obstacles.append(footprint(c,{'dimensions':c['dimensions']}))
 def clearance(p):
  if not inside(p,poly) or any(inside(p,o) for o in obstacles):return 0.
  return min(segment(p,a,b) for shape in [poly,*obstacles] for a,b in edges(shape))
 doors=opening_spans(scene,room,'door')
 if not doors:return {'width_m':None,'reason':'no room doorway to measure'}
 step=.1;x0=min(p[0] for p in poly);y0=min(p[1] for p in poly)
 grid={}
 for ix in range(math.ceil((max(p[0] for p in poly)-x0)/step)+1):
  for iy in range(math.ceil((max(p[1] for p in poly)-y0)/step)+1):
   p=(x0+ix*step,y0+iy*step);c=clearance(p)
   if c>0:grid[ix,iy]=(p,max(0,2*c-step*math.sqrt(2)))
 if not grid:return {'width_m':0.,'reason':'no free grid cells'}
 dest=min(grid,key=lambda k:math.dist(grid[k][0],target))
 if math.dist(grid[dest][0],target)>.2:return {'width_m':0.,'reason':'target blocked'}
 widths=[]
 for a,b,width in doors:
  mid=add(a,sub(b,a),.5);v=sub(b,a);normal=(-v[1]/width,v[0]/width)
  candidates=[add(mid,normal,s*.65) for s in [-1,1]]
  candidates=[p for p in candidates if inside(p,poly)]
  if not candidates:continue
  start=min(grid,key=lambda k:min(math.dist(grid[k][0],p) for p in candidates))
  if min(math.dist(grid[start][0],p) for p in candidates)>.25:widths.append(0.);continue
  entry_points=[add(mid,sub(grid[start][0],mid),i/20) for i in range(1,21)]
  if any(any(inside(p,ob) for ob in obstacles) for p in entry_points):widths.append(0.);continue
  entry_width=min([width]+[2*min(segment(p,a,b) for ob in obstacles for a,b in edges(ob)) for p in entry_points] if obstacles else [width])
  best={start:min(entry_width,grid[start][1])};queue=[(-best[start],start)]
  while queue:
   neg,k=heapq.heappop(queue)
   if -neg<best[k]-1e-9:continue
   if k==dest:break
   for d in ((1,0),(-1,0),(0,1),(0,-1)):
    n=(k[0]+d[0],k[1]+d[1])
    if n in grid:
     score=min(-neg,grid[n][1])
     if score>best.get(n,-1):best[n]=score;heapq.heappush(queue,(-score,n))
  widths.append(best.get(dest,0.))
 return {'width_m':round(min(widths),3) if widths else None,'grid_m':step,'routes':len(widths)}

def visible_color(scene,w):
 materials={m['id']:m['color'] for m in scene.get('project',{}).get('materials',[])}
 colors=[materials.get(f['materialId'],w['color']) for f in scene.get('project',{}).get('finishes',[]) if f['entityId']==w['id'] and f['surface'] in ('wall-front','wall-back')]
 return colors or [w['color']]
def white(c):
 r,g,b=[int(c[i:i+2],16) for i in (1,3,5)];return r>=230 and g>=220 and b>=205 and r>=g>=b and 3<=r-b<=35

def quote(text,objects,catalog):
 assets={a['id']:a for a in catalog};fail=[];total=0
 if not objects:fail.append('no_furniture_to_quote')
 normalized=re.sub(r'(?<=\d)[,\s](?=\d{3}(?:\D|$))','',text)
 for o in objects:
  a=assets.get(o['assetId'],{});price=a.get('price');name=a.get('name','')
  if not isinstance(price,int):fail.append('unknown_price:'+o['id']);continue
  total+=price
  words=re.findall(r'\w+',name.lower())[:4]
  lines=[re.split(r'\btotal\b',line,flags=re.I)[0] for line in normalized.splitlines() if (o['assetId'] in line or words and all(w in line.lower() for w in words))]
  if not any(re.search(r'(?<![\d.])'+str(price)+r'(?![\d.])',line) and re.search(r'֏|AMD|dram',line,re.I) and re.search(r'shop\s*:\s*\w|store\s*:\s*\w|https?://|Amazon|IKEA|Wayfair',line,re.I) for line in lines):fail.append('missing_piece_price_shop:'+o['id'])
 if not re.search(r'(?:total|ընդհանուր)[^\n]*\b'+str(total)+r'\b',normalized,re.I):fail.append('total_missing_or_wrong')
 return {'pass':not fail,'failures':fail,'total_dram':total}

def grade(key,before,after,catalog,reply,accepted,text,seconds):
 fail=[];measure={};typ=reply.get('type','error');changed=before!=after
 living=room_for(after,r'living|հյուր');bedroom=room_for(after,r'bedroom|ննջ');room=bedroom if key in ('bedroom','paint') else living
 inventory=objects_in(after,room,catalog);by=lambda k:[(o,a) for o,a in inventory if kind(a)==k]
 added=[(o,a) for o,a in inventory if not any(old['id']==o['id'] for old in before['objects'])]
 edits={'living','cozier','paint','red','bigger-furnished','sofa','armchair','desk','bedroom'}
 if key in edits and not (typ=='proposal' and accepted and changed):fail.append('no_applied_proposal')
 if key=='living':
  sofas=by('sofa');rugs=by('rug');tables=by('coffee');lamps=by('lamp')
  for k,items in [('sofa',sofas),('rug',rugs),('coffee_table',tables),('lamp',lamps)]:
   if not items:fail.append('living_'+k+'_missing')
  if sofas and room:
   sofa,asset=sofas[0];poly=footprint(sofa,asset);right,front=axes(sofa)
   tv=[(o,a) for o,a in inventory if re.search(r'\btv\b|television|media',a['name'],re.I)]
   if not face_window(after,room,sofa) and not any(dot(front,sub(pos(o),pos(sofa)))/max(1e-8,math.dist(pos(o),pos(sofa)))>=math.cos(math.radians(20)) for o,a in tv):fail.append('sofa_not_facing_window_or_tv')
   if not any(any(inside(p,footprint(o,a)) for p in poly) for o,a in rugs):fail.append('rug_not_under_sofa')
   gaps=[polygon_gap(poly,footprint(o,a)) for o,a in tables if dot(front,sub(pos(o),pos(sofa)))>0]
   measure['coffee_gap_m']=min(gaps,default=None)
   if not any(.25<=gap<=.6 for gap in gaps):fail.append('coffee_table_not_within_0.25_to_0.60m')
   target=add(add(pos(sofa),front,size(sofa,asset)[2]/2+.55),right,size(sofa,asset)[0]/2+.55)
   measure['walkway']=walkway(after,room,catalog,target)
   if (measure['walkway']['width_m'] or 0)<.9:fail.append('walkway_below_0.90m_or_unmeasured')
  if not re.search(r'(?:total|catalog price|cost)[^\n]*(?:֏|AMD|dram)',text,re.I):fail.append('total_price_not_shown')
 if key=='cozier':
  after_ids={o['id'] for o in after['objects']}
  for o in before['objects']:
   if o['id'] not in after_ids:fail.append('customer_piece_removed:'+o['id'])
  warm_added=any(kind(a) in ('rug','lamp','armchair','sofa','plant') for o,a in added)
  warm_paint=any(visible_color(before,w)!=visible_color(after,next((x for x in after['walls'] if x['id']==w['id']),w)) and any(int(c[1:3],16)>=int(c[5:7],16)+10 for c in visible_color(after,next((x for x in after['walls'] if x['id']==w['id']),w))) for w in before['walls'])
  if not (warm_added or warm_paint):fail.append('no_measured_warmth_added')
 if key=='bedroom' and room:
  beds=by('bed');stands=by('nightstand');wardrobes=by('wardrobe')
  if len(beds)!=1 or not beds or size(*beds[0])[0]<1.35 or size(*beds[0])[2]<1.8:fail.append('double_bed_missing')
  if len(stands)!=2:fail.append('two_nightstands_missing')
  if not wardrobes:fail.append('wardrobe_missing')
  if beds:
   bed,asset=beds[0];right,front=axes(bed);w,_,d=size(bed,asset);head=add(pos(bed),front,-d/2)
   solid=[]
   for wall in after['walls']:
    v=sub(wall['end'],wall['start']);length=math.hypot(*v)
    if not length:continue
    spans=[(0,length)]
    for op in wall.get('openings',[]):
     spans=[seg for a,b in spans for seg in ((a,min(b,op['offset'])),(max(a,op['offset']+op['width']),b)) if seg[1]>seg[0]]
    solid.extend((add(wall['start'],v,a/length),add(wall['start'],v,b/length)) for a,b in spans)
   measure['headboard_gap_m']=min((max(segment(add(head,right,side*w/2),a,b) for side in (-1,0,1)) for a,b in solid),default=None)
   if measure['headboard_gap_m'] is None or measure['headboard_gap_m']>.25:fail.append('headboard_not_on_solid_wall')
   for side in (-1,1):
    if not any(side*dot(sub(pos(o),pos(bed)),right)>w/2 and abs(dot(sub(pos(o),head),front))<=.9 and polygon_gap(footprint(bed,asset),footprint(o,a))<=.6 for o,a in stands):fail.append('nightstand_missing_side:'+str(side))
    obstacles=[footprint(o,a) for o,a in inventory if o['id']!=bed['id'] and kind(a)!='rug']
    gap=2.
    for offset in (0,d*.25):
     start=add(add(pos(bed),front,offset),right,side*w/2)
     for step in range(1,201):
      p=add(start,right,side*step*.01)
      if not inside(p,room['polygon']) or any(inside(p,poly) for poly in obstacles):gap=min(gap,(step-1)*.01);break
    measure['bed_side_'+str(side)+'_m']=round(gap,3)
    if gap<.6-1e-8:fail.append('bed_side_below_0.60m:'+str(side))
 if key in ('paint','red'):
  targets=[w for w in after['walls'] if key=='red' or room and wall_borders(w,room)]
  check=white if key=='paint' else lambda c:int(c[1:3],16)>1.4*max(int(c[3:5],16),int(c[5:7],16))
  if not targets or not all(all(check(c) for c in visible_color(after,w)) for w in targets):fail.append('requested_wall_colour_coverage_incomplete')
 if key in ('desk','armchair'):
  found=[(o,a) for o,a in added if kind(a)==key]
  if not room or not any(window_distance(after,room,o)<=1.5 for o,a in found):fail.append('requested_new_piece_not_within_1.5m_of_window')
 if key=='sofa':
  if not room or not any(face_window(after,room,o) and any(old['id']==o['id'] and (old['position']!=o['position'] or old['rotation']!=o['rotation']) for old in before['objects']) for o,a in by('sofa')):fail.append('existing_sofa_not_moved_to_face_window')
 if key.startswith('bigger'):
  old=objects_in(before,living,catalog) if living else []
  if key=='bigger-furnished':
   if not any(kind(a)=='sofa' for o,a in old):fail.append('furnished_prerequisite_missing')
   if {o['id'] for o,a in old}!={o['id'] for o,a in inventory}:fail.append('rearrange_changed_inventory')
   # Largest empty axis-aligned rectangle, 20cm sample grid; independent of designer's score.
   if living:
    for label,scene in [('before',before),('after',after)]:measure['open_rectangle_'+label]=open_rectangle(scene,living,catalog)
    if measure['open_rectangle_after']<=measure['open_rectangle_before']+.04:fail.append('no_measured_open_rectangle_improvement')
  elif typ not in ('message','question','decline') or changed or not re.search(r'empty|no furniture|unfurnished|already open',text,re.I):fail.append('empty_room_not_honestly_explained')
 if key=='why':
  if not inventory:fail.append('no_actual_layout_to_explain')
  if typ!='message':fail.append('why_not_explanation')
  numerical=re.findall(r'(\d+(?:\.\d+)?)\s*(m²|m2|metres?|meters?|cm\b|m\b)',text,re.I)
  if not numerical:fail.append('no_checkable_layout_numbers')
  # Do not award success for numbers merely looking plausible. Exact reference facts below.
  facts=[];distance_facts=[];area_facts=[]
  if room:
   for o,a in inventory:
    if kind(a)=='sofa':
     distance_facts.extend(polygon_gap(footprint(o,a),footprint(t,ta)) for t,ta in inventory if kind(ta)=='coffee')
   area_facts.append(open_rectangle(after,room,catalog))
  facts=distance_facts+area_facts
  matches=[]
  for found in re.finditer(r'(\d+(?:\.\d+)?)\s*(m²|m2|metres?|meters?|cm\b|m\b)',text,re.I):
   n=float(found[1])/100 if found[2].lower()=='cm' else float(found[1]);area=found[2].lower() in ('m²','m2')
   context=text[max(0,found.start()-65):min(len(text),found.end()+40)]
   relevant=area_facts if area and re.search(r'clear|rectangle|open',context,re.I) else distance_facts if not area and re.search(r'coffee|table',context,re.I) else []
   if any(abs(n-f)<=.06 for f in relevant):matches.append(n)
   else:fail.append('unverified_numerical_placement_claim:'+found[0])
  measure['reference_values']=facts;measure['matched_numbers']=matches
  if not matches:fail.append('placement_numbers_not_verified_against_scene')
  if not re.search(r'sofa|table|bed|window|walkway|clearance',text,re.I):fail.append('actual_placement_not_explained')
 if key=='quote':return quote(text,after['objects'],catalog)
 if key=='advice':
  if typ!='message' or changed or not re.search(r'minimal|simple|less|few',text,re.I) or not re.search(r'storage|clutter|space|light|scale',text,re.I):fail.append('not_useful_minimalism_advice')
 if key in ('structural','impossible'):
  if typ not in ('decline','message') or changed or not re.search(r'cannot|can.t|unable|not (?:fit|able)|too (?:small|large)|unsafe|not enough|not (?:demolish|remove)|won.t fit',text,re.I):fail.append('no_honest_refusal')
  if key=='impossible':
   if seconds>10:fail.append('honest_no_over_10_seconds')
   if not re.search(r'bathroom|bath',text,re.I) or not re.search(r'bed|fit|clearance|access|space',text,re.I):fail.append('no_bathroom_feasibility_reason')
 if key=='failed-followup':
  if not re.search(r'bed|bathroom',text,re.I) or not re.search(r'alternative|instead|bedroom|smaller|option|cannot|can.t',text,re.I):fail.append('did_not_address_failed_bathroom_bed_request')
  if typ in ('error','question') or changed:fail.append('failed_followup_not_safe_relevant_answer')
 if key in ('bedroom','living','desk','armchair','sofa') and room is None:fail.append('target_room_missing')
 return {'pass':not fail,'failures':fail,'measurements':measure}

def open_rectangle(scene,room,catalog):
 poly=room['polygon'];obs=[footprint(o,a) for o,a in objects_in(scene,room,catalog) if kind(a)!='rug'];step=.2
 xs=[min(p[0] for p in poly)+(i+.5)*step for i in range(math.ceil((max(p[0] for p in poly)-min(p[0] for p in poly))/step))]
 ys=[min(p[1] for p in poly)+(i+.5)*step for i in range(math.ceil((max(p[1] for p in poly)-min(p[1] for p in poly))/step))]
 heights=[0]*len(xs);best=0
 for y in ys:
  for i,x in enumerate(xs):heights[i]=heights[i]+1 if inside((x,y),poly) and not any(inside((x,y),p) for p in obs) else 0
  stack=[]
  for i,h in enumerate(heights+[0]):
   start=i
   while stack and stack[-1][1]>h:
    j,old=stack.pop();best=max(best,old*(i-j));start=j
   stack.append((start,h))
 return round(best*step*step,3)
