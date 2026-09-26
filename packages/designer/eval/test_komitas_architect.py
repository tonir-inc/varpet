"""Retry hygiene: a failed new request must not publish an older accepted shell."""
import importlib.util
from pathlib import Path
import tempfile
import unittest


class KomitasRetry(unittest.TestCase):
    def test_clear_only_this_attempts_generated_artifacts(self):
        spec = importlib.util.spec_from_file_location('komitas_architect', Path(__file__).with_name('komitas-architect.py'))
        runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runner)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            stale = ['case.scene.json', 'case.shell.json', 'case.faults.json', 'case.metrics.json',
                     'case.architect.json', 'case.rejected.json', 'case-top.png', 'case-3d.png']
            keep = ['ground-truth.json', 'other.scene.json', 'case.png']
            for name in stale + keep: (root/name).write_text('old')
            runner.clear_previous(root, 'case')
            self.assertTrue(all(not (root/name).exists() for name in stale))
            self.assertTrue(all((root/name).exists() for name in keep))
            runner.clear_previous(root, 'case')  # absent files are normal
