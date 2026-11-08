// Live adversarial auth/authorization suite — runs against the real Supabase
// project over HTTP (GoTrue + PostgREST), exactly as an attacker would.
//
// Needs two synthetic, email-confirmed accounts that share one password:
//   AUDIT_EMAIL_A, AUDIT_EMAIL_B, AUDIT_PASSWORD
// plus EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (from .env.local).
//
//   node --env-file=.env.local tests/adversarial/auth_attacks.mjs [--rate-limit]
//
// --rate-limit adds a brute-force probe that will get this IP throttled on the
// token endpoint for a few minutes. Never point this at accounts real people use.
import { createHash } from 'node:crypto';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const A = process.env.AUDIT_EMAIL_A;
const B = process.env.AUDIT_EMAIL_B;
const PW = process.env.AUDIT_PASSWORD;
if (!URL_ || !ANON || !A || !B || !PW) {
  console.error('missing env (see header)');
  process.exit(2);
}

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const t0 = performance.now();
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, ms: performance.now() - t0 };
}

const login = (email, password = PW) =>
  call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
const refresh = (rt) =>
  call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: rt } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ghost = () => `nobody-${createHash('sha1').update(String(Math.random())).digest('hex').slice(0, 10)}@grabsty.test`;

// ── sessions ────────────────────────────────────────────────────────────────
const a1 = await login(A);
const b1 = await login(B);
if (a1.status !== 200 || b1.status !== 200) {
  console.error('could not sign in test accounts', a1.status, b1.status);
  process.exit(2);
}
const aTok = a1.json.access_token;
const bTok = b1.json.access_token;
const aId = a1.json.user.id;
const bId = b1.json.user.id;

// ── A. account enumeration ──────────────────────────────────────────────────
{
  const known = await login(A, 'definitely-wrong-pw-1');
  const unknown = await login(ghost(), 'definitely-wrong-pw-1');
  check('login: same status + message for known vs unknown email',
    known.status === unknown.status && known.json?.error_code === unknown.json?.error_code,
    `${known.status}/${known.json?.error_code} vs ${unknown.status}/${unknown.json?.error_code}`);

  const su = await call('/auth/v1/signup', { method: 'POST', body: { email: A, password: 'Another-pw-12345' } });
  check('signup with existing email does not error', su.status === 200 && !su.json?.error_code,
    `${su.status} ${su.json?.error_code ?? ''}`);
  check('signup with existing email returns no identities / session',
    !su.json?.access_token && (su.json?.identities?.length ?? 0) === 0);
}

// ── B/C. token validation ───────────────────────────────────────────────────
{
  const c = claims(aTok);
  check('access token lifetime <= 1h', c.exp - c.iat <= 3600, `${c.exp - c.iat}s`);
  check('access token carries no password/secret material',
    !JSON.stringify({ ...c, amr: undefined }).match(/password|secret|refresh/i));

  const [h, , s] = aTok.split('.');
  const forgedSub = `${h}.${b64({ ...c, sub: bId })}.${s}`;
  const algNone = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...c, sub: bId })}.`;
  const expired = `${h}.${b64({ ...c, exp: Math.floor(Date.now() / 1000) - 60 })}.${s}`;
  for (const [name, tok] of [['payload-tampered', forgedSub], ['alg=none', algNone], ['expired-claim', expired], ['garbage', 'abc.def.ghi']]) {
    const r1 = await call(`/rest/v1/shipping_addresses?select=id`, { token: tok });
    const r2 = await call('/auth/v1/user', { token: tok });
    check(`${name} JWT rejected by PostgREST and Auth`, r1.status === 401 && (r2.status === 401 || r2.status === 403),
      `rest=${r1.status} auth=${r2.status}`);
  }
}

// ── F. authorization / account isolation ────────────────────────────────────
{
  const r = await call(`/rest/v1/profiles?id=eq.${bId}`, {
    method: 'PATCH', token: aTok, body: { bio: 'pwned' }, headers: { Prefer: 'return=representation' },
  });
  check("A cannot update B's profile", Array.isArray(r.json) && r.json.length === 0, `${r.status} ${r.text.slice(0, 80)}`);

  for (const [col, val] of [['is_admin', true], ['is_verified', true], ['is_pro', true], ['rating', 5], ['total_sales', 999]]) {
    const e = await call(`/rest/v1/profiles?id=eq.${aId}`, {
      method: 'PATCH', token: aTok, body: { [col]: val }, headers: { Prefer: 'return=representation' },
    });
    check(`A cannot self-grant profiles.${col}`, e.status >= 400, `${e.status}`);
  }
  for (const col of ['followers_count', 'following_count']) {
    const e = await call(`/rest/v1/profiles?id=eq.${aId}`, {
      method: 'PATCH', token: aTok, body: { [col]: 100000 }, headers: { Prefer: 'return=representation' },
    });
    check(`A cannot forge profiles.${col}`, e.status >= 400, `${e.status}`);
  }

  for (const t of ['shipping_addresses', 'payout_methods', 'verifications', 'user_devices', 'saved_searches', 'orders', 'offers', 'transactions', 'conversations', 'user_contact_hashes', 'account_deletion_requests', 'rate_limit_events', 'waitlist']) {
    const res = await call(`/rest/v1/${t}?select=*&limit=50`, { token: aTok });
    const rows = Array.isArray(res.json) ? res.json : [];
    const foreign = rows.filter((x) => [x.user_id, x.buyer_id, x.seller_id].filter(Boolean).every((u) => u !== aId));
    check(`A sees no foreign rows in ${t}`, foreign.length === 0, `${res.status}, ${rows.length} rows, ${foreign.length} foreign`);
  }

  for (const fn of ['admin_get_users', 'admin_get_verifications', 'admin_get_support_conversations']) {
    const res = await call(`/rest/v1/rpc/${fn}`, { method: 'POST', token: aTok, body: {} });
    check(`non-admin cannot call ${fn}`, res.status >= 400 || (Array.isArray(res.json) && res.json.length === 0), `${res.status}`);
  }
  const sa = await call('/rest/v1/rpc/set_admin_user', { method: 'POST', token: aTok, body: { target_user_id: aId, make_admin: true } });
  check('non-admin cannot call set_admin_user', sa.status >= 400, `${sa.status}`);

  const ins = await call('/rest/v1/verifications', {
    method: 'POST', token: aTok, body: { user_id: aId, status: 'approved' }, headers: { Prefer: 'return=representation' },
  });
  check('A cannot self-approve KYC verification', ins.status >= 400 || ins.json?.[0]?.status !== 'approved', `${ins.status}`);

  const sl = await call('/rest/v1/rpc/ensure_save_lists', { method: 'POST', token: aTok, body: { p_user_id: bId } });
  check('ensure_save_lists rejects foreign p_user_id', sl.status >= 400, `${sl.status}`);
}

// ── C/E. logout, refresh rotation, password change ──────────────────────────
{
  // Refresh-token rotation + replay. GoTrue deliberately answers a replay of the
  // direct parent of a still-unused token with that same token (lost-response
  // recovery), so the attack that matters is replaying a token the legitimate
  // client has already rotated past.
  const s = await login(A);
  const rt0 = s.json.refresh_token;
  const r1 = await refresh(rt0);
  check('refresh rotates the token', r1.status === 200 && r1.json.refresh_token !== rt0);
  const r2 = await refresh(r1.json.refresh_token);
  await sleep(11_000); // past GoTrue's 10s reuse interval
  const replay = await refresh(rt0);
  check('stale refresh token cannot be replayed', replay.status >= 400, `${replay.status} ${replay.json?.error_code ?? ''}`);
  const live = await refresh(r2.json.refresh_token);
  console.log(`INFO  current token after a detected replay: ${live.status} (200 = GoTrue did not revoke the family)`);

  // Concurrent refresh with the same token: none should mint >1 lineage that survives.
  const c = await login(A);
  const par = await Promise.all([1, 2, 3, 4, 5].map(() => refresh(c.json.refresh_token)));
  check('concurrent refresh does not 500', par.every((p) => p.status < 500), par.map((p) => p.status).join(','));

  // Logout (what the app does: scope=local) revokes this session server-side.
  const l = await login(A);
  const out = await call('/auth/v1/logout?scope=local', { method: 'POST', token: l.json.access_token });
  check('logout endpoint succeeds', out.status === 204, `${out.status}`);
  const after = await refresh(l.json.refresh_token);
  check('refresh token dead after logout', after.status >= 400, `${after.status}`);
  const who = await call('/auth/v1/user', { token: l.json.access_token });
  check('Auth rejects access token of a logged-out session', who.status >= 400, `${who.status}`);

  // Authenticated password change.
  const other = await login(A);
  const me = await login(A);
  const NEWPW = `${PW}x`;
  const ch = await call('/auth/v1/user', { method: 'PUT', token: me.json.access_token, body: { password: NEWPW } });
  const reauthRequired = ch.status >= 400 && /reauth/i.test(ch.text);
  console.log(`INFO  password change without current password/nonce: ${ch.status} ${ch.json?.error_code ?? ''}`);
  if (ch.status === 200) {
    const oth = await refresh(other.json.refresh_token);
    check('password change revokes other sessions', oth.status >= 400, `${oth.status}`);
    const back = await call('/auth/v1/user', { method: 'PUT', token: me.json.access_token, body: { password: PW } });
    if (back.status !== 200) console.error('!! could not restore test password', back.status);
  } else {
    check('password change requires reauthentication', reauthRequired, `${ch.status}`);
  }
}

// ── D. brute force ──────────────────────────────────────────────────────────
if (process.argv.includes('--rate-limit')) {
  const statuses = [];
  for (let i = 0; i < 40; i++) {
    const r = await login(B, `wrong-${i}-xxxxxxxx`);
    statuses.push(r.status);
    if (r.status === 429) break;
  }
  check('password guessing hits 429 within 40 attempts', statuses.includes(429),
    `${statuses.length} attempts, last=${statuses.at(-1)}`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
