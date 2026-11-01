// Owner-only actions on /product/<id> — "Edit listing" + "Delete listing". We use a hardcoded mocked listing fixture so the test runs deterministically
// in CI and doesn't rely on live Supabase endpoint configuration.
// If the account has no valid session the test skips.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readUserIdFromStorage(): string | null {
  const storagePath = path.resolve(process.cwd(), 'playwright/.auth/user.json');
  if (!fs.existsSync(storagePath)) return null;
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  } catch (err) {
    console.warn(`[readUserIdFromStorage] Failed to parse auth storage at ${storagePath}`, err);
    return null;
  }
  for (const origin of raw.origins ?? []) {
    for (const kv of origin.localStorage ?? []) {
      if (!kv.name.startsWith('sb-') || !kv.name.endsWith('-auth-token')) continue;
      try {
        const parsed = JSON.parse(kv.value) as { user?: { id?: string } };
        if (parsed.user?.id) return parsed.user.id;
      } catch (error) {
        console.warn(`[readUserIdFromStorage] Failed to parse JSON for key "${kv.name}" in ${storagePath}:`, error);
      }
    }
  }
  return null;
}

const MOCK_LISTING_ID = 'mock-listing-123';

test.describe('Product owner actions (signed in)', () => {
  test('owner sees the Edit and Delete CTAs (no destructive click)', async ({ page }) => {
    const userId = readUserIdFromStorage();
    test.skip(!userId, 'no user id in storage state — auth setup did not save a session');

    const fixtureListing = {
      id: MOCK_LISTING_ID,
      seller_id: userId,
      is_sold: false,
      title: 'Mock Owned Listing',
      price: 123,
      created_at: new Date().toISOString(),
      images: ['https://placehold.co/400x400/eeeeee/cccccc.png?text=Mock+Image'],
      size: 'M',
      category: 'clothing',
      condition: 'new_with_tags',
      likes: 0,
      seller: {
        id: userId,
        username: 'mockowner',
      }
    };

    await page.route('**/rest/v1/listings*', async (route) => {
      const url = route.request().url();
      if (url.includes(`id=eq.${MOCK_LISTING_ID}`)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([fixtureListing]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/product/${MOCK_LISTING_ID}`);
    await waitForAppReady(page);

    // Sold state is order-driven now (checkout marks sold, refund relists), so
    // there is no manual Mark-as-sold toggle — the owner gets Edit + Delete.
    await expect(page.getByText('Edit listing', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Delete listing' })).toBeVisible();
    await expect(page.getByText('Mark as sold')).toHaveCount(0);
    // Confirm the legacy "Follow / Message" CTAs are NOT shown for the owner.
    await expect(page.getByText('Message', { exact: true })).toHaveCount(0);
  });
});
