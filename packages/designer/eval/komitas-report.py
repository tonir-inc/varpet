"""Regenerate a measured incremental report from immutable per-flat run evidence."""
import argparse
import json
from pathlib import Path
from collections import Counter
from statistics import median

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--runs',type=Path,default=HERE/'komitas-runs')
parser.add_argument('--output',type=Path,default=HERE/'komitas.md')
args=parser.parse_args()
runs=[(p,json.loads(p.read_text())) for p in sorted(args.runs.glob('*/run.json'))]
komitas=sorted([(p,r) for p,r in runs if r['id']!='avani'],key=lambda pair:pair[1]['started_at'])
latest={}
for p,r in komitas:latest[r['id']]=(p,r)
rows=[row for p,r in latest.values() for row in r['rows']]
fmt=lambda value:'—' if value is None else f'{value:,.3f}' if isinstance(value,float) else str(value)
text=['# Komitas Park: sequential customer benchmark','',f'Measured: {len(latest)}/10 flats started, {sum(bool(r.get("finished_at")) for _,r in latest.values())}/10 completed. Avani calibration is excluded from Komitas rates.','',
'Production profile: gpt-6-astra / low / without-place / compact-base, text only. Live HTTP service, catalog MCP at localhost:8765, catalogCurrency AMD, northDeg 0. One real SDK conversation per flat; every EditorStore-accepted proposal is applied before the next request, including proposals that fail the independent rubric. Errors and questions leave the scene unchanged. Raw SDK events and HTTP replies are saved per turn. No synthetic answers or catalog stubs.','',
'Assumed rubric (declared before Komitas runs): living means at least a sofa and a table; bedroom means exactly one double bed ≥1.35 ×1.8 m, two nightstands and one wardrobe. Catalog titles and broad kinds determine subtypes, not model-supplied names. Desk must be newly added and its footprint within 1.5 m of a same-room window span. Sofa must change pose and face a window span within 15°. Warm white means RGB R≥230, G≥220, B≥205, R≥G≥B, 3≤R−B≤35 on all bedroom wall faces, with a real colour change. Kids applies to ground-truth marketed 3+ room flats (fallback: named living/bedrooms, not counting kitchen/bath); unresolved target roles fail rather than skip; it requires bed, desk and storage in that room and added cost ≤300,000 ֏. These proxies do not claim human taste assessment.','',
'Clearance rule: zero new/worsened measured preferred-clearance deficits, excess sofa/coffee gaps, or walkways below 0.75 m; unchanged pre-existing failures are retained as baseline. The local designer metrics, not the unavailable engine check API, supply these measurements. Pass requires request match, editor acceptance for a proposal, and zero new/worsened failures. Honest but unverified impossibility declines are unresolved. Catalog prices are mock whole AMD prices, not shop quotations.','',
'## Measured summary','', '| Request | Pass / attempts | Request match | Editor accepts / proposals | Median / max seconds | Median / max tokens |','|---|---:|---:|---:|---:|---:|']
for kind in ['living','bedroom','sofa','desk','paint','kids','structural']:
 group=[r for r in rows if r['kind']==kind]
 if not group:continue
 times=[r['seconds'] for r in group];tokens=[r['tokens'] for r in group if r.get('tokens') is not None]
 text.append(f'| {kind} | {sum(r["pass"] for r in group)}/{len(group)} | {sum(r["request_match"] for r in group)}/{len(group)} | {sum(r.get("editor_accepted") is True for r in group)}/{sum(r["outcome"]=="proposal" for r in group)} | {median(times):.3f} / {max(times):.3f} | {fmt(median(tokens) if tokens else None)} / {fmt(max(tokens) if tokens else None)} |')
if rows:
 times=[r['seconds'] for r in rows];tokens=[r['tokens'] for r in rows if r.get('tokens') is not None]
 text+=['',f'Overall: {sum(r["pass"] for r in rows)}/{len(rows)} passes; editor accepts {sum(r.get("editor_accepted") is True for r in rows)}/{sum(r["outcome"]=="proposal" for r in rows)} proposals. Median/max seconds {median(times):.3f}/{max(times):.3f}; token telemetry {len(tokens)}/{len(rows)} turns.']
text+=['','Failure causes (one turn can have multiple causes):']
causes=Counter(cause for row in rows for cause in row.get('reasons',[]))
text += [f'- {cause}: {count}' for cause,count in causes.most_common()] or ['- No Komitas requests measured yet.']
for path,run in runs:
 text+=['',f'## {run["id"]} — {"complete" if run.get("finished_at") else "in progress"}', '',f'Source `{run["source"]}`; raw transcripts and scene snapshots: [`{path.parent.name}/`](komitas-runs/{path.parent.name}/).', '', '| Request | Outcome | Pass | Editor | Seconds | Tokens | New failures | Added pieces | ֏ | Description / failure |','|---|---|---|---|---:|---:|---:|---:|---:|---|']
 for row in run['rows']:
  description=str(row.get('description','')).replace('|','/').replace('\n',' ')
  reason=', '.join(row.get('reasons',[]))
  text.append(f'| {row["kind"]} | {row["outcome"]} | {row["pass"]} | {row.get("editor_accepted")} | {row["seconds"]:.3f} | {fmt(row.get("tokens"))} | {len(row.get("new_failures",[]))} | {len(row.get("catalog_pieces",[]))} | {fmt(row.get("cost_dram"))} | {description} {reason} |')
 capture=HERE/'komitas'/f'{run["id"]}-capture.json'
 manifest=json.loads(capture.read_text()) if capture.exists() else {}
 state=Path(manifest.get('state',''))
 if not state.is_absolute():state=HERE.parents[2]/state
 complete=manifest.get('complete') is True and state.resolve()==(path.parent/'final.json').resolve() and all((HERE/'komitas'/f'{run["id"]}-furnished-{suffix}.png').exists() for suffix in ('top','3d')) and not manifest.get('page_errors') and not manifest.get('failed_requests')
 text+=['',f'Capture status: {"recorded without reported errors" if complete else "INCOMPLETE"}. Screenshots: [top](komitas/{run["id"]}-furnished-top.png), [3D](komitas/{run["id"]}-furnished-3d.png). Capture metadata lists rendering/download errors.']
text+=['','Measured Avani finding: the shared catalog snapshot has 877 assets, zero table-kind desk/workstation titles, zero cabinet-kind wardrobe/armoire titles, and six table/cabinet nightstand titles. Paint changes connected wall sources beyond bedroom faces; the paint grade checks bedroom coverage only, and this spillover remains a product limitation.','', '## Reproduce','', '```sh', 'uv run --no-project --with openai-codex==0.157.1 python -u packages/designer/eval/komitas-service.py --output /tmp/varpet-komitas-events --port 8794 < /dev/null', 'pnpm --filter @varpet/designer exec tsx eval/komitas-run.ts --scene packages/designer/eval/komitas/ID.scene.json --truth packages/designer/eval/komitas/ground-truth.json --output packages/designer/eval/komitas-runs/ID-attempt1', 'python3 packages/designer/eval/komitas-report.py', '```', '', 'Screenshots use `komitas-capture.py --state <final.json> --id ID --port 5197`, with the editor Vite server on 5197. Production UI files are unchanged. Service instrumentation only records events/usage and preserves the real conversation ID in error replies. SDK stdin is closed; the service kills the process tree after 180 s without model output; usage-limit detection cancels active requests and stops the batch. Missing token telemetry is reported as unknown, never estimated.']
args.output.write_text('\n'.join(text)+'\n')
print(f'{len(latest)}/10 flats; {sum(r["pass"] for r in rows)}/{len(rows)} requests pass; {args.output}')
