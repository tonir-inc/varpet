import unittest
from designer_context import model_scene
from designer_service import with_geometry_notice


class ConversionNotesTest(unittest.TestCase):
    def test_object_warning_reaches_model_and_proposal_card(self):
        warning = 'Object f-stool-0 assigned to r-living; its footprint also blocks r-kitchen.'
        view, limited = model_scene({'rooms': [], 'items': [], 'fixed': [], 'conversion_warnings': [warning]})
        self.assertFalse(limited)
        self.assertEqual(view['conversion_warnings'], [warning])
        saved = {'checks': {'notes': [{'check': 'object_conversion', 'message': warning}]}}
        card = with_geometry_notice({'title': 'Paint wall', 'notes': 'Existing note'}, saved)
        self.assertIn(warning, card['notes'])
        self.assertIn('Existing note', card['notes'])
