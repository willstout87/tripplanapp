# The free version

No server, no database, no monthly bill. A GitHub Action polls once a day and
commits a JSON file per route; the app reads those files straight from the
repo. Total cost: $0.

## Why not just use Google Flights

There is no public Google Flights API — QPX Express was retired in 2018 and
nothing replaced it. Scraping the site yourself is against Google's terms, and
that is precisely the risk SerpApi charges to absorb. So the free route uses
Travelpayouts (Aviasales cached fares) instead: less current than Google, but
real prices, free with an affiliate account, and perfectly good for spotting a
trend over weeks.

Worth knowing: **Google's own price tracking is free.** Track a route on
google.com/travel/flights and it emails you when the fare moves. That is a
legitimate free signal you can use alongside this — it just cannot be charted.

## What is tracked

`routes.json` holds 50 pairs: five origins (SFO, OAK, SJC, LAX, ONT) against
five destinations (Rome, Athens, London, Honolulu, Cancun), in both directions.

Outbound routes are priced against **June 2027**; return routes against **July
2027**, because an 18-23 night trip departing in June comes home between June 19
and July 23. Each route names a `window` of one or more `YYYY-MM` months and the
poller asks for the cheapest departure in each, recording the winning date. The
history therefore tracks what the trip costs *at its best date*, which is the
number that matters while your dates are still flexible — and when that best
date shifts, the app logs it as a "Cheapest date moved" event.

One call per month per route, once a day: 50 calls a day, about 1,500 a month.
To cut it, drop origins (each one costs five routes each way) or shorten the
window list.

## Setup

1. Push this project to a GitHub repo.
2. Sign up at travelpayouts.com, get an API token.
3. Repo → Settings → Secrets → Actions: add `TRAVELPAYOUTS_TOKEN`.
   Optionally `RAPIDAPI_KEY` for AeroDataBox schedule diffs (its free tier
   covers a handful of routes; skip it and you still get prices, just fewer
   annotations).
4. Edit `routes.json` with the pairs you care about. Keep it under about a
   dozen — the free tiers are generous, not infinite.

   **List every origin the app can select.** A route file only exists for the
   pairs you poll, so with only `SFO-*` tracked, switching the app to OAK or
   LAX falls back to built-in estimates. The header chip tells you which you
   are looking at: "Live fares", "Live · 2 of 4 routes", or "Sample fares".
5. Actions tab → "poll fares" → Run workflow, to seed the first data point.
6. In the app's Tweaks, set `faresApi` to
   `https://raw.githubusercontent.com/<you>/<repo>/main/backend/free/data`
   The app detects a static path and reads `SFO-FCO.json` directly.

## What you give up versus the paid stack

- One reading a day instead of two, and cached rather than live-at-this-second.
- Prices are Aviasales' view of the market, not Google's.
- Fare-bucket detail, seat counts and bookable links need a real fare API.
- No push notifications — the Action can open a GitHub issue or send an email
  on a trigger, which is a decent stand-in.

## Upgrade path

Nothing is wasted if you outgrow it. The JSON files are the same history the
paid version keeps in Postgres, so you can import them later. Swap
`faresApi` to a Supabase URL and the app never notices.

## The honest middle option

If $0 turns out to be too limiting, the cheapest real-time step up is not
SerpApi at $50 — it is Duffel, which bills roughly half a cent per search past
its free ratio. Two polls a day across a dozen routes is a few dollars a month.
The catch is that Duffel's test mode returns sandbox prices, so you are paying
from the first real call.
