"""Designer-owned compiler adapter: immutable slot dimensions, never program-declared size."""
from __future__ import annotations
import json
import math
from pathlib import Path
import sys


def slot_size_faults(bounds, target):
    try:
        if len(target)!=3 or any(type(v) not in (int,float) or not math.isfinite(v) or v<=0 for v in target):
            raise ValueError('Stored slot size must have three finite positive dimensions')
        if len(bounds)!=2 or any(len(row)!=3 for row in bounds):raise ValueError('Invalid GLB bounds')
        actual=[bounds[1][axis]-bounds[0][axis] for axis in (0,2,1)]
        if any(not math.isfinite(v) or v<=0 for v in actual):raise ValueError('GLB bounds are empty or non-finite')
        return [{'check':'slot_size','axis':axis,'want_m':want,'got_m':got,'tolerance_m':.01}
                for axis,want,got in zip('wdh',target,actual) if abs(want-got)>.01+1e-7]
    except (TypeError,ValueError,IndexError) as error:
        return [{'check':'slot_size','detail':str(error)}]


def compile_slot(spec_path:Path,program:Path,work:Path):
    # Imports live in the compiler's environment. Its internals remain unchanged.
    import trimesh
    from partdsl.compile import compile_file
    from partdsl.sample import resolve
    spec=json.loads(spec_path.read_text());slot=spec['slot'];allowed={Path(p).resolve() for p in spec.get('images',[])}
    data=json.loads(program.read_text())
    for material in data.get('materials',{}).values():
        if isinstance(material,dict) and material.get('sample'):
            photo=resolve(material['sample']['photo'],program.parent).resolve()
            if photo not in allowed:return [{'check':'sample','detail':'Sample only from the supplied private room images.'}]
    faults=compile_file(program,work)
    actual=None
    if (work/'piece.glb').is_file():
        scene=trimesh.load(work/'piece.glb',force='scene')
        faults+=slot_size_faults(scene.bounds.tolist(),slot['size_wdh_m'])
        actual=scene.extents[[0,2,1]].tolist()
    elif not faults:faults=[{'check':'artifact','detail':'Compiler produced no GLB'}]
    (work/'slot-check.json').write_text(json.dumps({'actual_wdh_m':actual,'faults':faults}))
    return faults


def main():
    spec,program,work=map(Path,sys.argv[1:]);work.mkdir(parents=True,exist_ok=True)
    for name in ['piece.glb','slot-check.json','faults.json']:(work/name).unlink(missing_ok=True)
    try:faults=compile_slot(spec,program,work)
    except Exception as error:faults=[{'check':'build','detail':f'{type(error).__name__}: {error}'}]
    if faults:
        (work/'faults.json').write_text(json.dumps(faults));(work/'piece.glb').unlink(missing_ok=True)
        print(json.dumps(faults));return 1
    return 0

if __name__=='__main__':sys.exit(main())
