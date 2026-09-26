import unittest
import acceptance_grade as g

class EmptyRoomExplanationTests(unittest.TestCase):
 def test_no_movable_furniture_is_an_honest_empty_room_explanation(self):
  scene={'rooms':[{'id':'living','name':'Living room','polygon':[[0,0],[4,0],[4,4],[0,4]]}],'walls':[],'objects':[]}
  text='There is no movable furniture in the living room, so there is nothing to rearrange to gain floor space.'
  self.assertTrue(g.grade('bigger-empty',scene,scene,[],{'type':'message'},None,text,2)['pass'])
  self.assertFalse(g.grade('bigger-empty',scene,scene,[],{'type':'error'},None,text,2)['pass'])
  changed={**scene,'objects':[{'id':'new','assetId':'new','position':[1,0,1]}]}
  self.assertFalse(g.grade('bigger-empty',scene,changed,[],{'type':'message'},None,text,2)['pass'])
if __name__=='__main__':unittest.main()
