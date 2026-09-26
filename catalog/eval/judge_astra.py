"""Judge pooled photos with Codex; --dry-run never calls Codex or writes labels.

Usage: python3 eval/judge_astra.py [q01 q02 ...] [--workers 8] [--dry-run]
       python3 eval/judge_astra.py --agreement
"""

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMG = ROOT.parent / "data" / "img"


def pooled_ids(qid):
    ids = json.loads((ROOT / "sheets" / f"{qid}.json").read_text())
    if not isinstance(ids, list) or any(not isinstance(i, str) for i in ids):
        raise ValueError(f"{qid}: sheet must be a list of item ids")
    return list(dict.fromkeys(ids))


def image_path(iid):
    prefix, sep, name = iid.partition(":")
    if prefix != "abo" or not sep or not name.isalnum():
        raise ValueError(f"Invalid ABO item id: {iid}")
    return IMG / f"{name}.jpg"


def last_json(stdout):
    """Read complete JSON containers, skipping nested values and CLI chatter."""
    decoder = json.JSONDecoder()
    last = None
    pos = 0
    while pos < len(stdout):
        if stdout[pos] in "[{":
            try:
                value, end = decoder.raw_decode(stdout, pos)
            except json.JSONDecodeError:
                pass
            else:
                last = value
                pos = end
                continue
        pos += 1
    if last is None:
        raise ValueError("No JSON array/object in Codex stdout")
    return last


def make_batch(query, ids):
    reference = query["q"].get("like_item")
    paths = ([image_path(reference)] if reference else []) + [image_path(i) for i in ids]
    prompt = f'Customer request: {query["ask"]}\n'
    if reference:
        prompt += ("The first attached photo, photo 0, is the reference item. "
                   "Judge visual similarity to it; do not return photo 0. "
                   f"The remaining photos are candidates numbered 1 through {len(ids)} in order.\n")
    else:
        prompt += f"Candidate photos are numbered 1 through {len(ids)} in attachment order.\n"
    prompt += ('Return only JSON {"relevant": [photo numbers that satisfy the request]}. '
               'Judge the product itself: kind, colour, material, style. Be strict.')
    return query["id"], ids, paths, prompt


def judge_batch(batch):
    qid, ids, paths, prompt = batch
    cmd = ["codex", "exec", "--skip-git-repo-check", "-m", "gpt-6-astra",
           "-c", "model_reasoning_effort=low", "-s", "read-only", prompt]
    for path in paths:
        cmd += ["-i", str(path)]
    out = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True,
                         text=True, timeout=300)
    if out.returncode:
        raise RuntimeError(f"{qid}: Codex exited {out.returncode}: {out.stderr[-1000:]}")
    result = last_json(out.stdout)
    numbers = result.get("relevant") if isinstance(result, dict) else result
    if not isinstance(numbers, list) or any(
        type(n) is not int or not 1 <= n <= len(ids) for n in numbers
    ):
        raise ValueError(f"{qid}: invalid relevant photo numbers: {numbers!r}")
    return qid, [iid for n, iid in enumerate(ids, 1) if n in numbers]


def agreement(qids=None):
    astra = json.loads((ROOT / "labels_astra.json").read_text())
    gold = json.loads((ROOT / "labels.json").read_text())
    common = (set(astra) & set(gold)) - {"_note"}
    if qids:
        common &= set(qids)
    total = matches = astra_yes = gold_yes = 0
    for qid in sorted(common):
        a, g = set(astra[qid]), set(gold[qid])
        for iid in pooled_ids(qid):
            av, gv = iid in a, iid in g
            total += 1
            matches += av == gv
            astra_yes += av
            gold_yes += gv
    if not total:
        print("Per-item agreement: undefined (0 pooled items); Cohen's kappa: undefined")
        return
    observed = matches / total
    expected = (astra_yes * gold_yes + (total - astra_yes) * (total - gold_yes)) / total**2
    kappa = f"{(observed - expected) / (1 - expected):.6f}" if expected < 1 else "undefined (constant labels)"
    print(f"Per-item agreement: {observed:.2%} ({matches}/{total}, {len(common)} queries)")
    print(f"Cohen's kappa: {kappa}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("qids", nargs="*", help="Query ids; defaults to all non-must_be_empty queries")
    ap.add_argument("--workers", type=int, default=8)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Print prompts and image counts only")
    mode.add_argument("--agreement", action="store_true", help="Compare existing labels without calling Codex")
    args = ap.parse_args(argv)
    if args.workers < 1:
        ap.error("--workers must be positive")
    queries = json.loads((ROOT / "queries.json").read_text())["queries"]
    by_id = {q["id"]: q for q in queries}
    unknown = set(args.qids) - set(by_id)
    if unknown:
        ap.error(f"Unknown query ids: {', '.join(sorted(unknown))}")
    if args.agreement:
        agreement(args.qids)
        return
    selected = [by_id[qid] for qid in dict.fromkeys(args.qids)] if args.qids else [
        q for q in queries if not q.get("must_be_empty")
    ]
    batches, labels = [], {}
    for query in selected:
        qid = query["id"]
        if not (ROOT / "sheets" / f"{qid}.json").exists():
            print(f"{qid}: skipped (missing pooled sheet)", file=sys.stderr)
            continue
        ids = pooled_ids(qid)
        labels[qid] = []
        size = 11 if query["q"].get("like_item") else 12
        if not ids:
            print(f"{qid}: 0 images; empty pool")
        for start in range(0, len(ids), size):
            batch = make_batch(query, ids[start:start + size])
            batches.append(batch)
            missing = [str(p) for p in batch[2] if not p.is_file()]
            if args.dry_run:
                print(f"{qid} batch {start // size + 1}: {len(batch[2])} images "
                      f"({len(batch[1])} candidates)\n{batch[3]}\n")
                if missing:
                    print(f"Missing images: {', '.join(missing)}", file=sys.stderr)
            elif missing:
                raise FileNotFoundError(f"{qid}: missing images: {', '.join(missing)}")
    if args.dry_run or not labels:
        return
    # Only save after every batch succeeds; a failed batch is not a negative label.
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for qid, relevant in pool.map(judge_batch, batches):
            labels[qid].extend(relevant)
    target = ROOT / "labels_astra.json"
    existing = json.loads(target.read_text()) if target.exists() else {}
    existing.update(labels)
    existing["_note"] = ("Pooled product photos judged by gpt-6-astra via Codex, "
                         "using customer asks and reference photos for visual similarity. "
                         "Model labels, not human labels; dimensions and prices are not verified from photos.")
    target.write_text(json.dumps(existing, indent=2) + "\n")
    print(f"Wrote {len(labels)} queries to {target}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
