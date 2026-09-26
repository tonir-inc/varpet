"""Production purchases must inspect real product previews; rearrangements stay text-only."""
import base64
import importlib
import tempfile
import unittest
from pathlib import Path
import designer

class ProductPreviewTests(unittest.TestCase):
    def products(self):
        return importlib.import_module('designer_products')

    def test_production_tools_enable_proxy_without_changing_reference_config(self):
        config=designer.build_config(Path('/tmp/scene.json'))
        self.products().enable_product_previews(config)
        server=config['mcp_servers']['varpet-designer']
        self.assertIn('show_candidates',server['enabled_tools'])
        self.assertEqual(server['env']['VARPET_VISION_PRODUCTS'],'1')
        self.products().enable_product_previews(config)
        self.assertEqual(server['enabled_tools'].count('show_candidates'),1)
        self.assertNotIn('show_candidates',designer.build_config(Path('/tmp/scene.json'))['mcp_servers']['varpet-designer']['enabled_tools'])

    def test_fast_rearrangement_never_fetches_images(self):
        prepared={'candidates':[{'id':'move','catalog_ids':[]}]}
        with tempfile.TemporaryDirectory() as tmp:
            result,images,legend=self.products().prepare_product_previews(prepared,Path(tmp),fetch=lambda _:self.fail('unexpected network'))
        self.assertEqual(result,prepared);self.assertEqual(images,[])

    def test_fast_shows_every_sku_in_selectable_candidates_with_one_bounded_grid(self):
        prepared={'candidates':[{'id':'a','catalog_ids':['a','b']},{'id':'b','catalog_ids':['b','c']},{'id':'too-many','catalog_ids':[str(i) for i in range(13)]}]}
        seen=[]
        def fetch(ids):
            seen.append(ids)
            return {'content':[{'type':'text','text':'Exact model previews'}, {'type':'image','mimeType':'image/png','data':base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode()}]}
        with tempfile.TemporaryDirectory() as tmp:
            result,images,legend=self.products().prepare_product_previews(prepared,Path(tmp),fetch=fetch)
            self.assertEqual(seen,[['a','b','c']]);self.assertEqual([c['id'] for c in result['candidates']],['a','b'])
            self.assertEqual(len(images),1);self.assertTrue(Path(images[0]).is_file());self.assertIn('Exact model',legend)
        self.assertEqual(len(prepared['candidates']),3)

    def test_missing_preview_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError,'preview'):
                self.products().prepare_product_previews({'candidates':[{'id':'a','catalog_ids':['a']}]},Path(tmp),fetch=lambda _: {'content':[]})

    def test_preview_cli_uses_same_laptop_endpoint_as_general_tools(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        result=SimpleNamespace(returncode=0,deadline_exceeded=False,timed_out=False,usage_limited=False,stdout='{"content":[]}')
        with patch.object(designer,'designer_mcp_env',return_value={'VARPET_CATALOG_URL':'http://localhost:19999/mcp'}),patch.object(designer,'watch_process',return_value=result) as run:
            self.products().fetch_sheet(['a'])
        self.assertEqual(run.call_args.kwargs.get('env',{}).get('VARPET_CATALOG_URL'),'http://localhost:19999/mcp')

    def test_no_purchase_survivor_does_not_restore_unseen_candidates(self):
        prepared={'candidates':[{'id':'too-many','catalog_ids':[str(i) for i in range(13)]},{'id':'move','catalog_ids':[]}]}
        with tempfile.TemporaryDirectory() as tmp:
            result,images,_=self.products().prepare_product_previews(prepared,Path(tmp),fetch=lambda _:self.fail('unexpected network'))
        self.assertEqual([c['id'] for c in result['candidates']],['move'])
        self.assertEqual(images,[])
