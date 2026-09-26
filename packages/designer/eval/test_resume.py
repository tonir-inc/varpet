import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('eval_resume', Path(__file__).with_name('run.py'))
runner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = runner
spec.loader.exec_module(runner)


class ResumeContract(unittest.TestCase):
    def test_resume_restores_manifest_settings_instead_of_relabelling_new_settings(self):
        args = SimpleNamespace(concurrency=4, timeout=600, idle_timeout=180)
        runner.restore_settings(args, {'concurrency':2,'deadline_seconds':120,'idle_timeout_seconds':60})
        self.assertEqual((args.concurrency,args.timeout,args.idle_timeout),(2,120,60))

    def test_invalid_manifest_never_launches_more_than_four_threads(self):
        args = SimpleNamespace(concurrency=4, timeout=600, idle_timeout=180)
        with self.assertRaises(ValueError):
            runner.restore_settings(args, {'concurrency':8,'deadline_seconds':120,'idle_timeout_seconds':60})


if __name__ == '__main__':
    unittest.main()
