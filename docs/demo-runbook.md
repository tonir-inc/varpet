# Pitch run-of-show: the designer on the three demo flats

Everything here was run end to end on 27 Sept 2026 (gpt-6-astra, the demo Mac); the times are measured, see the
table at the end. The live designer is real every time: nothing on screen is scripted except the recorded runs,
which are labelled "Recorded run" and are real runs played faster.

## 1. Before the audience arrives (10 min)

```sh
git pull                                  # main
cd harness && uv run python designer_service.py --port 8787     # terminal 1: the designer (warms Chrome + Codex at boot)
VITE_DESIGNER_URL=http://127.0.0.1:8787 pnpm dev                # terminal 2: the editor on http://localhost:5173
python3 tools/demo_doctor.py --quick --only editor,designer      # both OK
curl -s http://127.0.0.1:8787/designer/health                    # {"ok": true, "engine": "spike", "warm": {"renderer": "ready", "codex": "ready"}}
```

Full check (one real designer turn, about 10 min; do it at least once the morning of the pitch):
`python3 tools/demo_rehearse.py --service http://127.0.0.1:8787 --editor http://localhost:5173 --flat orion-t8`
prints every step with its time and ends with `"ok": true`. `python3 tools/demo_replay_check.mjs` (node) plays a
recording and checks Apply: `node tools/demo_replay_check.mjs http://localhost:5173 sunday-b12121 /tmp/replay`.

Open the tabs you need in advance (one per flat): replays load their own flat.

| Flat | Recorded run (opens the flat and plays) | Recorded | Plays in |
|---|---|---|---|
| Sunday Towers penthouse, 188 m² | `http://localhost:5173/?editor&session=sunday-b12121&speed=10` (also the start screen's "Watch the designer furnish Sunday Towers") | 15:41 | 1:45 |
| Orion type 8, 121 m² | `http://localhost:5173/?editor&session=orion-t8&speed=10` | 14:23 | 1:20 |
| Orion type 7, 134 m² (with an inspiration picture) | `http://localhost:5173/?editor&session=orion-t7&speed=10` | ORION_T7_RECORDED | ORION_T7_PLAY |

`speed` is 1-10; 10 keeps a whole flat under two minutes, 4 lets you talk over each room.

## 2. The show

1. **Start screen.** Click "Watch the designer furnish Sunday Towers" (or open the Sunday URL). The flat loads
   empty; the chat header reads "Recorded run · 27 Sep, 10× speed". Say it: *this is a real run from this
   morning, played ten times faster; the clock shows the real minutes.*
2. **While it plays** (about 1:40), narrate what the steps show:
   - the long brief (a family, a lawyer's office, Sunday lunch for 10-12, a grandmother who needs an armchair);
   - the designer asks one question when the brief does not fit the flat (the balcony table), and gets an answer;
   - "Designing the living room / bedroom / entrance" run at the same time: one designer per room;
   - the plan and 3D renders it looks at appear in the chat; *it checks its own work visually*;
   - "Ready to look at: …" cards: press **Preview these rooms** to see finished rooms while the rest is designed;
   - "Reviewing …": an independent reviewer looks at each room's renders and the designer fixes what it finds.
3. **The proposal card**: open floor before and after, the narrowest walkway per room, budget used
   (6,949,800 of 16,000,000 ֏). Press **Apply**. The flat furnishes.
4. **Take the tour** (button on the applied card, or Tour in the dock): about a minute of cinematic walk through
   the furnished flat. Any click or key stops it. It never starts by itself.
5. **Live follow-up** (the service is live from here; the badge reads "Live · continuing the recorded design"). Type
   one of the measured short follow-ups below, and talk while it works (under two minutes). **Apply**, then
   **Undo** to show the customer stays in control: the card reads "Undone · no longer in your flat".
6. Optional: move a piece by hand, then ask another follow-up: the designer keeps the customer's move.

### Short live follow-ups (measured, after the recorded design)

| Flat | Type this | Time to proposal |
|---|---|---|
| Sunday Towers | `Swap the living room sofa for a deep green velvet one.` | 1:31 and 2:00 (two runs) |
| Orion type 8 | `Add a floor lamp next to the living room sofa.` | 2:10 |

Name things the flat has: "the armchair in the reading room" on Orion type 8 got a (correct) question back,
because that room has a desk chair, not an armchair.

Avoid asking for things the catalog lacks (a teepee, dinosaur art): the designer says so honestly and changes
nothing, which is right but slow on stage. Avoid whole-flat requests live: they take 10-15 minutes (that is what
the recordings show).

### What to say about honesty

- The card numbers are measured by the checker (free floor, walkways, budget), not written by the model.
- If the designer cannot meet part of the brief it says so on the card (Notes), including the reviewer's
  remaining notes; if a design fails the physical check it never becomes a proposal.
- The replay badge says "Recorded run"; the live part says "Live".

## 3. When something goes wrong

| Symptom | Fix |
|---|---|
| Chat header shows "Designer offline · start the service" | Terminal 1: `cd harness && uv run python designer_service.py --port 8787`; the chat notices within 3 s. Recordings still play (they need no service) but live follow-ups do not. |
| "Designer warming up" | Wait (about 10 s after the service starts). |
| Live follow-up errors or takes > 3 min | Press Stop, say *it is a live system*, and continue with Undo/Apply on the recorded design. |
| Catalog down (products not loading, grey boxes, "could not be loaded from the catalog") | `python3 tools/demo_doctor.py --only relay-search,catalog-local`; the catalog is the MCP at `VARPET_CATALOG_URL` (default the team VM over Tailscale). Recorded runs need the catalog for models; without it, show the plan view and the card. |
| Chat still shows an old conversation | Header **+** (new conversation). |
| A replay tab was already used | Reload the tab: it opens the flat and plays again. |
| Editor looks stale after a `git pull` | Restart `pnpm dev` (Vite). |

## 4. Reset between rehearsals

- Reload the replay tab (it replaces the scene and starts a new conversation).
- For a clean live flat: File → Import project JSON → `apartments/<flat>/scene.json`, then **+** for a new chat.
- Restarting the designer service forgets live conversations; the chat starts a fresh thread by itself.

## 5. Making a new recording

```sh
python3 tools/demo_rehearse.py --flat orion-t8 --session orion-t8 --title "Orion, type 8, 121 m²" \
  --brief "<brief>" --follow-up "<follow-up>" [--image packages/designer/spike/fixtures/<picture>.jpg]
```
records every streamed line of a real run (`VARPET_RECORD_DIR`) and writes
`apps/editor/public/demo-sessions/<name>.json` (`tools/demo_session.py`): the turns up to the first proposal (a
question and its answer included), previews and room previews, and the final design for live follow-ups.
Commit it if it is under about 3 MB.

## Measured run-of-show (27 Sept, 06:20, demo Mac, one pass)

`designer_service.py` + `vite` fresh, then `node tools/demo_replay_check.mjs <editor> sunday-b12121 <out> "Swap the
living room sofa for a deep green velvet one."`, which clicks through exactly the show above:

| Step | Time |
|---|---|
| Designer service up / warm (renderer + Codex ready) | 0.8 s / 1.5 s |
| Editor up | 1.8 s |
| `demo_doctor --quick --only designer` | PASS, 0.4 s |
| Replay badge on screen | 2 s after opening the URL |
| First "Ready to look at" room card (clock reads 3:37) | 28 s |
| Replay ends on the real proposal (clock reads the recorded 15:41) | 1:45 |
| Apply | 5 s |
| Take the tour, to the end | 1:06 |
| Live follow-up to proposal (sofa swap; 61 s design + 24 s review) | 1:31 |
| Apply + Undo (cards read Applied / Undone) | 6 s |
| **Whole show** | **4:40** |

The same command reproduces the pass and saves a screenshot of each step into its output directory.
