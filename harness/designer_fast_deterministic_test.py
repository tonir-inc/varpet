import unittest
import designer_fast
class DeterministicFastCases(unittest.TestCase):
    def test_exact_appearance_with_one_slot_needs_no_model_judgement(self):
        choose=getattr(designer_fast,'deterministic_selection',None);self.assertIsNotNone(choose)
        row={'id':'slot-paint','catalog_ids':[]}
        self.assertEqual(choose({'type':'candidates','classId':'appearance.walls','candidates':[row]}),{'slot_id':'slot-paint','catalog_ids':[]})
        self.assertIsNone(choose({'type':'candidates','classId':'appearance.walls','candidates':[row,{**row,'id':'other'}]}))
        self.assertIsNone(choose({'type':'candidates','classId':'move.group','candidates':[row]}))
