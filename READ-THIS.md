# Hotel 404 — fixed, and now self-diagnosing

## What went wrong

I passed a plain city name to Hotellook's cache endpoint:

    https://engine.hotellook.com/api/v2/cache.json?location=Rome&...

The documented endpoint takes a **locationId** or an **IATA code**, not a city
name, and it is documented on **http**, not https. Hence HTTP 404 on all five
cities. My mistake, and I should have verified the parameter shape before
sending it the first time.

## What this version does

For each city it now:

1. Calls `lookup.json` to resolve the city to a real Hotellook locationId
2. Tries `cache.json` with that id, then the IATA code, then the city name
3. Tries https first, then http
4. **Logs which combination worked**, so if anything still fails the log tells
   us exactly what the API accepted rather than leaving us guessing

Successful runs print:

    hotels Rome: OK via https locationId=12209
    hotel Rome $214 /night from 37 properties

Failures print the specific reason per attempt:

    hotels Rome: https locationId -> HTTP 404
    hotels Rome: http location -> 200 but empty

## Upload

Just `poll.mjs` to the repo root, then Run workflow. Nothing else changed.

## Also worth noting from your last run

`written 18, skipped 0, failed 32, of 50` means the old 50-route `routes.json`
is still in place — the pruned 22-route version did not get uploaded. Harmless,
just 28 wasted calls a day. Replace it whenever.

And a genuinely good sign in that log:

    LHR -> LAX $894 on 2027-07-03

No "(barometer)" tag. Real July 2027 fares are starting to enter the cache, so
those legs are now priced for your actual dates.
