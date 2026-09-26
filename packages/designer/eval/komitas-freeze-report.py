"""Report only frozen paired runs; preserve historical evidence separately."""
from collections import Counter
import json
from math import ceil
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
KINDS = ['living', 'bedroom', 'sofa', 'desk', 'paint', 'kids', 'structural']


def summary(rows):
    if not rows:
        return dict.fromkeys(['pass', 'editor', 'seconds', 'tokens', 'match'], 'N/A')
    n = len(rows)
    passed = sum(r['pass'] for r in rows)
    times = [r['seconds'] for r in rows]
    tokens = [r['tokens'] for r in rows if r.get('tokens') is not None]
    return {'pass': f'{passed}/{n} ({100 * passed / n:.1f}%)',
            'editor': f'{sum(r.get("editor_accepted") is True for r in rows)}/{sum(r["outcome"] == "proposal" for r in rows)}',
            'seconds': f'{median(times):.3f} / {max(times):.3f}',
            'tokens': f'{median(tokens):,.0f} / {max(tokens):,} ({len(tokens)}/{n} measured)' if tokens else 'N/A',
            'match': f'{sum(bool(r.get("request_match")) for r in rows)}/{n}'}


def cause(row):
    if row['pass']:
        return 'pass'
    reasons = row.get('reasons', [])
    if 'grader_error' in reasons:
        return 'grader could not measure geometry'
    if row['outcome'] == 'error':
        return 'service / bridge error'
    if row['outcome'] == 'question':
        return 'clarification instead of completed request'
    if row['outcome'] in ('decline', 'message'):
        if row['kind'] == 'sofa' and 'sofa' in row.get('description', '').lower():
            return 'sofa goal unresolved after earlier furnishing'
        return 'no accepted design returned'
    if row.get('editor_accepted') is False:
        return 'editor rejected proposal'
    if 'request_mismatch' in reasons:
        return 'accepted design misses independent request rubric'
    if 'new_or_worsened_clearance' in reasons:
        return 'new / worsened clearance or walkway'
    return ', '.join(reasons) or 'unclassified'


def main():
    cohort = json.loads((HERE / 'komitas-freeze-cohort.json').read_text())
    runs = {arm: [] for arm in ('on', 'off')}
    for arm in runs:
        for identifier in cohort['ids']:
            path = HERE / 'komitas-runs' / f'{identifier}-freeze-{arm}' / 'run.json'
            if path.exists():
                runs[arm].append((path, json.loads(path.read_text())))
    arms = {arm: [row for _, run in entries for row in run['rows']] for arm, entries in runs.items()}
    text = ['# Komitas Park: final paired customer benchmark', '',
            f'Frozen product source `{cohort["product_source"]}`; nine published empty flats, one independent conversation per flat per arm, {cohort["planned_turns_per_arm"]} planned requests per arm. `VARPET_DESIGNER_FAST_PATH=1` versus explicit `0` (off, including default routing). Both use gpt-6-astra / low / without-place / compact-base, live HTTP service and catalog at localhost:8765, AMD and northDeg 0. Four conversations total at a time; arm order alternates by flat. No source/model changes between arms.', '',
            'Every EditorStore-accepted proposal is applied before the next request, even if it fails the independent rubric. No invented answers to questions. No model/catalog stubs; catalog prices are mock AMD. Fast routing may complete deterministic requests without a model (measured zero tokens). Other requests use real model calls, with fallback to the general thread when production routing chooses it. Per-turn telemetry records the actual environment flag. Private service ports 8794/8795; reserved ports untouched.', '',
            'Assumed grading stays fixed from the original benchmark: catalog kinds/titles identify furniture, living needs sofa and table, bedroom one double bed/two nightstands/wardrobe, desk within 1.5 m of a window, sofa changes pose and faces a window within 15°, warm-white RGB coverage on bedroom walls, kids bed/desk/storage under 300,000 AMD. Kids eligibility follows marketed room count (four flats). Pass also requires zero new/worsened preferred-clearance or walkway deficits. Structural requests must politely decline without changing the scene. Questions and unverified impossibility are unresolved. Catalog-title and generic bedside-clearance proxies can reject usable substitutions; paint coverage does not grade shared-wall spillover.', '',
            '## Side-by-side results', '',
            '| Request | Fast ON pass | OFF pass | ON editor | OFF editor | ON median/max s | OFF median/max s | ON median/max tokens | OFF median/max tokens |',
            '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    measured = sum(len(rows) for rows in arms.values())
    if measured < 2 * cohort['planned_turns_per_arm']:
        text.insert(2, f'**INCOMPLETE: {measured}/{2 * cohort["planned_turns_per_arm"]} customer turns measured. N/A means unrun, not a measured failure or zero latency.**\n')
    for kind in KINDS + ['all']:
        stats = {arm: summary([r for r in rows if kind == 'all' or r['kind'] == kind]) for arm, rows in arms.items()}
        a, b = stats['on'], stats['off']
        text.append(f'| {kind} | {a["pass"]} | {b["pass"]} | {a["editor"]} | {b["editor"]} | {a["seconds"]} | {b["seconds"]} | {a["tokens"]} | {b["tokens"]} |')
    text += ['', 'Editor denominators count returned proposals only, not service-rejected attempts. Seconds include HTTP, reasoning, tools, translation and store application; cumulative thread usage is differenced per request. Tokens include cached input; they are not an invoice. One observation per flat per arm is a paired diagnostic, not a robust causal estimate.', '']
    for arm, rows in arms.items():
        times = sorted(r['seconds'] for r in rows)
        outcomes = Counter(r['outcome'] for r in rows)
        complete = sum(bool(run.get('finished_at')) for _, run in runs[arm])
        text += [f'{arm.upper()}: {complete}/9 conversations complete, {len(rows)}/{cohort["planned_turns_per_arm"]} turns; request match {summary(rows)["match"]}; outcomes {dict(outcomes)}; p90 seconds {times[ceil(.9 * len(times)) - 1]:.3f}.' if times else f'{arm.upper()}: no measured turns.', '']
    text += ['## Remaining failure causes', '', 'Derived coarse categories from final replies and independent checks; categories are mutually exclusive. The per-turn descriptions below retain exact errors and trade-offs.', '', '| Cause | ON | OFF |', '|---|---:|---:|']
    counts = {arm: Counter(cause(r) for r in rows if not r['pass']) for arm, rows in arms.items()}
    for key in sorted(set(counts['on']) | set(counts['off'])):
        text.append(f'| {key} | {counts["on"][key]} | {counts["off"][key]} |')
    findings = HERE / 'komitas-freeze-findings.md'
    if findings.exists():
        text += ['', findings.read_text().strip()]
    for identifier in cohort['ids']:
        text += ['', f'## {identifier}', '']
        for arm, entries in runs.items():
            match = next(((path, run) for path, run in entries if run['id'] == identifier), None)
            if match is None:
                text += [f'{arm.upper()}: not run.', '']
                continue
            path, run = match
            text += [f'### Fast {arm.upper()}', '', f'Source `{run["source"]}`; [raw HTTP / SDK transcripts, requests and snapshots](komitas-runs/{path.parent.name}/).', '',
                     '| Request | Outcome | Pass | Editor | Seconds | Tokens | New deficits | Added pieces / AMD | Description / failure |',
                     '|---|---|---|---|---:|---:|---:|---:|---|']
            for r in run['rows']:
                description = str(r.get('description', '')).replace('|', '/').replace('\n', ' ')
                deficits = len(r['new_failures']) if 'new_failures' in r else 'unknown'
                purchases = len(r['catalog_pieces']) if 'catalog_pieces' in r else 'unknown'
                text.append(f'| {r["kind"]} | {r["outcome"]} | {r["pass"]} | {r.get("editor_accepted")} | {r["seconds"]:.3f} | {r.get("tokens")} | {deficits} | {purchases} / {r.get("cost_dram")} | {description} {", ".join(r.get("reasons", []))} |')
            if (path.parent / f'{identifier}-capture.json').exists():
                text += ['', f'Final editor captures: [top](komitas-runs/{path.parent.name}/{identifier}-furnished-top.png), [3D](komitas-runs/{path.parent.name}/{identifier}-furnished-3d.png). See capture manifest for render/download status.']
    text += ['', '## Reproduce and provenance', '', '```sh',
             'python3 -u packages/designer/eval/komitas-freeze.py < /dev/null',
             'python3 packages/designer/eval/komitas-freeze-report.py', '```', '',
             'Use product revision `baad342` with these eval scripts to reproduce the frozen setup; a newer runtime is deliberately refused by the source guard and needs a newly declared cohort before running. The launcher refuses to overwrite existing conversations; use a fresh checkout/run directory to repeat. SDK runtime: `/tmp/varpet-designer-sdk/bin/python` with openai-codex installed. Each child has closed stdin, process-group cleanup and a 240-second output watchdog; service workers have a 180-second no-model-output watchdog. A usage limit stops the entire batch.', '',
             '[Frozen input hashes and settings](komitas-freeze-cohort.json); [historical six-flat report and ten-plan handoff](komitas-pre-freeze.md); [verification](komitas-verification.md). Historical input and runtime failures are not pooled into this comparison. All unchanged source scenes remain SERVICE-owned.']
    (HERE / 'komitas.md').write_text('\n'.join(text) + '\n')
    print(json.dumps({arm: summary(rows) for arm, rows in arms.items()}))


if __name__ == '__main__':
    main()
