"""BENCH observation service with browser-compatible automatic request IDs; no product overrides."""
import argparse
import importlib.util
from pathlib import Path
import signal
import threading
import uuid

parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--port',type=int,required=True)
args=parser.parse_args()
if args.port in (5180,5190,8787,8788):
    raise ValueError('Use a spare port')
spec=importlib.util.spec_from_file_location('bench',args.source/'packages/designer/eval/komitas-service.py')
bench=importlib.util.module_from_spec(spec);spec.loader.exec_module(bench)

class Service(bench.Service):
    def propose(self,body,cancel,progress):
        return super().propose({'_evalRunId':'portal-'+uuid.uuid4().hex,**body},cancel,progress)

args.output.mkdir(parents=True,exist_ok=True)
service=Service(args.output,[])
server=bench.recorder.make_server(service,args.port)
def stop(*_):
    threading.Thread(target=server.shutdown,daemon=True).start()
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
try:
    server.serve_forever()
finally:
    service.close();server.server_close()
