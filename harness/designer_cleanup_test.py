import importlib.util
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('designer_cleanup',Path(__file__).with_name('designer.py'))
designer=importlib.util.module_from_spec(spec);sys.modules[spec.name]=designer;spec.loader.exec_module(designer)

class CleanupTests(unittest.TestCase):
    def test_accepted_proposal_allows_sdk_to_finish_its_normal_cleanup(self):
        stop=threading.Event()
        def watch(command,**kwargs):
            kwargs['on_output']('stdout','{"kind":"event","method":"item/completed"}\n')
            self.assertFalse(kwargs['cancel_event'].is_set())
            return designer.WatchResult(0,'','',False,False,.01)
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(designer,'prepare_runtime',return_value={}), \
             patch.object(designer,'watch_process',side_effect=watch), \
             patch('designer_options.accepted_proposals',return_value=[{'id':'proposal-1'}]):
            result=designer.run_explorer(scene={},request='options',strategy='social_living',effort='low',deadline=time.monotonic()+10,cancel_event=stop,output_dir=Path(directory))
        self.assertEqual(result['status'],'completed')

if __name__=='__main__': unittest.main()
