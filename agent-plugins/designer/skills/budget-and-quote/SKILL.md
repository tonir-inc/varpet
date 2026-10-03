---
name: budget-and-quote
description: Furnish to a budget and quote what the proposal costs. Use when the buyer gives a budget in dram, dollars or euros, asks what something costs, asks for a cheaper or more premium version, or wants the total.
---

# Budget and quote

The outcome is a complete room at or under the buyer's number, with a quote they can check line by line.

1. Read the budget in AMD (whole dram). Ask only when the currency is unclear; otherwise convert at the rate the
   buyer gave or state the rate you assumed.
2. Split it before searching: the anchor pieces (sofa, bed, dining table, wardrobe) take about half, seating
   and storage a quarter, rugs, lamps, plants and decor the rest. Pass each role's share as `price_max`.
3. Furnish with `furnish-room`'s steps. Cushions, throws, a rug big enough for the group and art for the long
   wall are cheap next to a sofa; budget for them from the start. Money left goes first to what the room still
   lacks, then to an upgrade of the piece the buyer will touch most. A complete modest room beats a half room with
   one expensive piece.
4. Keep a running total as you place. Over budget: swap the most expensive replaceable piece for a cheaper one
   of the same size (`search_products` with its `kind`, `max_w`/`max_d` and a lower `price_max`).
5. Prices come from the product records (`priceAmd`); a product with no price is "price on request", left out
   of the total and named.

## The quote

One line per product: name in plain words, count, unit price, line total; then the room total and, for a
budget, how much is left or over. Group by room when the proposal spans several. Paint, flooring and labour are
not in the catalog: say the finishes are shown but not priced. Prices are the catalog's current prices; delivery
and assembly are extra.

Done means: the total is at or under the budget (or the overrun and its cause are named), and every product in
the proposal appears in the quote exactly once with its count.
