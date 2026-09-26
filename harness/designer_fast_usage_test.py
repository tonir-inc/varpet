"""Fresh fast-path threads must not corrupt resumed general-thread accounting."""
import importlib.util
from pathlib import Path
import unittest

class FastUsageContract(unittest.TestCase):
    def test_independent_turn_does_not_advance_general_counter(self):
        path=Path(__file__).with_name('designer_fast.py')
        spec=importlib.util.spec_from_file_location('fast_usage',path)
        api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
        self.assertTrue(hasattr(api,'usage_update'),'per-turn usage boundary exists')
        old={'totalTokens':1000};new={'totalTokens':100}
        self.assertEqual(api.usage_update(old,True,new,True),(new,old,True))
        self.assertEqual(api.usage_update(old,True,{'totalTokens':1300},False),({'totalTokens':300},{'totalTokens':1300},True))
        self.assertEqual(api.usage_update(None,False,new,True),(new,None,False))

if __name__=='__main__':unittest.main()
