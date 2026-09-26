"""Replay the independent rubric over saved editor exports; never calls a model.
Original run.json grades and all timing/telemetry remain immutable.
"""
import argparse,hashlib,json
from pathlib import Path
import acceptance_grade as g
HERE=Path(__file__).resolve().parent
RETAIN_PREFIXES=('driver_or_transport:','golden_furnishing_prerequisite_missing','preceding_request_did_not_fail','fast_path_telemetry_unverified','models_not_loaded_for_screenshot','browser_errors')
def regrade(directory):
 changes=[]
 for path in sorted(directory.glob('*/run.json')):
  run=json.loads(path.read_text());rows=[]
  for original in run['rows']:
   row=dict(original);key=row['key']
   if key!='open' and not key.endswith('-apply'):
    before=json.loads((path.parent/(key+'-before.json')).read_text());after=json.loads((path.parent/(key+'-after.json')).read_text())
    scored=g.grade(key,before,after,run['catalog'],row['reply'],row['editor_accepted'],row['text'],row['seconds'])
    scored['failures']+= [reason for reason in row['failures'] if reason.startswith(RETAIN_PREFIXES)]
    scored['pass']=not scored['failures'];row.update(scored)
    if row['pass']!=original['pass'] or row['failures']!=original['failures']:
     changes.append({'flat':run['flat'],'repeat':run['repeat'],'key':key,'original_pass':original['pass'],'corrected_pass':row['pass'],'original_failures':original['failures'],'corrected_failures':row['failures']})
   rows.append(row)
  (path.parent/'graded.json').write_text(json.dumps({**run,'rows':rows,'original_run_sha256':hashlib.sha256(path.read_bytes()).hexdigest()},indent=2,ensure_ascii=False)+'\n')
 audit={'method':'Offline regrade only. Original measurements untouched; all completed turns consistently rescored. No model calls or manual overrides.', 'grader_sha256':hashlib.sha256((HERE/'acceptance_grade.py').read_bytes()).hexdigest(),'access_sha256':hashlib.sha256((HERE/'acceptance_access.py').read_bytes()).hexdigest(),'changes':changes}
 (directory/'grading-audit.json').write_text(json.dumps(audit,indent=2)+'\n');return audit
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args();print(json.dumps(regrade(args.directory)))
