"""Paired complete-room report; unchanged BENCH graders and preserved baseline recordings."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from acceptance_grade import grade

spec=importlib.util.spec_from_file_location('typed_report',Path(__file__).with_name('typed-tools-report.py'))
report=importlib.util.module_from_spec(spec);spec.loader.exec_module(report)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--before',type=Path,required=True)
    p.add_argument('--after',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args();rows=[];hashes={};sources={}
    for phase,root in [('before',args.before),('after',args.after)]:
        for flat in ['avani','balcony','b21-t13']:
            for n in [1,2,3]:
                folder=root/f'after-portal-{flat}-{n}'
                run=json.loads((folder/'run.json').read_text())
                if not run.get('finished_at'):raise ValueError('Incomplete run: '+str(folder))
                sources[f'{phase}/{folder.name}']=run['source']
                for kind in ['living','bedroom','kids']:
                    original=next(r for r in run['rows'] if r['kind']==kind)
                    before=json.loads((folder/f'{kind}-request.json').read_text())['scene']
                    after=json.loads((folder/f'{kind}-after.json').read_text())
                    acceptance={'pass':original['pass'],'failures':original['reasons'],'rubric':'QUALITY/BENCH Komitas kids'} if kind=='kids' else grade(kind,before,after['scene'],after['catalog'],original['reply'],original['editor_accepted'],original['description'],original['seconds'])
                    audit=report.sdk(folder/f'{kind}-sdk.events.jsonl')
                    rows.append({'phase':phase,'flat':flat,'repeat':n,'kind':kind,'runner_pass':original['pass'],'acceptance':acceptance,'editor_accepted':original['editor_accepted'],'outcome':original['outcome'],'seconds':original['seconds'],'tokens':original['tokens'],'description':original['description'],'quality_complete':original['editor_accepted'] is True and original['description'].startswith('Placed the '),'audit':audit})
                for file in folder.iterdir():
                    if file.is_file():hashes[f'{phase}/{folder.name}/{file.name}']=hashlib.sha256(file.read_bytes()).hexdigest()
    def summarize(selected):
        return {**report.stats(selected),'quality_complete':sum(r['quality_complete'] for r in selected)}
    summary={phase:{kind:summarize([r for r in rows if r['phase']==phase and r['kind']==kind]) for kind in ['living','bedroom','kids']} for phase in ['before','after']}
    flats={phase:{flat:{kind:summarize([r for r in rows if r['phase']==phase and r['flat']==flat and r['kind']==kind]) for kind in ['living','bedroom','kids']} for flat in ['avani','balcony','b21-t13']} for phase in ['before','after']}
    args.output.write_text(json.dumps({'status':'complete','sources':sources,'summary':summary,'flats':flats,'rows':rows,'files_sha256':hashes},indent=2)+'\n')
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
