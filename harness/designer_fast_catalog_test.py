import importlib.util
from pathlib import Path
import unittest

class CatalogProvenance(unittest.TestCase):
    def test_purchase_requires_explicit_currency_and_catalog(self):
        path=Path(__file__).with_name('designer_fast.py');spec=importlib.util.spec_from_file_location('fast_catalog',path)
        api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
        self.assertTrue(hasattr(api,'purchase_context_known'),'purchase provenance gate exists')
        self.assertFalse(api.purchase_context_known({'request':'Furnish the living room'}))
        self.assertFalse(api.purchase_context_known({'request':'Add a sofa','catalog':[],'catalogCurrency':'USD'}))
        self.assertTrue(api.purchase_context_known({'request':'Add a sofa','catalog':[],'catalogCurrency':'AMD'}))
        self.assertTrue(api.purchase_context_known({'request':'Paint the bedroom walls warm white'}))

if __name__=='__main__':unittest.main()
