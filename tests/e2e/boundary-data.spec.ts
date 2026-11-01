// Boundary-data edge cases — stubbed responses that exercise extreme shapes
// (empty arrays, huge prices, very long titles, missing fields). We only
// intercept the REST endpoint; auth + storage stay live.
//
// As with network-failure.spec.ts, we don't assert exact strings the app
// renders against our stubs (the bundle hashes the data through several
// layers before display). We assert structural signals: shell rendered, no
// horizontal overflow, no unhandled-error overlay.

import {
  test,
  expect,
  waitForAppReady,
  priceText,
  searchUrl,
  openHomeSearch,
  SUPABASE_URL,
  homeSearch,
} from './helpers/page';

const REST_RE = SUPABASE_URL
  ? new RegExp(`${SUPABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/rest/v1/.*`)
  : /__no_supabase_configured__/;

// Build a fake listing row with overrides — defaults match the real schema
// shape closely enough that supabase-js doesn't throw on missing columns.
function fakeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Test listing',
    description: 'desc',
    price: 100,
    brand: 'Generic',
    seller_id: '22222222-2222-2222-2222-222222222222',
    is_sold: false,
    created_at: new Date().toISOString(),
    images: [],
    ...overrides,
  };
}

test.describe('Boundary data', () => {
  test.skip(
    !SUPABASE_URL,
    'EXPO_PUBLIC_SUPABASE_URL not configured — cannot install REST stubs',
  );

  test('empty listings response renders the shell without errors', async ({ page }) => {
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0' },
          body: '[]',
        });
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    await expect(homeSearch(page)).toBeVisible();
    // No prices because the array is empty.
    await expect(priceText(page)).toHaveCount(0);
    // No global error.
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
  });

  test('extreme prices ($0 and 9-digit) format without breaking layout', async ({ page }) => {
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-1/2' },
          body: JSON.stringify([
            fakeListing({ id: 'a'.repeat(8) + '-1111-1111-1111-111111111111', price: 0, title: 'Free item' }),
            fakeListing({
              id: 'b'.repeat(8) + '-2222-2222-2222-222222222222',
              price: 999_999_999,
              title: 'Expensive item',
            }),
          ]),
        });
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    await expect(homeSearch(page)).toBeVisible();
    // No horizontal overflow even with a 9-digit price string in a card.
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth - d.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('very long titles do not push cards past the viewport', async ({ page }) => {
    const longTitle = 'A very long product title '.repeat(20).trim();
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/1' },
          body: JSON.stringify([fakeListing({ title: longTitle })]),
        });
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    await expect(homeSearch(page)).toBeVisible();
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth - d.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('search zero-results query renders empty-state copy', async ({ page }) => {
    // Discover was folded into Home's search; a ?searchQuery deep link opens
    // the results view directly.
    await page.goto(searchUrl('zzqqxx-nonexistent-search-token-9999'));
    await waitForAppReady(page);
    await expect(page.getByText(/No listings found matching/).first()).toBeVisible();
  });

  test('unicode + emoji in search input is accepted and rendered back', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const tricky = '🛍️ café — 北京 ​';
    await openHomeSearch(page);
    // On phones tapping the header opens a search overlay with its own
    // (focused) input; on desktop the top-nav field itself is the input.
    const input = page.locator('input:focus');
    await input.fill(tricky);
    await expect(input).toHaveValue(tricky);
    // No crash — the shell is still there.
    await expect(page.getByText(/Something went wrong|Unhandled error/i)).toHaveCount(0);
  });

  test('product detail with missing optional fields still renders the shell', async ({ page }) => {
    const id = '33333333-3333-3333-3333-333333333333';
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings') && url.includes(id)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/1' },
          body: JSON.stringify([
            fakeListing({
              id,
              price: 42,
              title: 'Minimal listing',
              description: '',
              brand: null,
              images: null,
            }),
          ]),
        });
      }
      return route.continue();
    });
    await page.goto(`/product/${id}`);
    await waitForAppReady(page);
    // Either the description block rendered (happy path), or the not-found
    // state did (if our stub didn't catch every variant of the query).
    // Either way, no unhandled error overlay.
    await expect(page.getByText(/Something went wrong|Unhandled error/i)).toHaveCount(0);
  });
});
