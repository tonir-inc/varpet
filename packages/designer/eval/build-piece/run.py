import asyncio,json,sys,time,hashlib
from pathlib import Path
from dataclasses import asdict
ROOT=Path(__file__).resolve().parents[4]
sys.path.insert(0,str(ROOT/'harness'))
from openai_codex import AsyncCodex
from varpet_harness.codex_runner import CodexRunner
from varpet_harness.graph import Job
OUT=Path(sys.argv[2]).resolve(); OUT.mkdir(parents=True,exist_ok=False)
PHOTO=Path(sys.argv[1]).resolve()
class MeasuredRunner(CodexRunner):
    async def _turn(self,thread,items,job):
        start=time.monotonic()
        r=await super()._turn(thread,items,job)
        with (OUT/job.effort/'turns.jsonl').open('a') as f:
            f.write(json.dumps({'seconds':time.monotonic()-start,'usage':r.usage.model_dump(mode='json') if r.usage else None})+'\n')
        return r
async def main():
    codex=AsyncCodex()
    runner=MeasuredRunner(codex,ROOT,compile_cmd=[str(ROOT/'compiler/.venv/bin/python'),str(Path(__file__).with_name('check.py'))],format_turns=0,fix_turns=1,progress=lambda s: print(s,flush=True))
    try:
        for effort in ['low','medium']:
            d=OUT/effort;d.mkdir(exist_ok=True)
            (d/'slot.json').write_text(json.dumps({'size_wdh_m':[0.50,0.40,0.65]}))
            job=Job(id='cabinet-bedside-'+effort,kind='piece',brief='Build only the small white bedside cabinet on slender wooden legs between the bed and the leaning mattress. Ignore all loose items on its top. Use the picture for style and details, not dimensions. This is a generic functional cabinet, not a named design. The stored layout slot is exactly width 0.50 m, depth 0.40 m, height 0.65 m. The compiled GLB must fit those dimensions within 1 cm on every axis, including handles and legs. Do not alter the size. Produce the drawer front, carcass and legs the photo shows.',size=[0.50,0.40,0.65],size_source='plan',refs=[str(PHOTO)],skills=['part-dsl-draft'],effort=effort)
            (d/'job.json').write_text(job.model_dump_json(indent=2))
            result=await runner.run(job,d,{})
            (d/'result.json').write_text(json.dumps(asdict(result),indent=2))
            print(json.dumps(asdict(result)),flush=True)
    finally:
        await codex.close()
asyncio.run(main())
