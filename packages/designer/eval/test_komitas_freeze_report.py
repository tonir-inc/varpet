import importlib.util
from pathlib import Path
import unittest


class PairedReport(unittest.TestCase):
    def test_summary_keeps_unknown_tokens_separate_from_measured_zero(self):
        path = Path(__file__).with_name('komitas-freeze-report.py')
        self.assertTrue(path.exists(), 'paired report is not implemented')
        spec = importlib.util.spec_from_file_location('freeze_report', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        rows = [dict(pass_=True, outcome='decline', seconds=2, tokens=0),
                dict(pass_=False, outcome='proposal', seconds=8, tokens=None, editor_accepted=True)]
        rows = [{('pass' if k == 'pass_' else k): v for k, v in row.items()} for row in rows]
        result = module.summary(rows)
        self.assertEqual(result['pass'], '1/2 (50.0%)')
        self.assertEqual(result['editor'], '1/1')
        self.assertEqual(result['seconds'], '5.000 / 8.000')
        self.assertEqual(result['tokens'], '0 / 0 (1/2 measured)')
        self.assertEqual(module.summary([])['tokens'], 'N/A')


if __name__ == '__main__':
    unittest.main()
