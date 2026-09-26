"""Small offline report regression: recovered cohorts must not inherit the ten-flat blocker."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

class Report(unittest.TestCase):
    def test_recovered_cohort_uses_frozen_denominator_and_measured_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            (home/'komitas-report.py').write_text(Path(__file__).with_name('komitas-report.py').read_text())
            (home/'komitas-live-cohort.json').write_text(json.dumps({'ids':['a','b']}))
            run=home/'komitas-runs'/'a-recovered1';run.mkdir(parents=True)
            (run/'run.json').write_text(json.dumps({'id':'a','source':'recorded','started_at':'2026-09-26T12:00:00Z','finished_at':'2026-09-26T12:01:00Z','rows':[{'kind':'structural','outcome':'decline','pass':True,'request_match':True,'editor_accepted':None,'seconds':3.5,'tokens':123,'description':'Cannot remove walls.','reasons':[]}]}))
            unrelated=home/'komitas-runs'/'outside-cohort';unrelated.mkdir()
            (unrelated/'run.json').write_text(json.dumps({'id':'outside','source':'recorded','started_at':'2026-09-26T12:00:00Z','rows':[]}))
            result=subprocess.run([sys.executable,str(home/'komitas-report.py')],capture_output=True,text=True,check=True)
            report=(home/'komitas.md').read_text()
            self.assertIn('1/2 flats started, 1/2 completed',report)
            self.assertIn('| structural | 1/1 | 1/1 | 0/0 | 3.500 / 3.500',report)
            self.assertNotIn('Komitas blocked at input',report)
            self.assertIn('Capture status: INCOMPLETE',report)
            self.assertIn('1/2 flats',result.stdout)
            captures=home/'komitas';captures.mkdir()
            (captures/'a-capture.json').write_text(json.dumps({'state':'/previous/checkout/packages/designer/eval/komitas-runs/a-recovered1/final.json','complete':True,'page_errors':[],'failed_requests':[]}))
            for suffix in ('top','3d'):(captures/f'a-furnished-{suffix}.png').touch()
            subprocess.run([sys.executable,str(home/'komitas-report.py')],capture_output=True,text=True,check=True)
            self.assertIn('Capture status: recorded without reported errors',(home/'komitas.md').read_text())

if __name__=='__main__':unittest.main()
