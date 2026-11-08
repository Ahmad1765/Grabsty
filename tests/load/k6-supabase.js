// k6 load test for the live Supabase backend (k6 port of
// tests/adversarial/load_stress.mjs, for when one PC isn't enough).
//
// Local:   k6 run -e SUPABASE_URL=... -e ANON_KEY=... -e EMAIL=... -e PASSWORD=... tests/load/k6-supabase.js
// Cloud:   k6 cloud login --token <grafana-cloud-k6-token>
//          k6 cloud run -e SUPABASE_URL=... (same -e flags) tests/load/k6-supabase.js
// Tune:    -e PEAK_VUS=300 -e HOLD=5m
//
// Scenarios:
//   browse     — ramping virtual users hitting feed / search / RPCs / detail
//                like a shopper would (with think time).
//   like_race  — one iteration firing 30 identical likes at once, then 30
//                unlikes; checks the listings.likes counter stays consistent.
//
// Thresholds fail the run (non-zero exit) on >1% errors or p95 > 1.5s.
// Watch Supabase rate limits / plan limits before raising PEAK_VUS a lot.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Counter } from 'k6/metrics';

const URL_ = __ENV.SUPABASE_URL;
const ANON = __ENV.ANON_KEY;
const PEAK = Number(__ENV.PEAK_VUS || 100);
const HOLD = __ENV.HOLD || '2m';

const raceFailures = new Counter('race_consistency_failures');

export const options = {
  // http.batch caps parallel requests per host at 6 by default; the race
  // scenario needs all 30 in flight at once.
  batchPerHost: 30,
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.ceil(PEAK / 4) },
        { duration: '1m', target: PEAK },
        { duration: HOLD, target: PEAK },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    like_race: {
      executor: 'shared-iterations',
      exec: 'likeRace',
      vus: 1,
      iterations: 3,
      startTime: '1m', // under load, not on an idle DB
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:browse}': ['p(95)<1500'],
    race_consistency_failures: ['count==0'],
  },
};

const FEED =
  'id,seller_id,title,brand,size,price,category,subcategory,color,gender,condition,images,thumbnails,is_sold,views,likes,tags,created_at,' +
  'seller:profiles!listings_seller_id_fkey!inner(id,username,full_name,avatar_url,is_verified,vacation_mode)';
const enc = encodeURIComponent;

function hdr(token, extra) {
  return { headers: Object.assign({ apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json' }, extra || {}) };
}

export function setup() {
  if (!URL_ || !ANON || !__ENV.EMAIL || !__ENV.PASSWORD) fail('set SUPABASE_URL, ANON_KEY, EMAIL, PASSWORD');
  const login = http.post(`${URL_}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }), hdr());
  if (login.status !== 200) fail(`login failed: ${login.status} ${login.body}`);
  const { access_token: token, user } = login.json();
  const rows = http.get(`${URL_}/rest/v1/listings?select=id&is_sold=eq.false&seller_id=neq.${user.id}&order=created_at.desc&limit=50`, hdr(token)).json();
  if (!rows.length) fail('no listings to target');
  return { token, me: user.id, ids: rows.map((r) => r.id) };
}

export function browse(data) {
  const id = data.ids[Math.floor(Math.random() * data.ids.length)];
  const r = Math.random();
  let res;
  if (r < 0.35) {
    res = http.get(`${URL_}/rest/v1/listings?select=${enc(FEED)}&is_sold=eq.false&seller.vacation_mode=eq.false&order=created_at.desc&limit=60`, Object.assign(hdr(), { tags: { name: 'feed_newest' } }));
  } else if (r < 0.5) {
    res = http.get(`${URL_}/rest/v1/listings?select=${enc(FEED)}&is_sold=eq.false&seller.vacation_mode=eq.false&order=likes.desc.nullslast,views.desc.nullslast&limit=60`, Object.assign(hdr(), { tags: { name: 'feed_popular' } }));
  } else if (r < 0.65) {
    const term = ['shirt', 'nike', 'kurta', 'bag', 'vintage'][Math.floor(Math.random() * 5)];
    res = http.get(`${URL_}/rest/v1/listings?select=${enc(FEED)}&is_sold=eq.false&or=${enc(`(title.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%)`)}&order=likes.desc.nullslast&limit=200`, Object.assign(hdr(), { tags: { name: 'search' } }));
  } else if (r < 0.75) {
    res = http.post(`${URL_}/rest/v1/rpc/get_recommendations`, JSON.stringify({ p_limit: 40 }), Object.assign(hdr(data.token), { tags: { name: 'recs_rpc' } }));
  } else if (r < 0.85) {
    res = http.post(`${URL_}/rest/v1/rpc/find_similar_listings`, JSON.stringify({ p_listing_id: id, p_limit: 12 }), Object.assign(hdr(), { tags: { name: 'similar_rpc' } }));
  } else {
    res = http.get(`${URL_}/rest/v1/listings?select=*,seller:profiles!listings_seller_id_fkey(*)&id=eq.${id}`, Object.assign(hdr(), { tags: { name: 'detail' } }));
  }
  check(res, { 'status 2xx': (x) => x.status >= 200 && x.status < 300 });
  sleep(0.5 + Math.random() * 1.5); // shopper think time
}

export function likeRace(data) {
  const target = data.ids[0];
  const auth = hdr(data.token);
  const likesOf = () => http.get(`${URL_}/rest/v1/listings?select=likes&id=eq.${target}`, auth).json()[0].likes;
  const rowsOf = () => http.get(`${URL_}/rest/v1/listing_likes?select=listing_id&user_id=eq.${data.me}&listing_id=eq.${target}`, auth).json().length;
  const delUrl = `${URL_}/rest/v1/listing_likes?user_id=eq.${data.me}&listing_id=eq.${target}`;
  const like = { method: 'POST', url: `${URL_}/rest/v1/listing_likes`, body: JSON.stringify({ user_id: data.me, listing_id: target }), params: Object.assign(hdr(data.token, { Prefer: 'return=minimal' }), { responseCallback: http.expectedStatuses(201, 409), tags: { name: 'race_like' } }) };
  const unlike = { method: 'DELETE', url: delUrl, params: Object.assign(hdr(data.token), { tags: { name: 'race_unlike' } }) };

  http.del(delUrl, null, auth);
  const base = likesOf();

  http.batch(Array(30).fill(like));
  const okLike = check(null, {
    'race: 30 concurrent likes -> 1 row': () => rowsOf() === 1,
    'race: likes counter +1 only': () => likesOf() === base + 1,
  });
  http.batch(Array(30).fill(unlike));
  const okUnlike = check(null, {
    'race: 30 concurrent unlikes -> 0 rows': () => rowsOf() === 0,
    'race: likes counter back to base': () => likesOf() === base,
  });
  if (!okLike || !okUnlike) raceFailures.add(1);
}

export function teardown(data) {
  // Leave no like behind on the target listing.
  http.del(`${URL_}/rest/v1/listing_likes?user_id=eq.${data.me}&listing_id=eq.${data.ids[0]}`, null, hdr(data.token));
}
