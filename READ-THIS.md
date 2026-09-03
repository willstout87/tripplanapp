# Hotel rates: the upload that never happened

Your repo root currently has:

    index.html  support.js  routes.json  data/ (18 flight files)  .github/  _ds/

Missing: the updated `poll.mjs` and `hotels.json`. The hotel code was written a
while back but never uploaded, so every stay line in the app still says
`estimated`. That is the whole reason hotel rates are not real yet.

## Upload these three to the repo ROOT

    poll.mjs        <- replaces the current one; adds hotel polling
    hotels.json     <- new; the five cities to price
    routes.json     <- replaces; the pruned 22-route list

Then Actions -> "poll fares" -> Run workflow.

You should see lines like:

    hotel Rome $214 /night from 37 properties

and new files `data/hotel-FCO.json`, `data/hotel-LHR.json`, and so on. The app
reads them automatically — stay rows switch from `estimated` to
`$214/night · 37 properties`.

## What it actually measures

Hotellook's cache endpoint, same Travelpayouts token. For each city it pulls up
to 40 properties for a sample stay, normalises to one night for one room, and
records the median plus the 10th and 90th percentiles. So it is a real market
median rather than one hotel's price — appropriate for budgeting, not a booking
quote.

The sample stay is mid-June 2027 (see `hotels.json`); change `checkIn` and
`checkOut` there if your dates move a lot.
