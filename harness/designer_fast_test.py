"""The opt-in transport must keep selection small and fail closed."""
import importlib.util
from pathlib import Path
import unittest


class FastWorkerContract(unittest.TestCase):
    def api(self):
        path = Path(__file__).with_name('designer_fast.py')
        self.assertTrue(path.exists(), 'fast worker module exists')
        spec = importlib.util.spec_from_file_location('designer_fast', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_option_is_explicit_and_profile_wins(self):
        api = self.api()
        self.assertFalse(api.enabled({}, {}))
        self.assertTrue(api.enabled({'fast_path': True}, {}))
        self.assertFalse(api.enabled({'fast_path': False}, {'VARPET_DESIGNER_FAST_PATH': '1'}))
        self.assertTrue(api.enabled({}, {'VARPET_DESIGNER_FAST_PATH': '1'}))

    def test_model_sees_ids_scores_recipe_not_ops_or_raw_scene(self):
        api = self.api()
        prepared = {'classId': 'add.one', 'recipe': 'choose', 'candidates': [
            {'id': 'slot-a', 'catalog_ids': ['sku-a'], 'score': 1, 'scores': {},
             'description': 'A sofa', 'ops': [{'type': 'add', 'pos': [999, 999]}]}]}
        prompt = api.selection_prompt('Add a sofa', prepared)
        self.assertIn('slot-a', prompt)
        self.assertIn('sku-a', prompt)
        self.assertNotIn('999', prompt)
        self.assertNotIn('"ops"', prompt)
        schema = api.SELECTION_SCHEMA
        self.assertFalse(schema['additionalProperties'])
        self.assertEqual(set(schema['required']), {'slot_id', 'catalog_ids'})

    def test_unknown_option_values_do_not_enable(self):
        api = self.api()
        self.assertFalse(api.enabled({}, {'VARPET_DESIGNER_FAST_PATH': 'yes'}))
        self.assertFalse(api.enabled({'fast_path': 'false'}, {}))


if __name__ == '__main__':
    unittest.main()
