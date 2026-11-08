// Saved searches: signed-in flow only (the feature is gated on auth).
//
// The save toggle lives on Home's search results header (HomeSearchView,
// "Save this search" ⇄ "Saved search active"). Each test creates real rows in
// the E2E account's saved_searches table via the UI, verifies them over REST,
// and wipes the account's saved searches before/after to stay clean.

import { test, expect } from '@playwright/test';
import { waitForAppReady, searchUrl, SUPABASE_URL, SUPABASE_ANON_KEY } from '../helpers/page';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readAuthToken(): { token: string; userId: string } | null {
  const storagePath = path.resolve(process.cwd(), 'playwright/.auth/user.json');
  if (!fs.existsSync(storagePath)) return null;
  const raw = JSON.parse(fs.readFileSync(storagePath, 'utf8')) as {
    origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of raw.origins ?? []) {
    for (const kv of origin.localStorage ?? []) {
      if (!kv.name.startsWith('sb-') || !kv.name.endsWith('-auth-token')) continue;
      try {
        const parsed = JSON.parse(kv.value) as {
          access_token?: string;
          user?: { id?: string };
        };
        if (parsed.access_token && parsed.user?.id) {
          return { token: parsed.access_token, userId: parsed.user.id };
        }
      } catch (e) {
        console.warn(`[saved-searches] Ignored invalid token at ${origin.origin} -> ${kv.name}:`, (e as Error)?.message);
      }
    }
  }
  return null;
}

// Direct REST cleanup so we don't depend on the UI delete path.
async function cleanupSavedSearches(token: string, userId: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  await fetch(
    `${SUPABASE_URL}/rest/v1/saved_searches?user_id=eq.${userId}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  ).catch(() => {});
}

async function migrationApplied(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saved_searches?select=id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.ok;
}

async function savedRowsFor(token: string, userId: string, term: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saved_searches?select=id,query&user_id=eq.${userId}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  const rows = (await res.json()) as Array<{ query?: string | null }>;
  return rows.filter((r) => (r.query ?? '').includes(term)).length;
}

test.describe.configure({ mode: 'serial' });

test.describe('Saved searches (signed in)', () => {
  test.beforeEach(async () => {
    const auth = readAuthToken();
    if (auth) await cleanupSavedSearches(auth.token, auth.userId);
  });

  test.afterEach(async () => {
    const auth = readAuthToken();
    if (auth) await cleanupSavedSearches(auth.token, auth.userId);
  });

  test('the Save CTA appears only once a search is submitted', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.getByRole('button', { name: 'Save this search' })).toHaveCount(0);

    await page.goto(searchUrl('nike'));
    await waitForAppReady(page);
    await expect(page.getByRole('button', { name: 'Save this search' }).first()).toBeVisible();
  });

  test('saving a search writes one row and the CTA reflects it after reload', async ({ page }) => {
    const auth = readAuthToken();
    test.skip(!auth, 'no user id in storage state');
    test.skip(!(await migrationApplied(auth!.token)), 'saved_searches table not reachable');

    const term = `e2e-saved-${Date.now().toString(36)}`;
    await page.goto(searchUrl(term));
    await waitForAppReady(page);
    await page.getByRole('button', { name: 'Save this search' }).first().click();
    await expect(page.getByRole('button', { name: 'Saved search active' }).first()).toBeVisible();
    await expect.poll(() => savedRowsFor(auth!.token, auth!.userId, term)).toBe(1);

    // State comes from the DB, not local component state.
    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByRole('button', { name: 'Saved search active' }).first()).toBeVisible();
  });

  test('tapping the active CTA un-saves (toggle, never a duplicate row)', async ({ page }) => {
    const auth = readAuthToken();
    test.skip(!auth, 'no user id in storage state');
    test.skip(!(await migrationApplied(auth!.token)), 'saved_searches table not reachable');

    const term = `e2e-toggle-${Date.now().toString(36)}`;
    await page.goto(searchUrl(term));
    await waitForAppReady(page);
    await page.getByRole('button', { name: 'Save this search' }).first().click();
    await expect.poll(() => savedRowsFor(auth!.token, auth!.userId, term)).toBe(1);

    await page.getByRole('button', { name: 'Saved search active' }).first().click();
    await expect(page.getByRole('button', { name: 'Save this search' }).first()).toBeVisible();
    await expect.poll(() => savedRowsFor(auth!.token, auth!.userId, term)).toBe(0);
  });
});
