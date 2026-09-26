import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('freeze', Path(__file__).with_name('komitas-freeze.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FrozenInputs(unittest.TestCase):
    def test_changed_input_and_previous_evidence_stop_before_services_start(self):
        self.assertTrue(hasattr(module, 'validate_inputs'))
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'komitas').mkdir()
            scene = home / 'komitas/a.scene.json'
            scene.write_text('{}')
            cohort = {'ids': ['a'], 'inputs': {'a.scene.json': hashlib.sha256(b'{}').hexdigest()}}
            module.validate_inputs(cohort, home)
            scene.write_text('{"changed":true}')
            with self.assertRaisesRegex(ValueError, 'Input changed'):
                module.validate_inputs(cohort, home)
            scene.write_text('{}')
            evidence = home / 'komitas-runs/a-freeze-off'
            evidence.mkdir(parents=True)
            (evidence / 'runner.log').write_text('prior evidence')
            with self.assertRaisesRegex(ValueError, 'Refusing to overwrite'):
                module.validate_inputs(cohort, home)
            self.assertEqual((evidence / 'runner.log').read_text(), 'prior evidence')


if __name__ == '__main__':
    unittest.main()
