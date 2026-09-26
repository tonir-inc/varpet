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
 def test_unknown_tokens_are_not_zero(self):
  self.assertIsNone(g.tokens(None));self.assertEqual(g.tokens({'usage':{'totalTokens':0}}),0)

if __name__=='__main__':unittest.main()
