"""Runner/report regression controls; never starts a model or shared service."""
import importlib.util,json,subprocess,sys,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('acceptance_runner',HERE/'acceptance.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class RunnerTests(unittest.TestCase):
 def test_protected_port_refusal_happens_before_services(self):
  for flag,value in [('--editor-port','5180'),('--editor-port','5190'),('--service-port','8787'),('--service-port','8788')]:
   result=subprocess.run([sys.executable,str(HERE/'acceptance.py'),flag,value],capture_output=True,text=True)
   self.assertEqual(result.returncode,2);self.assertIn('port',result.stderr)
 def test_exit_gate_uses_per_step_tier_targets(self):
  rows=[{'flat':'a','key':'golden','tier':1,'pass':True} for _ in range(10)]
  rows += [{'flat':'a','key':'paint','tier':2,'pass':i<8} for i in range(10)]
  self.assertTrue(r.observed_targets_met(rows))
  rows[0]['pass']=False;self.assertFalse(r.observed_targets_met(rows));rows[0]['pass']=True
  rows[10]['pass']=False;self.assertFalse(r.observed_targets_met(rows))
 def test_missing_runs_stay_in_denominator_and_unknown(self):
  original=r.HERE
  with tempfile.TemporaryDirectory() as tmp:
   r.HERE=Path(tmp);output=r.HERE/'runs';output.mkdir()
   manifest={'flats':['b21-t13','avani'],'runs':3,'tier1_runs':3,'tier1_only':False,'started_at':'measured-test','source':'test','editor_port':53220,'service_port':53221}
   try:
    rows=r.write_report(output,manifest)
    self.assertEqual(len(rows),114)
    self.assertFalse(any(row.get('pass',False) for row in rows))
    self.assertTrue(all(row['tokens'] is None and row['seconds'] is None for row in rows))
    text=(r.HERE/'acceptance.md').read_text()
    self.assertIn('golden conversations complete 0/3',text)
    self.assertIn('| unknown | unknown |',text)
   finally:r.HERE=original
 def test_tier1_ten_keeps_tier2_three(self):
  original=r.HERE
  with tempfile.TemporaryDirectory() as tmp:
   r.HERE=Path(tmp);output=r.HERE/'runs';output.mkdir()
   manifest={'flats':['b21-t13','avani'],'runs':3,'tier1_runs':10,'tier1_only':False,'started_at':'test','source':'test','editor_port':53220,'service_port':53221}
   try:
    rows=r.write_report(output,manifest)
    self.assertEqual(len([x for x in rows if x['tier']==1]),140)
    self.assertEqual(len([x for x in rows if x['tier']==2]),72)
   finally:r.HERE=original
if __name__=='__main__':unittest.main()
