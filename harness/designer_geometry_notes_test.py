"""Reconciled geometry must remain visible in customer proposal notes."""
import unittest
import designer_service


class GeometryNotesTest(unittest.TestCase):
    def test_geometry_notice_survives_long_presentation(self):
        presentation = {"title": "A", "description": "B", "notes": "x" * 1600}
        saved = {"checks": {"notes": [{"check": "geometry_reconciliation", "message": "Edges corrected within 53 mm."}]}}
        result = designer_service.with_geometry_notice(presentation, saved)
        self.assertIn("Edges corrected within 53 mm.", result["notes"])
        self.assertLessEqual(len(result["notes"]), 1600)
        self.assertEqual(presentation["notes"], "x" * 1600)

    def test_no_reconciliation_keeps_existing_presentation(self):
        value = {"title": "A", "description": "B"}
        self.assertEqual(designer_service.with_geometry_notice(value, {}), value)
