"""Run up to four flat conversations; closed stdin, silence watchdog, stop on usage limit."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import threading
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
STOP=threading.Event()
REPORT_LOCK=threading.Lock()

def terminate_group(process):
    try:os.killpg(process.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    except PermissionError:
        # macOS can deny signaling an already-exited group. Never hide a
        # failure to stop a live leader; preserve the batch stop after exit.
        if process.poll() is None:raise
    process.wait()

def watched(command,log):
    process=subprocess.Popen(command,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
    selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
    last=time.monotonic();tail=b''
    try:
        with log.open('wb') as stream:
            while True:
                if STOP.is_set() or time.monotonic()-last>240:
                    terminate_group(process)
                    raise RuntimeError('Batch stopped or no output for 240 seconds')
                ready=selector.select(1)
                if ready:
                    chunk=os.read(process.stdout.fileno(),65536)
                    if not chunk:break
                    stream.write(chunk);stream.flush();last=time.monotonic();tail=(tail+chunk)[-8192:]
                    print(chunk.decode(errors='replace').rstrip(),flush=True)
                    if b'usage limit' in tail.lower() or b'EVAL_USAGE_LIMIT' in tail:STOP.set()
                elif process.poll() is not None:break
        return process.wait()
    finally:
        selector.close()
        if process.poll() is None:
            terminate_group(process)
        process.stdout.close()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('scenes',nargs='+',type=Path)
    parser.add_argument('--truth',type=Path,required=True)
    parser.add_argument('--attempt',default='attempt1')
    parser.add_argument('--jobs',type=int,default=4,choices=range(1,5))
    parser.add_argument('--port',type=int,default=5197)
    args=parser.parse_args()
    def run(scene):
        if STOP.is_set():return
        identifier=scene.name.removesuffix('.scene.json')
        output=HERE/'komitas-runs'/f'{identifier}-{args.attempt}'
        output.mkdir(parents=True,exist_ok=True)
        command=[str(ROOT/'packages/designer/node_modules/.bin/tsx'),str(HERE/'komitas-run.ts'),'--scene',str(scene.resolve()),'--truth',str(args.truth.resolve()),'--id',identifier,'--output',str(output)]
        code=watched(command,output/'runner.log')
        if STOP.is_set():return
        if code==0:
            code=watched(['uv','run','--no-project','--with','playwright','python',str(HERE/'komitas-capture.py'),'--state',str(output/'final.json'),'--id',identifier,'--port',str(args.port)],output/'capture.log')
        with REPORT_LOCK:
            subprocess.run(['python3',str(HERE/'komitas-report.py')],cwd=ROOT,check=True,stdin=subprocess.DEVNULL)
        print(json.dumps({'flat':identifier,'exit_code':code}),flush=True)
        return code
    failures=[]
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures=[executor.submit(run,scene) for scene in args.scenes]
        for future in as_completed(futures):
            try:
                code=future.result()
                if code:failures.append(str(code))
            except Exception as error:failures.append(str(error));print(str(error),flush=True)
    if STOP.is_set():raise SystemExit('USAGE LIMIT: batch stopped')
    if failures:raise SystemExit('Batch infrastructure failures: '+ '; '.join(failures))

if __name__=='__main__':main()
