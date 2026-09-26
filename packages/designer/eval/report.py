"""Render only saved live measurements; unknown values never become zeros."""
from __future__ import annotations

import json
import math
from pathlib import Path
import statistics

HERE = Path(__file__).resolve().parent


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def number(value, digits=3):
    return f"{value:.{digits}f}" if finite(value) else "N/A"


def escape(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def truth(value):
    return "yes" if value is True else "no" if value is False else "N/A"


def passed(record):
    measurement = record.get("measurement", {})
    # A rejected request cannot pass, even if a corrupt saved grader says it did.
    editor = measurement.get("editor_check")
    editor_ok = editor.get("ok") if isinstance(editor, dict) else None
    needs_editor = record.get("scenario", {}).get("scene_source") == "editor-demo"
    return (measurement.get("pass") is True and measurement.get("request_match") is not False
            and editor_ok is not False and (not needs_editor or editor_ok is True))


def rate(numerator, denominator):
    return f"{numerator}/{denominator} ({100 * numerator / denominator:.1f}%)" if denominator else "0/0 (N/A)"


def summary(records):
    seconds = [r["seconds"] for r in records if finite(r.get("seconds"))]
    tokens = [r["tokens"] for r in records if finite(r.get("tokens"))]
    matches = [r["measurement"]["request_match"] for r in records
               if isinstance(r.get("measurement", {}).get("request_match"), bool)]
    median_seconds = number(statistics.median(seconds)) if seconds else "N/A"
    slowest = number(max(seconds)) if seconds else "N/A"
    median_tokens = number(statistics.median(tokens), 0) if tokens else "N/A"
    return (f"median seconds {median_seconds} (n={len(seconds)}); slowest seconds {slowest} (n={len(seconds)}); "
            f"median tokens {median_tokens} (n={len(tokens)}); pass rate {rate(sum(passed(r) for r in records), len(records))}; "
            f"request-match rate {rate(sum(matches), len(matches))}.")


def metric(record, when, key):
    value = record.get("measurement", {}).get(when)
    return value.get(key) if isinstance(value, dict) else None


def change(record, key):
    before, after = metric(record, "baseline", key), metric(record, "after", key)
    return after - before if finite(before) and finite(after) else None


def write_report(batch: Path):
    batch = batch.resolve()
    manifest = json.loads((batch / "manifest.json").read_text())
    suite = manifest.get("suite", "bedroom")
    if suite not in ("bedroom", "avani"):
        raise ValueError(f"Unknown benchmark suite: {suite}")
    legacy = "suite" not in manifest
    scenarios = manifest.get("scenarios")
    if scenarios is None:
        scenario_path = HERE / ("avani-benchmark-scenarios.json" if suite == "avani" else "benchmark-scenarios.json")
        if not scenario_path.exists():
            scenario_path = HERE / "scenarios.json"
        scenarios = json.loads(scenario_path.read_text())
    known = {s["id"]: s for s in scenarios}
    rows = []
    errors = {tuple(e["job"]): e["error"] for e in manifest.get("errors", [])}
    for job in manifest["jobs"]:
        path = batch / (job["scenario"] + "-" + job["mode"] + ".json")
        record = json.loads(path.read_text()) if path.exists() else None
        rows.append((job, record))
    records = [r for _, r in rows if r is not None]
    base = [r for r in records if r["mode"] == "with-place"]
    ablated = [r for r in records if r["mode"] == "without-place"]
    batch_link = batch.relative_to(HERE.resolve())
    title = "# Designer benchmark — Avani editor demo" if suite == "avani" else "# Designer benchmark — live measured runs"
    lines = [title, "",
             f"[measured] {len(records)}/{len(rows)} recorded. Model `{manifest['model']}`, effort `{manifest['effort']}`, "
             f"concurrency {manifest['concurrency']}; started {manifest['started_at']}; "
             f"finished {manifest.get('finished_at', 'still running')}. Source revision `{manifest['git_revision']}`.", "",
             f"[Source hashes, settings and planned rows]({batch_link}/manifest.json). "
             "Each record includes its exact scene and request; raw SDK events are linked per row.", "",
             "## Summary", "", "[derived] With place: " + summary(base), "",
             "[derived] Without place: " + summary(ablated), "",
             "Pass includes accepted final layout, hard checks and the independently specified request for layout rows; "
             "read-only answers use explicit evidence/decline checks. Request-match denominator contains layout rows only. " +
             ("A refusal of an actionable request is unresolved/fail. The impossible row is the sole mathematically proven impossibility."
              if suite == "bedroom" else "A refusal of an actionable request is unresolved/fail. Existing non-worsened geometry/access violations are notes; new or worsened violations block the proposal."), "",
             "## Per-run measurements", "",
             "Open floor and walkway columns show before → after (change). After is the accepted proposal preview; "
             "when no proposal was accepted it is the immutable baseline (zero change), not a failed candidate. "
             "No proposal is applied to a customer scene.", "",
             "| Scenario | Mode | Status | Seconds | Tokens | Rounds | Propose accepted | Request match | Pass | Open floor m² | Narrowest walkway m | Cost AMD | Tiers hard/trajectory/preferences | Raw transcript |",
             "|---|---|---|---:|---:|---:|---|---|---|---|---|---:|---|---|"]
    if "git_dirty" in manifest:
        lines[4:4] = [f"[measured] Working tree dirty at run start: {truth(manifest['git_dirty'])}. File hashes pin the exact measured source.", ""]
    if suite == "avani":
        lines[-2] = lines[-2].replace("| Pass |", "| Editor preview | Pass |")
        lines[-1] = "|---|---|---|---:|---:|---:|---|---|---|---|---|---|---:|---|---|"
    for job, record in rows:
        if record is None:
            reason = errors.get((job["scenario"], job["mode"]), "pending")
            editor_cell = " N/A |" if suite == "avani" else ""
            lines.append(f"| {job['scenario']} | {job['mode']} | {escape(reason)} | N/A | N/A | N/A | N/A | N/A |{editor_cell} pending | N/A | N/A | N/A | N/A | N/A |")
            continue
        m = record.get("measurement", {})
        tiers = m.get("tiers", {})
        def metric_cell(key):
            return f"{number(metric(record, 'baseline', key))} → {number(metric(record, 'after', key))} ({number(change(record, key))})"
        cells = [job["scenario"], job["mode"], record.get("status", "unknown"), number(record.get("seconds")),
                 number(record.get("tokens"), 0), number(record.get("rounds"), 0), truth(m.get("propose_accepted")),
                 truth(m.get("request_match")), "PASS" if passed(record) else "FAIL", metric_cell("free_area_m2"),
                 metric_cell("narrowest_walkway_m"), number(m.get("cost_dram"), 0),
                 "/".join(truth(tiers.get(k)) for k in ("hard_checks", "legal_trajectory", "preferences")),
                 f"[jsonl]({record.get('transcript', '')})"]
        if suite == "avani":
            cells.insert(8, truth((m.get("editor_check") or {}).get("ok")))
        lines.append("| " + " | ".join(escape(cell) for cell in cells) + " |")
    lines += ["", "## With/without-place comparison", ""]
    with_by_id = {r["scenario"]["id"]: r for r in base if r["scenario"]["category"] == "rearrange"}
    without_by_id = {r["scenario"]["id"]: r for r in ablated if r["scenario"]["category"] == "rearrange"}
    paired = sorted(with_by_id.keys() & without_by_id.keys())
    lines.append(f"[derived] Matched rearrange pairs: n={len(paired)}. Same request, scene, model and effort. Differences are without minus with.")
    lines += ["", "[assumed] This is a single run per condition, sequential conditions on a shared host; "
              "cache, service load and stochastic variation are not controlled. It establishes observations, not a causal speedup estimate.", ""]
    for label, field in (("seconds", "seconds"), ("tokens", "tokens")):
        differences = [without_by_id[k][field] - with_by_id[k][field] for k in paired
                       if finite(without_by_id[k].get(field)) and finite(with_by_id[k].get(field))]
        lines.append(f"[derived] Median paired {label} difference: {number(statistics.median(differences), 3 if field == 'seconds' else 0) if differences else 'N/A'} (n={len(differences)}).")
    lines += ["", "[derived] Paired with place: " + summary([with_by_id[k] for k in paired]), "",
              "[derived] Paired without place: " + summary([without_by_id[k] for k in paired]), "",
              "Exact ablation override (the MCP allowlist also removes `place`):", "",
              "> " + escape(manifest.get("ablation", "Not recorded")).strip(), "", "## Evidence and limitations", "",
              "[measured] Seconds are harness watchdog monotonic wall time including SDK/MCP startup. Tokens are the last cumulative SDK total, "
              "including cached input; token updates are not summed. Rounds count unique cumulative usage notifications with `last.totalTokens > 0`; "
              "they are SDK model usage rounds, not tool calls or customer turns.", "",
              "[derived] Open floor and narrowest walkway use the designer's 5 cm raster and local temporary-scene checks. "
              "The engine integration remains unavailable. Legal trajectory checks every operation prefix separately; final-layout pass does not promise a legal animation path. "
              "Human votes: unvoted. No aesthetic preference claim is proven.", "",
              "[measured] Cost AMD is incremental furniture purchase cost. Billed model billing cost is unavailable from SDK telemetry; no dollar cost is estimated.", "",
              ("[measured] Demo flat: pending — no editor bridge was present at the measured source revision. "
               "The demo in `apps/editor/src/core/demo.ts` is not silently treated as a designer scene." if legacy else
               "[measured] Input is the actual Avani editor demo imported from `apps/editor/src/core/demo.ts` with its local catalog and converted by the editor bridge. "
               "Every recorded row retains the exact editor snapshot, catalog, converted scene and hashes. The explicitly named grouped-v2 variant adds group membership only; the original variant is unchanged."
               if suite == "avani" else "[measured] This batch uses the bedroom fixture; it does not measure the Avani editor suite."), "",
              ("[assumed] The bedroom fixture is the immutable benchmark input; existing defects are not repaired before evaluation. " if suite == "bedroom" else
               "[assumed] The original editor demo is not repaired before evaluation. Baseline issues remain visible, and the full editor approval path is covered separately by deterministic tests. "
               "Every proposal must translate through proposalToEditor, pass EditorStore on a disposable copy, and reproduce the measured poses and wall colours. "
               "This does not prove browser interaction or human approval. The short feel-bigger request is graded with the declared rectangle-area proxy, not an aesthetic vote. ") +
              "Catalog availability and sized products are real service dependencies, never replaced with invented products. "
              "Catalog additions must match a successful search result's SKU, kind, dimensions and price. "
              "A bedside surface uses a declared reach-distance proxy: its footprint must be within 0.60 m of a bed. "
              "Saved outputs can be regraded without rerunning threads; each record's grader hash identifies the scorer, and original transcript summaries remain intact.", "",
              "## Scenario evidence", ""]
    for job, record in rows:
        scenario = record["scenario"] if record else known.get(job["scenario"], {})
        lines.append(f"- `{job['scenario']}` / `{job['mode']}`: {escape(scenario.get('request', 'Request unavailable'))}")
        if scenario.get("grading_assumption"):
            lines.append("  [assumed] " + escape(scenario["grading_assumption"]))
        if record:
            m = record.get("measurement", {})
            reasons = m.get("reasons") or ["No deterministic grading failures."]
            lines.append("  [derived] " + escape("; ".join(reasons)))
            lines.append(f"  [Measurement and final answer]({batch_link}/{record['id']}.json). "
                         f"Largest free rectangle m²: {number(metric(record, 'baseline', 'largest_free_rectangle_m2'))} → "
                         f"{number(metric(record, 'after', 'largest_free_rectangle_m2'))}.")
        elif (job["scenario"], job["mode"]) in errors:
            lines.append("  [measured] " + escape(errors[(job["scenario"], job["mode"])]))
    suite_flag = " --suite avani" if suite == "avani" else ""
    lines += ["", "## Reproduce", "", "```sh", "pnpm --filter @varpet/designer eval" + suite_flag,
              "pnpm --filter @varpet/designer eval" + suite_flag + " --report-only",
              "pnpm --filter @varpet/designer eval" + suite_flag + " --live",
              "# Equivalent direct invocation, with the pinned Python SDK:",
              "uv run --with openai-codex==0.157.1 --no-project python packages/designer/eval/run.py" + suite_flag + " --live", "```", ""]
    path = HERE / ("report-avani.md" if suite == "avani" else "report.md")
    path.write_text("\n".join(lines))
    print(f"Wrote {path}: {len(records)}/{len(rows)} recorded; with-place " + summary(base), flush=True)
    return path
