// Live load + write-race stress against the Supabase project in .env.local.
//   node --env-file=.env.local --env-file=.env.test tests/adversarial/load_stress.mjs [maxConc]
// Reads: feed / search / RPCs at stepped concurrency → p50/p95/p99, error rate.
// Writes (E2E user): concurrent like insert/delete on one listing → row count and
// listings.likes counter must stay consistent; log_listing_view burst.
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_USER_EMAIL;
const PW = process.env.E2E_USER_PASSWORD;
const MAX = Number(process.argv[2] ?? 100);
if (!URL_ || !ANON || !EMAIL || !PW) { console.error('missing env'); process.exit(2); }

const FEED = 'id,seller_id,title,brand,size,price,category,subcategory,color,gender,condition,images,thumbnails,is_sold,views,likes,tags,created_at,seller:profiles!listings_seller_id_fkey!inner(id,username,full_name,avatar_url,is_verified,vacation_mode)';
const enc = encodeURIComponent;

async function call(path, { method = 'GET', token = ANON, body, headers = {} } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${URL_}${path}`, {
      method,
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, ms: performance.now() - t0 };
  } catch (e) {
    return { status: 0, text: String(e.cause?.code ?? e.message), ms: performance.now() - t0 };
  }
}

const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

async function burst(name, conc, fn) {
  const t0 = performance.now();
  const rs = await Promise.all(Array.from({ length: conc }, (_, i) => fn(i)));
  const wall = performance.now() - t0;
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const bad = rs.filter((r) => r.status < 200 || r.status >= 300);
  const codes = {}; for (const r of bad) codes[r.status] = (codes[r.status] ?? 0) + 1;
  console.log(`${name.padEnd(22)} c=${String(conc).padStart(4)}  p50=${pct(ms, .5).toFixed(0).padStart(5)}  p95=${pct(ms, .95).toFixed(0).padStart(5)}  p99=${pct(ms, .99).toFixed(0).padStart(5)}  wall=${wall.toFixed(0).padStart(5)}ms  err=${bad.length}${bad.length ? ' ' + JSON.stringify(codes) + ' ' + bad[0].text.slice(0, 120) : ''}`);
  return { bad: bad.length, conc, p95: pct(ms, .95) };
}

// ── session ────────────────────────────────────────────────────────────────
const login = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: EMAIL, password: PW } });
if (login.status !== 200) { console.error('login failed', login.status, login.text.slice(0, 200)); process.exit(2); }
const TOK = login.json.access_token;
const ME = login.json.user.id;

const sample = await call(`/rest/v1/listings?select=id,likes,seller_id&is_sold=eq.false&seller_id=neq.${ME}&order=created_at.desc&limit=20`, { token: TOK });
const ids = (sample.json ?? []).map((r) => r.id);
check('sample listings', ids.length > 0, `${ids.length} rows`);
if (!ids.length) process.exit(1);

// ── read load ──────────────────────────────────────────────────────────────
const reads = {
  feed_newest: () => call(`/rest/v1/listings?select=${enc(FEED)}&is_sold=eq.false&seller.vacation_mode=eq.false&order=created_at.desc&limit=60`),
  feed_popular: () => call(`/rest/v1/listings?select=${enc(FEED)}&is_sold=eq.false&seller.vacation_mode=eq.false&order=likes.desc.nullslast,views.desc.nullslast&limit=60`),
  search_ilike: () => call(`/rest/v1/listings?select=${enc(FEED)}&is_sold=eq.false&or=${enc('(title.ilike.%shirt%,brand.ilike.%shirt%,description.ilike.%shirt%)')}&order=likes.desc.nullslast&limit=200`),
  recs_rpc: () => call('/rest/v1/rpc/get_recommendations', { method: 'POST', token: TOK, body: { p_limit: 40 } }),
  similar_rpc: (i) => call('/rest/v1/rpc/find_similar_listings', { method: 'POST', body: { p_listing_id: ids[i % ids.length], p_limit: 12 } }),
  detail: (i) => call(`/rest/v1/listings?select=*,seller:profiles!listings_seller_id_fkey(*)&id=eq.${ids[i % ids.length]}`),
};

console.log(`\n== read load (steps up to ${MAX}) ==`);
const steps = [10, 25, 50, MAX].filter((v, i, a) => v <= MAX && a.indexOf(v) === i);
const breaking = {};
for (const [name, fn] of Object.entries(reads)) {
  for (const c of steps) {
    const r = await burst(name, c, fn);
    if (r.bad && !breaking[name]) breaking[name] = c;
  }
}
for (const name of Object.keys(reads)) check(`${name} no errors up to c=${MAX}`, !breaking[name], breaking[name] ? `first errors at c=${breaking[name]}` : '');

// ── sustained mixed load: 30s, 40 in-flight ───────────────────────────────
console.log('\n== sustained mixed 30s, 40 in-flight ==');
{
  const fns = Object.values(reads);
  const end = Date.now() + 30_000;
  const ms = []; let bad = 0, n = 0; const codes = {};
  await Promise.all(Array.from({ length: 40 }, async (_, w) => {
    while (Date.now() < end) {
      const r = await fns[n % fns.length](n++);
      ms.push(r.ms);
      if (r.status < 200 || r.status >= 300) { bad++; codes[r.status] = (codes[r.status] ?? 0) + 1; }
    }
  }));
  ms.sort((a, b) => a - b);
  console.log(`reqs=${n}  rps=${(n / 30).toFixed(1)}  p50=${pct(ms, .5).toFixed(0)}  p95=${pct(ms, .95).toFixed(0)}  p99=${pct(ms, .99).toFixed(0)}  err=${bad} ${JSON.stringify(codes)}`);
  check('sustained error rate < 1%', bad / n < 0.01, `${(100 * bad / n).toFixed(2)}%`);
}

// ── write races ────────────────────────────────────────────────────────────
console.log('\n== write races ==');
const target = ids[0];
const likesOf = async () => (await call(`/rest/v1/listings?select=likes&id=eq.${target}`, { token: TOK })).json?.[0]?.likes ?? null;
const myLikeRows = async () => (await call(`/rest/v1/listing_likes?select=listing_id&user_id=eq.${ME}&listing_id=eq.${target}`, { token: TOK })).json?.length ?? -1;
const unlike = () => call(`/rest/v1/listing_likes?user_id=eq.${ME}&listing_id=eq.${target}`, { method: 'DELETE', token: TOK });
const like = () => call('/rest/v1/listing_likes', { method: 'POST', token: TOK, body: { user_id: ME, listing_id: target }, headers: { Prefer: 'return=minimal' } });

await unlike();
const base = await likesOf();
const ins = await burst('like x30 same row', 30, like);
const rowsAfter = await myLikeRows();
const likesAfter = await likesOf();
check('concurrent likes → exactly 1 row', rowsAfter === 1, `rows=${rowsAfter}`);
check('likes counter +1 only', likesAfter === base + 1, `before=${base} after=${likesAfter} (${ins.bad} rejected dupes)`);
await burst('unlike x30 same row', 30, unlike);
const likesFinal = await likesOf();
check('concurrent unlikes → counter back to base', likesFinal === base, `base=${base} final=${likesFinal}`);
check('concurrent unlikes → 0 rows', (await myLikeRows()) === 0);

// interleaved like/unlike storm then settle
await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? unlike() : like())));
const rows2 = await myLikeRows(); const likes2 = await likesOf();
check('like/unlike storm → counter matches row', likes2 === base + rows2, `base=${base} rows=${rows2} likes=${likes2}`);
await unlike();
check('cleanup → counter back to base', (await likesOf()) === base);

const views0 = (await call(`/rest/v1/listings?select=views&id=eq.${target}`)).json?.[0]?.views;
await burst('log_listing_view x50', 50, () => call('/rest/v1/rpc/log_listing_view', { method: 'POST', token: TOK, body: { p_listing_id: target } }));
const views1 = (await call(`/rest/v1/listings?select=views&id=eq.${target}`)).json?.[0]?.views;
console.log(`views ${views0} → ${views1} after 50 concurrent views from one user (dedupe expected if enforced)`);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASS'}`);
process.exit(failures ? 1 : 0);
