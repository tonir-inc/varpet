"""Independent access checks for a proposed bedroom alternative, not a full room program."""
from acceptance_grade import (add,axes,edges,footprint,inside,kind,objects_in,polygon_gap,pos,size,walkway)

def bedroom_alternative(before,after,catalog):
 failures=[];measurements={}
 if any(before.get(key)!=after.get(key) for key in ('rooms','walls','project')):failures.append('alternative_changed_shell_or_project')
 after_by_id={o['id']:o for o in after['objects']}
 if any(after_by_id.get(o['id'])!=o for o in before['objects']):failures.append('alternative_changed_existing_piece')
 existing={o['id'] for o in before['objects']}
 added=[(o,a) for o,a in objects_in(after,None,catalog) if o['id'] not in existing]
 if len(added)!=1 or not added or kind(added[0][1])!='bed':return {'failures':failures+['alternative_is_not_one_new_bed'],'measurements':measurements}
 bed,asset=added[0];w,_,depth=size(bed,asset)
 if w<1.35 or depth<1.8:failures.append('alternative_not_double_bed')
 room=next((r for r in after['rooms'] if ('bedroom' in r['name'].lower() or 'ննջ' in r['name']) and inside(pos(bed),r['polygon'])),None)
 if room is None:return {'failures':failures+['alternative_not_in_bedroom'],'measurements':measurements}
 poly=footprint(bed,asset)
 if not all(inside(add(a,(b[0]-a[0],b[1]-a[1]),i/10),room['polygon']) for a,b in edges(poly) for i in range(11)):failures.append('alternative_footprint_outside_bedroom')
 obstacles=[footprint(o,a) for o,a in objects_in(after,room,catalog) if o['id']!=bed['id'] and kind(a)!='rug']
 for component in after.get('project',{}).get('components',[]):
  if component.get('phase')!='remove' and component['position'][1]<=.1 and inside(pos(component),room['polygon']):obstacles.append(footprint(component,{'dimensions':component['dimensions']}))
 if any(polygon_gap(poly,obstacle)<=1e-8 for obstacle in obstacles):failures.append('alternative_collides_with_existing_piece_or_fixture')
 right,front=axes(bed)
 for side in (-1,1):
  gap=2.
  for offset in (0,depth*.25):
   start=add(add(pos(bed),front,offset),right,side*w/2)
   for step in range(1,201):
    point=add(start,right,side*step*.01)
    if not inside(point,room['polygon']) or any(inside(point,obstacle) for obstacle in obstacles):gap=min(gap,(step-1)*.01);break
  measurements[f'bed_side_{side}_m']=round(gap,3)
  if gap<.6-1e-8:failures.append('alternative_bed_side_below_0.60m')
 # In real walled rooms verify an entry-to-foot route, not only bedside samples.
 # A synthetic open floor with no walls has no doorway bottleneck to measure.
 if after['walls']:
  target=add(pos(bed),front,depth/2+.6)
  old=walkway(before,room,catalog,target);new=walkway(after,room,catalog,target)
  measurements.update(bedroom_route_before=old,bedroom_route_after=new)
  if new['width_m'] is None or new['width_m']<.6:failures.append('alternative_bedroom_access_below_0.60m_or_unmeasured')
 return {'failures':failures,'measurements':measurements}
