"""Rebuild vision.md from immutable live rows and explicit human-rubric adjudications."""
import json
from pathlib import Path
import statistics
import sys

HERE = Path(__file__).resolve().parent


def summarize(rows):
    times = [r['seconds'] for r in rows]
    tokens = [r['tokens'] for r in rows if r['tokens'] is not None]
    mutations = [r for r in rows if r['scenario']['expect']['kind'] == 'proposal']
    return {'n': len(rows), 'passed': sum(r['pass'] for r in rows),
            'editor_accepted': sum(r['editor_accepted'] is True for r in mutations),
            'mutation_requests': len(mutations),
            'seconds_median': statistics.median(times), 'seconds_max': max(times),
            'tokens_median': statistics.median(tokens) if tokens else None,
            'tokens_max': max(tokens) if tokens else None, 'tokens_measured': len(tokens)}


def main():
    batch = HERE / (sys.argv[1] if len(sys.argv) > 1 else json.loads((HERE / 'vision-latest.json').read_text())['batch'])
    manifest = json.loads((batch / 'manifest.json').read_text())
    judgement = json.loads((batch / 'adjudications.json').read_text())
    rows = [json.loads((batch / (run_id + '.json')).read_text()) for run_id in manifest['order']]
    assert len(rows) == 28 and manifest['completed'] == 28, 'Do not report an incomplete batch as a full comparison'
    for row in rows:
        row['automatic_pass'] = row['pass']
        if row['id'] in judgement['runs']:
            row['pass'] = judgement['runs'][row['id']]['pass']
            row['adjudication'] = judgement['runs'][row['id']]['reason']
    stats = {condition: summarize([row for row in rows if row['condition'] == condition]) for condition in ('text', 'images')}
    (batch / 'summary.json').write_text(json.dumps({'statistics': stats, 'adjudications': judgement}, indent=2) + '\n')
    link = batch.relative_to(HERE)
    lines = ['# Should the Designer see the room?', '',
             f"[measured] {manifest['started_at']} to {manifest['finished_at']}; gpt-6-astra **low / without-place / compact-base**. Seven requests × two conditions × two fresh-thread repetitions = 28 live HTTP runs. [Manifest]({link}/manifest.json); [aggregate JSON]({link}/summary.json).", '',
             f"[measured] Product base `{manifest['source_revision']}` plus the experimental image/collector patch. [Exact executed source files]({link}/sources/) match the manifest SHA-256 hashes. Later CLI-default compatibility and collector-diagnostic changes do not rewrite these recorded trials.", '',
             '[measured] Input images are screenshots of the running Avani editor on spare port **5193**, not generated pictures: [plan](vision-fixtures/avani-plan.png), [3D](vision-fixtures/avani-3d.png), [capture provenance](vision-fixtures/capture.json), [exact scene/catalog](vision-fixtures/editor-input.json). The grouped variant changes membership only; its visible geometry matches these images.', '',
             '| Condition | Pass | Editor accepted / mutation requests | Median / max seconds | Median / max tokens | Token coverage |',
             '|---|---:|---:|---:|---:|---:|']
    for condition, s in stats.items():
        lines.append(f"| {condition} | {s['passed']}/{s['n']} ({100*s['passed']/s['n']:.1f}%) | {s['editor_accepted']}/{s['mutation_requests']} | {s['seconds_median']:.3f} / {s['seconds_max']:.3f} | {s['tokens_median']:,.0f} / {s['tokens_max']:,} | {s['tokens_measured']}/{s['n']} |")
    lines += ['', '[measured] Seconds span HTTP submission through the final response (offline grading excluded); tokens are cumulative SDK totals including cached input, not estimated cost. One structural-decline run per condition hit the no-output watchdog before any token-usage event. Those runs count as failures and remain in latency statistics; their unavailable token counts are N/A and excluded from token medians/maxima. Default text-only prompt/profile and all physical/request gates stay unchanged. The image condition adds two SDK LocalImageInput values and a note that images are appearance context and JSON controls geometry.', '',
              '[assumed] Each run starts at revision 0, with the normal demo payload and local immutable catalog, and approval only inside a disposable EditorStore. No product UI integration, model/bridge/store mock, north guess, new remote catalog loading, or post-proposal render is introduced. Live catalog prices carry mock provenance.', '',
              '[derived] Seven scenarios comprise all three standing Avani rows plus reading-armchair, cozier, structural-decline and sofa/floor-compatibility requests. Existing Avani independent request/geometry checks plus real EditorStore acceptance grade the first three. The bigger-room proxy requires ≥0.10 m² more largest empty rectangle. Catalog additions must be editor accepted; any accepted row also requires manual armchair/window review. Cozier must ask. Structural work must be politely declined. Sofa/floor answer completeness is manually assessed against the rubric recorded before running: direct judgement, grounded reason, proportionate suggestion/caveat, no edits. An honest request for missing floor information is appropriate behavior but does not complete this visual question.', '',
              f"[derived] [Adjudications]({link}/adjudications.json) keep raw automatic grades unchanged. Structural refusal wording is reviewed semantically because the inherited regex misses ‘but not wall demolition’. A plain conversational answer is transported as `decline` by the current service; this label is not counted as a semantic refusal for the sofa/floor question.", '',
              '[derived] ' + judgement['recommendation'], '', '| Look request | Text-only versus images |', '|---|---|']
    for key, note in judgement['appearance_comparison'].items():
        lines.append('| ' + key + ' | ' + note.replace('|', '\\|').replace('\n', ' ') + ' |')
    lines += ['', '[derived] Two runs per request are a directional experiment, not statistical evidence of a population-wide win. Counterbalanced order reduces simple ordering bias, but cache warmth, server load and concurrent work remain uncontrolled. Four requests run at a time with the production process-tree watchdog (180 s no output); a 600 s HTTP deadline cancels each request. Usage-limit stderr stops the batch. No failures were retried.', '',
              '| Run | Outcome | Pass | Editor accepted | Seconds | Tokens | Evidence |', '|---|---|---|---|---:|---:|---|']
    for row in rows:
        accepted = 'N/A' if row['editor_accepted'] is None else str(row['editor_accepted']).lower()
        lines.append(f"| {row['id']} | {row['outcome']} | {'yes' if row['pass'] else 'no'} | {accepted} | {row['seconds']:.3f} | {row['tokens'] if row['tokens'] is not None else 'N/A'} | [result]({link}/{row['id']}.json), [HTTP]({link}/{row['id']}.http.ndjson), [SDK/bridge]({link}/{row['id']}.events.jsonl) |")
    lines += ['', 'Returned explanations (verbatim; these are model output, not benchmark assertions):', '']
    for row in rows:
        lines += [f"**{row['id']}**", '', '\n'.join(('> ' + line) if line else '>' for line in row['explanation'].splitlines()), '']
        if row['reply'].get('options'):
            lines += ['Options: ' + '; '.join(row['reply']['options']), '']
        if not row['pass']:
            lines += ['[derived] Failure: ' + row.get('adjudication', '; '.join(row['reasons'])).replace('\n', ' '), '']
    lines += ['Opt-in interface and reproduction:', '', '```sh',
              'pnpm --filter @varpet/editor dev --host 127.0.0.1 --port 5193 --strictPort',
              'uv run --no-project --with playwright python packages/designer/eval/capture-vision.py',
              'pnpm --filter @varpet/designer exec tsx eval/vision.ts < /dev/null',
              'python3 packages/designer/eval/vision-report.py',
              '# Independent experimental service; no image flag means text-only:',
              'uv run --no-project --with openai-codex==0.157.1 python harness/designer_service.py --port 8793 \\',
              '  --image packages/designer/eval/vision-fixtures/avani-plan.png \\',
              '  --image packages/designer/eval/vision-fixtures/avani-3d.png', '```', '',
              '[measured] Harness `--image PATH` and service `--image PATH` are repeatable opt-ins (maximum two PNG/JPEG files, 10 MiB each). Service embeddings use `DesignerService(image_paths=[...])`; jobs carry `images`, and the worker attaches local images only when starting the thread. `view_image` stays disabled. Paths are trusted server-side configuration, not accepted from HTTP callers.', '',
              '[derived] ' + judgement['editor_contract'], '',
              '[descoped] No changes to apps/editor/src/main.ts or apps/editor/src/ui/designer-panel.ts; no snapshot/upload/product wiring. Browser appearance is only tested for the initial captured fixture. Real cameras, arbitrary styles and repeated editing conversations are not evaluated.', '']
    (HERE / 'vision.md').write_text('\n'.join(lines))
    print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()
