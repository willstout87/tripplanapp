// backend/free/poll.mjs
// Zero-cost poller. Runs on GitHub Actions cron, writes one JSON file per
// route into data/, commits them. The app reads those files directly.
//
//   node poll.mjs        (needs TRAVELPAYOUTS_TOKEN, optional RAPIDAPI_KEY)
//
// Each route in routes.json names a departure WINDOW (one or more YYYY-MM
// months) rather than a fixed date. The poller asks for the cheapest date in
// each month and records the winner, so the history tracks "what this trip
// costs at its best date" — the number that matters while dates are flexible.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const TOKEN = process.env.TRAVELPAYOUTS_TOKEN;
const RAPIDAPI = process.env.RAPIDAPI_KEY;
const TODAY = new Date().toISOString().slice(0, 10);

if (!TOKEN) { console.error('TRAVELPAYOUTS_TOKEN is not set'); process.exit(1); }

// Cheapest departure in one month. departure_at accepts YYYY-MM.
async function cheapestInMonth(origin, dest, month) {
  const u = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  u.searchParams.set('origin', origin);
  u.searchParams.set('destination', dest);
  u.searchParams.set('departure_at', month);
  u.searchParams.set('one_way', 'true');
  u.searchParams.set('currency', 'usd');
  u.searchParams.set('sorting', 'price');
  u.searchParams.set('limit', '1');
  u.searchParams.set('token', TOKEN);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${origin}-${dest} ${month}: HTTP ${r.status}`);
  const hit = (await r.json()).data?.[0];
  return hit ? { unit: Number(hit.price), date: (hit.departure_at ?? '').slice(0, 10),
                 carrier: hit.airline ?? null, transfers: hit.transfers ?? null } : null;
}

// Fallback. The REST cache is built from real Aviasales searches and thins out
// on unpopular pairs; GraphQL sometimes has a row where v3 returns nothing.
async function cheapestViaGraphQL(origin, dest, month) {
  const query = `{ prices_one_way(
      params: { origin: "${origin}", destination: "${dest}", depart_months: "${month}-01" }
      paging: { limit: 1, offset: 0 }
      sorting: VALUE_ASC
    ) { departure_at value trip_duration } }`;
  const r = await fetch('https://api.travelpayouts.com/graphql/v1/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Access-Token': TOKEN },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) return null;
  const hit = (await r.json())?.data?.prices_one_way?.[0];
  return hit ? { unit: Number(hit.value), date: (hit.departure_at ?? '').slice(0, 10),
                 carrier: null, transfers: null } : null;
}

async function bestAcrossWindow(rt) {
  const tries = [];
  for (const month of rt.window ?? ['2027-06']) {
    let hit = null;
    try { hit = await cheapestInMonth(rt.origin, rt.dest, month); }
    catch (e) { console.error(String(e)); }
    if (!hit) {
      try { hit = await cheapestViaGraphQL(rt.origin, rt.dest, month); }
      catch (e) { console.error(String(e)); }
    }
    if (hit) tries.push({ ...hit, basis: 'window' });
    await new Promise((r) => setTimeout(r, 400));
  }

  // Nothing in the target window. The cache is built from real user searches
  // kept ~7 days, so a month nine months out is often simply empty. Fall back
  // to a rolling near month: not your trip, but a barometer for the route that
  // starts the history line today. Flagged so the app can say so.
  if (!tries.length) {
    for (const offset of [60, 90]) {
      const m = new Date(Date.now() + offset * 864e5).toISOString().slice(0, 7);
      let hit = null;
      try { hit = await cheapestInMonth(rt.origin, rt.dest, m); } catch {}
      if (!hit) { try { hit = await cheapestViaGraphQL(rt.origin, rt.dest, m); } catch {} }
      if (hit) { tries.push({ ...hit, basis: 'barometer' }); break; }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (!tries.length) return null;
  const win = tries.sort((a, b) => a.unit - b.unit)[0];
  return { price: Math.round(win.unit * rt.pax), date: win.date, carrier: win.carrier,
           transfers: win.transfers, basis: win.basis };
}

// Optional: schedule diffs become "capacity pulled" / "competitor entered".
async function schedule(origin, dest) {
  if (!RAPIDAPI) return null;
  try {
    const r = await fetch(
      `https://aerodatabox.p.rapidapi.com/airports/iata/${origin}/stats/routes/daily/${dest}`,
      { headers: { 'x-rapidapi-key': RAPIDAPI, 'x-rapidapi-host': 'aerodatabox.p.rapidapi.com' } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    return { weekly: Math.round((j.averageDailyFlights ?? 0) * 7),
             carriers: (j.operators ?? []).map((o) => o.name) };
  } catch { return null; }
}

const load = async (p, fb) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fb; } };

const routes = await load(new URL('./routes.json', import.meta.url), []);
await mkdir(new URL('./data/', import.meta.url), { recursive: true });
let written = 0, skipped = 0, failed = 0;

for (const rt of routes) {
  const file = new URL(`./data/${rt.origin}-${rt.dest}.json`, import.meta.url);
  const prev = await load(file, { history: [], events: [], schedule: null });
  if (prev.history.at(-1)?.day === TODAY) { skipped++; continue; }

  const q = await bestAcrossWindow(rt);
  if (!q) { failed++; continue; }

  const last = prev.history.at(-1);
  const events = [...prev.events];
  const snap = await schedule(rt.origin, rt.dest);

  if (snap && prev.schedule) {
    const d = snap.weekly - prev.schedule.weekly;
    if (Math.abs(d) >= 2) events.push({
      day: TODAY, kind: 'capacity',
      title: d > 0 ? 'Capacity added on the route' : 'Capacity pulled off the route',
      detail: `${Math.abs(d)} weekly flights ${d > 0 ? 'added' : 'dropped'}`,
      delta: last ? q.price - last.price : 0,
    });
    for (const c of snap.carriers.filter((c) => !prev.schedule.carriers.includes(c)))
      events.push({ day: TODAY, kind: 'competitor', title: `${c} entered the route`,
                    detail: 'New operator on this city pair', delta: last ? q.price - last.price : 0 });
  } else if (last && Math.abs(q.price - last.price) / last.price >= 0.06) {
    events.push({ day: TODAY, kind: 'move',
                  title: q.price > last.price ? 'Sharp rise' : 'Sharp drop',
                  detail: 'No schedule change recorded — demand or fare-bucket move',
                  delta: q.price - last.price });
  }
  // The cheapest date moving is itself news when you are shopping a window.
  if (last?.best_date && q.date && last.best_date !== q.date) {
    events.push({ day: TODAY, kind: 'window', title: 'Cheapest date moved',
                  detail: `Best departure shifted ${last.best_date} to ${q.date}`,
                  delta: last ? q.price - last.price : 0 });
  }

  await writeFile(file, JSON.stringify({
    origin: rt.origin, dest: rt.dest, pax: rt.pax, note: rt.note ?? null,
    window: rt.window, updated: TODAY,
    price: q.price, best_date: q.date, basis: q.basis, carrier: q.carrier, transfers: q.transfers,
    history: [...prev.history, { day: TODAY, price: q.price, best_date: q.date, basis: q.basis }].slice(-400),
    events: events.slice(-40),
    schedule: snap ?? prev.schedule,
  }, null, 1) + '\n');

  written++;
  console.log(rt.origin, '->', rt.dest, '$' + q.price, 'on', q.date, q.basis === 'barometer' ? '(barometer)' : '');
}

// ── hotels: Travelpayouts / Hotellook cached nightly rates ───────────────────
// Same token, different host. The cache.json endpoint returns recently-seen
// prices per city for a date range — enough for a real nightly rate instead of
// a built-in guess. Writes data/hotel-<IATA>.json alongside the fare files.

async function hotelRate(h) {
  const u = new URL('https://engine.hotellook.com/api/v2/cache.json');
  u.searchParams.set('location', h.city);
  u.searchParams.set('checkIn', h.checkIn);
  u.searchParams.set('checkOut', h.checkOut);
  u.searchParams.set('currency', 'usd');
  u.searchParams.set('limit', '40');
  u.searchParams.set('token', TOKEN);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`hotels ${h.city}: HTTP ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return null;

  const nights = Math.max(1, Math.round(
    (new Date(h.checkOut) - new Date(h.checkIn)) / 864e5));
  // priceAvg is for the whole stay; normalise to one night, one room.
  const nightly = rows
    .map((x) => Number(x.priceAvg ?? x.priceFrom ?? 0) / nights)
    .filter((v) => v > 5 && v < 4000)
    .sort((a, b) => a - b);
  if (!nightly.length) return null;

  const at = (q) => Math.round(nightly[Math.floor((nightly.length - 1) * q)]);
  return { median: at(0.5), low: at(0.1), high: at(0.9), sample: nightly.length };
}

async function pollHotels() {
  const list = await load(new URL('./hotels.json', import.meta.url), []);
  for (const h of list) {
    const file = new URL(`./data/hotel-${h.air}.json`, import.meta.url);
    const prev = await load(file, { history: [] });
    if (prev.history.at(-1)?.day === TODAY) continue;

    let q = null;
    try { q = await hotelRate(h); } catch (e) { console.error(String(e)); }
    if (!q) { console.log('hotel', h.city, 'no data'); continue; }

    await writeFile(file, JSON.stringify({
      air: h.air, city: h.city, guests: h.guests,
      check_in: h.checkIn, check_out: h.checkOut, updated: TODAY,
      nightly: q.median, nightly_low: q.low, nightly_high: q.high, sample: q.sample,
      history: [...prev.history, { day: TODAY, nightly: q.median }].slice(-400),
    }, null, 1) + '\n');

    console.log('hotel', h.city, '$' + q.median, '/night from', q.sample, 'properties');
    await new Promise((r) => setTimeout(r, 500));
  }
}

await pollHotels();

console.log(`written ${written}, skipped ${skipped}, failed ${failed}, of ${routes.length}`);
if (failed) console.log('Failed routes are usually thin cache coverage, not bugs — prune them from routes.json.');
if (written === 0 && failed > 0) process.exit(1);
