# Hotellook is dead — hotels are now yours to enter

## The finding

Not a parameter problem this time. Travelpayouts closed the Hotellook program in
October 2025 and its API stopped working, so `cache.json` and `lookup.json` both
404 for everyone. There is no free hotel price feed available on your token.

## What changed

**`poll.mjs`** — hotel polling removed entirely, so the workflow stops failing
and stops exiting with code 1. Flight polling is untouched. I also fixed the
exit condition: a run where every route already had today's reading was being
treated as a failure.

**`index.html`** — each Stays line on the Budget tab now has a **Rate per night**
field. Until you set one it shows my estimate and says "my estimate — set yours"
in red. Enter the rate you actually found and the label switches to "your rate",
and the figure propagates everywhere: the stay line, the group subtotal, the
trip total, per-person cost, and the Plan tab city cards.

Tested: setting Berlin to $175/night moved the trip total from $10,602 to
$10,302 and flipped that line to "your rate".

## Upload

Both files to the repo root. Run the workflow if you want fresh flight prices;
not required for the hotel change.

## Where every number now comes from

| Line | Source |
| --- | --- |
| Long-haul flights | polled daily from Aviasales |
| Rate per night | yours once entered, else my estimate (labelled) |
| Rail / drive between stops | distance formula (labelled estimated) |
| Local & tickets | per-person-per-day allowance (labelled estimated) |
| Your own lines | yours |

Nothing is presented as measured unless it was measured.
