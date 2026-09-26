"""Own paired cohort driver; BENCH runner and grader remain unchanged."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
from datetime import datetime,timezone

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
spec=importlib.util.spec_from_file_location('bench_batch',HERE/'komitas-batch.py')
bench=importlib.util.module_from_spec(spec);spec.loader.exec_module(bench)
parser=argparse.ArgumentParser();parser.add_argument('--arm',choices=['before','after'],required=True)
parser.add_argument('--service',required=True);parser.add_argument('--events',required=True)
parser.add_argument('--jobs',type=int,default=2);parser.add_argument('--output');parser.add_argument('--only');args=parser.parse_args()
output=HERE/'fast-runs'/(args.output or 'matrix-'+args.arm);output.mkdir(exist_ok=True)
paths=[*Path(ROOT/'packages/designer/src').rglob('*.ts'),*Path(ROOT/'harness').glob('designer*.py')]
manifest={'arm':args.arm,'started_at':datetime.now(timezone.utc).isoformat(),'revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
 'jobs':args.jobs,'source_hashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'runner':'BENCH komitas-run.ts unchanged','repetitions':'One stateful conversation per selected accepted flat; inspect scene_ids for cohort membership.'}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
scenes=sorted((HERE/'komitas').glob('*.scene.json'))
if not scenes:raise RuntimeError('No accepted Komitas inputs')
if args.only:
 scenes=[scene for scene in scenes if scene.name.removesuffix('.scene.json') in args.only.split(',')]
 if len(scenes)!=len(args.only.split(',')):raise RuntimeError('Unknown requested flat ID')
manifest['scene_ids']=[scene.name.removesuffix('.scene.json') for scene in scenes]
def run(scene):
 identifier=scene.name.removesuffix('.scene.json');target=output/identifier;target.mkdir(exist_ok=True)
 if (target/'run.json').exists():raise RuntimeError(f'Refusing to overwrite {target}')
 cmd=[str(ROOT/'packages/designer/node_modules/.bin/tsx'),str(HERE/'komitas-run.ts'),'--scene',str(scene),'--id',identifier,'--truth',str(HERE/'komitas/ground-truth.json'),'--output',str(target),'--service',args.service,'--events',args.events]
 return bench.watched(cmd,target/'runner.log')
with ThreadPoolExecutor(max_workers=args.jobs) as pool:codes=list(pool.map(run,scenes))
manifest['finished_at']=datetime.now(timezone.utc).isoformat();manifest['exit_codes']=codes
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if any(codes):raise SystemExit('Some conversations failed; retain and count every request')
