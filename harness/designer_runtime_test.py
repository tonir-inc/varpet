import importlib.util
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest

spec=importlib.util.spec_from_file_location('designer_runtime',Path(__file__).with_name('designer.py'))
designer=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=designer
spec.loader.exec_module(designer)

class RuntimeTests(unittest.TestCase):
    def test_cloud_cache_is_copied_privately_without_linking_global_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'source';source.mkdir()
            cache=source/'cloud-config-bundle-cache.json';cache.write_text('{"cached":true}')
            runtime=designer.prepare_runtime(root/'runtime',{},source_home=source)
            copied=Path(runtime['home'])/cache.name
            self.assertTrue(copied.is_file())
            self.assertFalse(copied.is_symlink())
            self.assertEqual(copied.read_text(),cache.read_text())
            self.assertEqual(copied.stat().st_mode & 0o777,0o600)
            copied.write_text('{}')
            self.assertEqual(cache.read_text(),'{"cached":true}')

    def test_overall_deadline_stops_a_talkative_explorer(self):
        start=time.monotonic()
        result=designer.watch_process([sys.executable,'-u','-c','import time\nwhile True: print("active",flush=True);time.sleep(.01)'],idle_timeout=2,deadline=start+.15)
        self.assertTrue(result.deadline_exceeded)
        self.assertFalse(result.timed_out)
        self.assertLess(time.monotonic()-start,1)

    def test_shared_cancellation_stops_an_explorer_process_group(self):
        stop=threading.Event();stop.set()
        result=designer.watch_process([sys.executable,'-c','import time;time.sleep(5)'],cancel_event=stop)
        self.assertTrue(result.cancelled)
        self.assertLess(result.seconds,1)

if __name__=='__main__': unittest.main()
