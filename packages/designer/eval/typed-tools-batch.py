"""Two concurrent real-service runs, with fixed portal inputs and the unchanged BENCH graders."""
import argparse
import concurrent.futures
from pathlib import Path
import subprocess
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[3]
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--phase',choices=['before','after','robustness'],required=True)
    p.add_argument('--source',type=Path,required=True,help='Frozen source used by typed-tools-service.py')
    p.add_argument('--catalog',type=Path,required=True)
    p.add_argument('--events',type=Path,required=True)
    p.add_argument('--service',required=True)
    p.add_argument('--only',default='',help='Comma-separated request classes; omitted runs the whole suite')
    p.add_argument('--runs',type=Path,default=ROOT/'packages/designer/eval/typed-tools-runs')
    args=p.parse_args()
    if urlparse(args.service).hostname not in ('localhost','127.0.0.1') or urlparse(args.service).port in (5180,5190,8787,8788):raise ValueError('Use a spare local port')
    inputs={name:ROOT/f'packages/designer/eval/typed-tools-inputs/{name}.scene.json' for name in ('avani','balcony')}
    inputs['b21-t13']=ROOT/'packages/designer/eval/komitas/b21-t13.scene.json'
    if args.phase=='robustness':inputs={p.name.removesuffix('.scene.json'):p for p in sorted((ROOT/'packages/designer/eval/komitas').glob('*.scene.json')) if p.name!='b21-t13.scene.json' and '.drawn.' not in p.name}
    jobs=[(name,n) for n in range(1,2 if args.phase=='robustness' else 4) for name in inputs]
    def run(job):
        name,n=job;label=f'robustness-{name}' if args.phase=='robustness' else f'{args.phase}-portal-{name}-{n}'
        out=args.runs/label;out.mkdir(parents=True,exist_ok=True)
        cmd=[str(ROOT/'packages/designer/node_modules/.bin/tsx'),str(ROOT/'packages/designer/eval/typed-tools-run.ts'),'--scene',str(inputs[name]),'--id',name,'--catalog',str(args.catalog.resolve()),'--output',str(out.resolve()),'--events',str(args.events.resolve()),'--service',args.service,'--fast-path','0']
        if args.only:cmd.extend(['--only',args.only])
        with (out/'console.log').open('w') as log:code=subprocess.call(cmd,cwd=args.source,stdout=log,stderr=subprocess.STDOUT)
        print((label,code),flush=True)
        return code
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(run,job) for job in jobs]
        for done in concurrent.futures.as_completed(futures):
            if done.result():
                for future in futures:future.cancel()
                raise RuntimeError('Run failed or usage-limited; pending jobs cancelled. Inspect console.log.')

if __name__=='__main__':main()
