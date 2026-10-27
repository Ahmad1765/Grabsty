// Pure URL scrubbing for Sentry breadcrumbs/events — no SDK import, so it
// unit-tests in Node (lib/sentryScrub.test.ts).
//
// Two leak paths it closes:
//  - Auth links carry credentials in the query or fragment: password-reset and
//    OAuth land on /auth/reset#access_token=…&refresh_token=… or ?code=….
//  - Supabase REST URLs carry user input in the query string (search is an
//    `.or(title.ilike.*term*)` filter), so their query is dropped entirely.

const SECRET_PARAM = /([?&#])(access_token|refresh_token|provider_token|provider_refresh_token|code|token|token_hash|apikey|api_key)=[^&#\s"']*/gi;

export function redactUrl(url: string): string {
  if (/\.supabase\.co\/(rest|functions|storage)\//.test(url)) return url.split('?')[0];
  return url.replace(SECRET_PARAM, '$1$2=[redacted]');
}

/** Returns a copy of `data` with every string value URL-scrubbed. */
export function redactData<T extends Record<string, unknown> | undefined>(data: T): T {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = typeof v === 'string' ? redactUrl(v) : v;
  return out as T;
}
