import unittest
import designer_fast
class DefaultClassRouting(unittest.TestCase):
    def test_measured_classes_only_and_explicit_overrides(self):
        route=getattr(designer_fast,'routing_classes',None)
        self.assertIsNotNone(route)
        defaults=['move.group','feasibility.area']
        self.assertEqual(route({}, {}, defaults), defaults)
        self.assertIsNone(route({'fast_path':True}, {}, defaults))
        self.assertEqual(route({'fast_path':False}, {'VARPET_DESIGNER_FAST_PATH':'1'}, defaults), [])
        self.assertEqual(route({}, {'VARPET_DESIGNER_FAST_PATH':'0'}, defaults), [])
        self.assertIsNone(route({}, {'VARPET_DESIGNER_FAST_PATH':'1'}, defaults))
        self.assertEqual(route({}, {'VARPET_DESIGNER_FAST_PATH':'yes'}, defaults), [])
