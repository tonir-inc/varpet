"""Batch mechanics only: no real model or network calls in unit tests."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('komitas_batch',Path(__file__).with_name('komitas-batch.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Batch(unittest.TestCase):
    def setUp(self):m.STOP.clear()
    def tearDown(self):m.STOP.clear()

    def test_stdin_is_closed_and_nonzero_child_status_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            log=Path(directory)/'run.log'
            code=m.watched([sys.executable,'-c','import sys; print(repr(sys.stdin.read())); sys.exit(7)'],log)
            self.assertEqual(code,7);self.assertEqual(log.read_text().strip(),"''")

    def test_usage_limit_stops_even_if_child_exits_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError,'Batch stopped'):
                m.watched([sys.executable,'-c','print("usage limit reached",flush=True)'],Path(directory)/'run.log')
            self.assertTrue(m.STOP.is_set())

    def test_failed_capture_makes_whole_batch_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(m,'HERE',Path(directory)),patch.object(m,'watched',side_effect=[0,9]),patch.object(m.subprocess,'run'),patch.object(sys,'argv',['batch','sample.scene.json','--truth','truth.json']):
                with self.assertRaisesRegex(SystemExit,'Batch infrastructure failures: 9'):m.main()

    def test_failed_runner_makes_whole_batch_fail_without_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(m,'HERE',Path(directory)),patch.object(m,'watched',return_value=3) as run,patch.object(m.subprocess,'run'),patch.object(sys,'argv',['batch','sample.scene.json','--truth','truth.json']):
                with self.assertRaisesRegex(SystemExit,'Batch infrastructure failures: 3'):m.main()
                self.assertEqual(run.call_count,1)

if __name__=='__main__':unittest.main()
