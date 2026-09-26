import importlib.util
from pathlib import Path
import unittest

class CatalogPrefix(unittest.TestCase):
    def test_catalog_prefix_is_static_and_scene_is_not_embedded_in_it(self):
        import designer
        self.assertTrue(hasattr(designer,'catalog_instructions'))
        job={'catalog_prefix':'VERIFIED CATALOG','request':'Paint this room','catalog_context':'secret-context'}
        prefix=designer.catalog_instructions(job,'STATIC RULES')
        self.assertEqual(prefix,'STATIC RULES\n\nVERIFIED CATALOG')
        self.assertNotIn('Paint this room',prefix)
        self.assertNotIn('secret-context',prefix)
        self.assertEqual(designer.catalog_instructions({},'STATIC RULES'),'STATIC RULES')
