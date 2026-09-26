import json,sys,time
from pathlib import Path
import numpy as np
import trimesh
from partdsl.compile import compile_file
start=time.monotonic()
p,out=map(Path,sys.argv[1:])
want=json.loads((out/'slot.json').read_text())['size_wdh_m']
faults=compile_file(p,out)
actual=None
if (out/'piece.glb').exists():
    mesh=trimesh.load(out/'piece.glb',force='scene')
    actual=mesh.extents[[0,2,1]].tolist()
    for axis,got,target in zip('wdh',actual,want):
        if abs(got-target)>0.01+1e-7:
            faults.append({'check':'slot_size','axis':axis,'got_m':got,'want_m':target,'tolerance_m':0.01})
with (out/'checks.jsonl').open('a') as f:
    f.write(json.dumps({'seconds':time.monotonic()-start,'faults':faults,'actual_wdh_m':actual})+'\n')
if faults:
    (out/'faults.json').write_text(json.dumps(faults)); sys.exit(1)
(out/'faults.json').unlink(missing_ok=True)
