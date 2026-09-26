"""Three complete fixed Avani + area-proof trials per arm; preserve every attempt."""
import json
from pathlib import Path
import subprocess
import sys
import argparse
from concurrent.futures import ThreadPoolExecutor
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--arm',choices=['before','after']);args=parser.parse_args()
manifest=HERE/f'fast-runs/repeated-{args.arm or "avani"}-complete.json'
if manifest.exists():raise RuntimeError('Refusing to overwrite repeated evidence')
def run(arm):
 rows=[]
 for repetition in range(3):
  for suite in ['avani','bedroom']:
   command=[sys.executable,'-u',str(HERE/'fast-run.py'),'--arm',arm,'--suite',suite]
   if suite=='bedroom':command+=['--only','i01-one-hundred-beds']
   process=subprocess.run(command,text=True,capture_output=True,stdin=subprocess.DEVNULL)
   print(process.stdout,flush=True)
   rows.append({'arm':arm,'repetition':repetition+1,'suite':suite,'exit_code':process.returncode,'stdout':process.stdout,'stderr':process.stderr})
   (HERE/f'fast-runs/repeated-{arm}.json').write_text(json.dumps(rows,indent=2)+'\n')
   if process.returncode:raise RuntimeError(f'{arm} failed: {process.stderr[-1000:]}')
 return rows
with ThreadPoolExecutor(max_workers=2) as pool:rows=list(pool.map(run,[args.arm] if args.arm else ['before','after']))
manifest.write_text(json.dumps({'trials':sum(rows,[])},indent=2)+'\n')
