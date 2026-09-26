# Buyer app

The buyer's flat, delivered by the developer, with the designer working inside it. The design is an
architect's drawing set: the flat is mounted on a tuff sheet, blue marks only what the designer did
(revision cloud, numbered bubbles, grey slots being built), and the title block carries the flat,
the revisions and the total. Design doc: Notion "Designer: from an inspiration photo to a quote".

```sh
pnpm --filter @varpet/buyer dev      # http://127.0.0.1:5195
```

- `?example` starts the recorded example at once; `?speed=10` plays it ten times faster.
- `?flat=<id>` opens a checked Komitas flat instead of the Avani example (read from
  `packages/designer/eval/komitas`, like the showcase; developer plans are never loaded).

## What is real and what is a stand-in

- **Replay.** `public/fixtures/inspiration-avani.json` is a scripted recording (every line `scripted: true`),
  timed at the measured numbers (designer 30–60 s, a piece about 2 min with one fix). The app says
  "Replay of a recorded run" while it plays. Pictures a buyer uploads start the same replay; they need
  the live designer service, which does not accept pictures or send tool and build lines yet.
- **Picture.** The example picture is a drawing (`src/ui/picture.ts`), not a photo. Swap in a licensed
  photo and adjust the piece boxes in the recording.
- **Built pieces.** The sideboard and bookshelf GLBs are real partdsl compiles (programs in
  `scripts/pieces/`). They assemble part by part through the viewport's `animateAssembly`.
- **Prices.** The Avani catalog has no currency, so the app shows "Demo prices, no currency". Komitas
  catalogs marked `AMD` show dram with "Sample prices". Shops and workshops are examples, with no agreement.
- **Checks.** Every change, the designer's or yours, goes through the editor's `EditorStore`.

## Layout

- `src/contracts.ts` stream lines (`progress`, `tool`, `build`, `proposal` with `assets`, …) and UI state.
- `src/stream/` NDJSON reader, recording player, reducer (lines to designer state).
- `src/quote.ts` what it costs, grouped by who you talk to (owned 0, placeholders to buy, custom estimates).
- `src/ui/marks.ts` the designer's marks in the room, following the camera through `viewport.project`.
- `src/main.ts` the sheet: designer mode, by-hand mode, title block, quote.
