import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('typed_report',Path(__file__).with_name('typed-tools-report.py'))
subject=importlib.util.module_from_spec(spec);spec.loader.exec_module(subject)

class TypedReportTests(unittest.TestCase):
    def test_missing_trace_cannot_meet_two_round_target(self):
        row={'runner_pass':False,'editor_accepted':None,'description':'','audit':{'rounds':None,'missing_trace':True,'exec_calls':0},'acceptance':{'pass':False},'outcome':'error','seconds':1,'tokens':None}
        result=subject.stats([row])
        self.assertEqual(result['within_two_rounds'],0)
        self.assertEqual(result['unknown_rounds'],1)
        self.assertEqual(result['missing_traces'],1)
        self.assertIsNone(result['rounds'])

    def test_incomplete_final_cohort_is_refused_without_publishing(self):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'report.json'
            with patch('sys.argv',['report','--runs',tmp,'--output',str(output)]):
                with self.assertRaisesRegex(ValueError,'Incomplete cohort'):subject.main()
            self.assertFalse(output.exists())

    def test_diagnostic_output_explicitly_labels_missing_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'report.json'
            with patch('sys.argv',['report','--runs',tmp,'--output',str(output),'--partial']),patch('builtins.print'):subject.main()
            result=json.loads(output.read_text())
            self.assertEqual(result['status'],'incomplete')
            self.assertIn('after-portal-avani-3',result['incomplete_runs'])

if __name__=='__main__':unittest.main()
