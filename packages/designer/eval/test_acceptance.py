"""Rubric controls: plausible prose/editor acceptance alone must not pass."""
import copy
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('acceptance_grade',Path(__file__).with_name('acceptance_grade.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class AcceptanceTests(unittest.TestCase):
 def test_suite_has_both_bigger_states_and_failed_followup(self):
  keys=[s['key'] for s in g.tier2('Bedroom 1')]
  self.assertEqual(len(keys),12)
  self.assertTrue({'bigger-furnished','bigger-empty','failed-followup'}<=set(keys))
 def test_reserved_ports_rejected(self):
  for p in (5180,5190,8787,8788):
   with self.assertRaises(ValueError):g.port(p)
  self.assertEqual(g.port(53210),53210)
 def test_gate_never_rounds_small_sample_to_ten_of_ten(self):
  self.assertFalse(g.gate(3,3,1));self.assertTrue(g.gate(10,10,1))
  self.assertTrue(g.gate(8,10,2));self.assertFalse(g.gate(7,10,2))
 def test_semantic_catalog_native_and_misspelling(self):
  self.assertEqual(g.kind({'kind':'table','name':'AmazonBasics Beside Table'}),'nightstand')
  self.assertEqual(g.kind({'kind':'desk','name':'Writing home office'}),'desk')
 def test_rotation_front_and_polygon(self):
  o={'position':[2,0,3],'rotation':0,'scale':[1,1,1]};a={'dimensions':[2,1,1]}
  self.assertEqual(g.axes(o)[1],(0.0,1.0))
  self.assertTrue(g.inside((2,3),g.footprint(o,a)))
  self.assertFalse(g.inside((4,3),g.footprint(o,a)))
 def test_editor_acceptance_is_not_living_pass(self):
  s={'rooms':[{'id':'r','name':'Living room','polygon':[[0,0],[6,0],[6,6],[0,6]]}],'walls':[],'objects':[]}
  result=g.grade('living',s,s,[],{'type':'proposal'},True,'A wonderful layout. Total 0 ֏.',1)
  self.assertFalse(result['pass']);self.assertIn('living_sofa_missing',result['failures'])
 def test_cozy_preserves_customer_objects(self):
  s={'objects':[{'id':'chosen','assetId':'s','position':[0,0,0],'rotation':0,'scale':[1,1,1]}],'rooms':[],'walls':[]}
  a={**s,'objects':[{'id':'plant','assetId':'p','position':[0,0,0],'rotation':0,'scale':[1,1,1]}]}
  result=g.grade('cozier',s,a,[{'id':'s','kind':'sofa','name':'sofa'},{'id':'p','kind':'plant','name':'plant'}],{'type':'proposal'},True,'Added warmth',1)
  self.assertIn('customer_piece_removed:chosen',result['failures'])
 def test_honest_refusal_fast_boundary_and_no_mutation(self):
  s={'objects':[],'walls':[],'rooms':[]}
  reply={'type':'decline','message':'A double bed cannot fit in the bathroom with safe access. Try the bedroom.'}
  self.assertTrue(g.grade('impossible',s,s,[],reply,None,reply['message'],10)['pass'])
  self.assertFalse(g.grade('impossible',s,s,[],reply,None,reply['message'],10.01)['pass'])
  self.assertFalse(g.grade('impossible',s,{**s,'objects':[{'id':'x'}]},[],reply,None,reply['message'],1)['pass'])
 def test_generic_why_and_unrelated_followup_fail(self):
  s={'objects':[],'walls':[],'rooms':[]}
  self.assertFalse(g.grade('why',s,s,[],{'type':'message'},None,'This layout looks better.',1)['pass'])
  self.assertFalse(g.grade('failed-followup',s,s,[],{'type':'message'},None,'Which room should I paint?',1)['pass'])
 def test_quote_requires_per_piece_shop_and_actual_total(self):
  objects=[{'id':'a','assetId':'sku'}];catalog=[{'id':'sku','name':'Blue sofa','price':120000}]
  self.assertFalse(g.quote('Total 120,000 ֏',objects,catalog)['pass'])
  self.assertTrue(g.quote('Blue sofa: 120,000 ֏, shop: Example Store. Total: 120,000 ֏',objects,catalog)['pass'])
  self.assertFalse(g.quote('Blue sofa: 130,000 ֏, shop: Example Store. Total: 130,000 ֏',objects,catalog)['pass'])
 def test_walkway_narrow_door_is_not_accepted(self):
  room={'id':'r','polygon':[[0,0],[4,0],[4,4],[0,4]]}
  scene={'rooms':[room],'objects':[],'walls':[{'id':'w','start':[0,0],'end':[4,0],'thickness':0.1,'openings':[{'id':'d','kind':'door','offset':1.6,'width':0.8}]}]}
  self.assertLess(g.walkway(scene,room,[],(2,2))['width_m'],.9)
 def test_price_substring_and_kind_false_positives(self):
  self.assertFalse(g.quote('Blue sofa: 1120000 AMD, shop: Example Store. Total: 120000 AMD',[{'id':'a','assetId':'sku'}],[{'id':'sku','name':'Blue sofa','price':120000}])['pass'])
  self.assertEqual(g.kind({'kind':'lamp','name':'Bedside nightstand lamp'}),'lamp')
  self.assertEqual(g.kind({'kind':'chair','name':'Office desk chair'}),'chair')
 def test_intersecting_rectangles_have_zero_gap(self):
  a=[[-2,-.1],[2,-.1],[2,.1],[-2,.1]];b=[[-.1,-2],[.1,-2],[.1,2],[-.1,2]]
  self.assertEqual(g.polygon_gap(a,b),0)
 def test_corner_touch_does_not_count_as_room_wall(self):
  room={'polygon':[[0,0],[4,0],[4,4],[0,4]]}
  self.assertFalse(g.wall_borders({'start':[4,4],'end':[7,4]},room))
  self.assertTrue(g.wall_borders({'start':[4,0],'end':[4,8]},room))
 def test_token_formats(self):
  self.assertIsNone(g.tokens({'usage':{'unrecognized':1}}))
  self.assertEqual(g.tokens({'usage':{'inputTokens':20,'outputTokens':2}}),22)
 def test_unnamed_desk_request_can_use_bedroom_window(self):
  room={'id':'bedroom','name':'Bedroom','polygon':[[0,0],[4,0],[4,4],[0,4]]}
  living={'id':'living','name':'Living room','polygon':[[5,0],[9,0],[9,4],[5,4]]}
  wall={'id':'w','start':[0,0],'end':[4,0],'color':'#eeeeee','openings':[{'id':'window','kind':'window','offset':1,'width':2}]}
  before={'rooms':[room,living],'walls':[wall],'objects':[]}
  after={**before,'objects':[{'id':'desk','assetId':'desk','position':[2,0,1],'rotation':0,'scale':[1,1,1]}]}
  catalog=[{'id':'desk','kind':'desk','name':'Writing desk','dimensions':[1,1,.6]}]
  self.assertTrue(g.grade('desk',before,after,catalog,{'type':'proposal'},True,'A desk by the bedroom window',1)['pass'])
 def living_example(self):
  room={'id':'living','name':'Living room','polygon':[[0,0],[7,0],[7,7],[0,7]]}
  scene={'rooms':[room],'walls':[{'id':'south','start':[0,0],'end':[7,0],'color':'#eeeeee','openings':[{'id':'door','kind':'door','offset':.8,'width':1.2}]},{'id':'north','start':[0,7],'end':[7,7],'color':'#eeeeee','openings':[{'id':'window','kind':'window','offset':2,'width':3}]}],'objects':[]}
  catalog=[]
  for name,kind_,dims,x,z in [('sofa','sofa',[2,1,1],3.5,4.5),('Coffee table','table',[1,.5,.6],3.5,5.7),('rug','rug',[3,.03,2],3.5,5),('lamp','lamp',[.3,1.5,.3],2,4.5)]:
   catalog.append({'id':name,'name':name,'kind':kind_,'dimensions':dims,'price':1000})
   scene['objects'].append({'id':name,'assetId':name,'position':[x,0,z],'rotation':0,'scale':[1,1,1]})
  return scene,catalog
 def test_valid_living_program_and_explicit_centimetres_can_pass(self):
  scene,catalog=self.living_example();before={**scene,'objects':[]}
  result=g.grade('living',before,scene,catalog,{'type':'proposal'},True,'Total cost: 4000 AMD',1)
  self.assertTrue(result['pass'],result)
  self.assertTrue(g.grade('why',scene,scene,catalog,{'type':'message'},None,'The coffee table is 40 cm from the sofa.',1)['pass'])
  self.assertFalse(g.grade('why',scene,scene,catalog,{'type':'message'},None,'The coffee table is 40 m from the sofa.',1)['pass'])
 def test_valid_bedroom_has_usable_sides_and_two_bedside_surfaces(self):
  scene={'rooms':[{'id':'bedroom','name':'Bedroom','polygon':[[0,0],[7,0],[7,7],[0,7]]}],'walls':[{'id':'headwall','start':[0,0],'end':[7,0],'color':'#eeeeee','openings':[]}],'objects':[]};catalog=[]
  for name,kind_,dims,x,z in [('bed','bed',[1.8,.7,2],3.5,1.2),('left nightstand','cabinet',[.6,.6,.5],2.1,.55),('right nightstand','cabinet',[.6,.6,.5],4.9,.55),('wardrobe','wardrobe',[.6,2,1.2],6.5,5)]:
   catalog.append({'id':name,'name':name,'kind':kind_,'dimensions':dims,'price':1000})
   scene['objects'].append({'id':name,'assetId':name,'position':[x,0,z],'rotation':0,'scale':[1,1,1]})
  result=g.grade('bedroom',{**scene,'objects':[]},scene,catalog,{'type':'proposal'},True,'Bedroom set',1)
  self.assertTrue(result['pass'],result)
 def test_failed_followup_can_offer_checked_bedroom_alternative(self):
  bedroom={'id':'bedroom','name':'Bedroom','polygon':[[0,0],[5,0],[5,5],[0,5]]}
  bathroom={'id':'bath','name':'Bathroom','polygon':[[6,0],[9,0],[9,3],[6,3]]}
  before={'rooms':[bedroom,bathroom],'walls':[],'objects':[]}
  obj={'id':'bed','assetId':'bed','position':[2,0,2],'rotation':0,'scale':[1,1,1]}
  catalog=[{'id':'bed','kind':'bed','name':'Double bed','dimensions':[1.6,.6,2]}]
  after={**before,'objects':[obj]}
  self.assertTrue(g.grade('failed-followup',before,after,catalog,{'type':'proposal'},True,'A new double bed in the bedroom instead.',1)['pass'])
  unsafe={**before,'objects':[{**obj,'position':[7.5,0,1.5]}]}
  self.assertFalse(g.grade('failed-followup',before,unsafe,catalog,{'type':'proposal'},True,'A new double bed in the bathroom instead.',1)['pass'])
 def test_blocked_entry_is_not_skipped_by_interior_seed(self):
  room={'id':'r','polygon':[[0,0],[4,0],[4,4],[0,4]]}
  scene={'rooms':[room],'objects':[{'id':'barrier','assetId':'barrier','position':[2,0,.3],'rotation':0,'scale':[1,1,1]}],'walls':[{'id':'w','start':[0,0],'end':[4,0],'openings':[{'id':'d','kind':'door','offset':1,'width':2}]}]}
  catalog=[{'id':'barrier','kind':'cabinet','name':'barrier','dimensions':[2,1,.1]}]
  self.assertEqual(g.walkway(scene,room,catalog,(2,2))['width_m'],0)
 def test_angled_armchair_catalog_label_and_dining_negative(self):
  self.assertEqual(g.kind({'kind':'chair','name':'Rivet Lawson Modern Angled Chair, 33W, Dove'}),'armchair')
  self.assertEqual(g.kind({'kind':'chair','name':'Angled back dining chair'}),'chair')
 def test_unknown_tokens_are_not_zero(self):
  self.assertIsNone(g.tokens(None));self.assertEqual(g.tokens({'usage':{'totalTokens':0}}),0)

if __name__=='__main__':unittest.main()
