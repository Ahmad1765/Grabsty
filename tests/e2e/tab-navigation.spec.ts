// Bottom tab bar — every tab routes correctly. We don't require auth here;
// the upload/profile tabs render their RequireAuth gate when unauthenticated,
// which is also a valid destination for "the route works".
//
// Tabs are located by role + accessible name, never by getByText: the tab bar
// is icon-only (AnimatedTabBar renders glyphs and labels, and the label also
// serves as the button's aria-label).

import { test, expect, waitForAppReady, homeSearch, hasTopNav } from './helpers/page';

test.describe('Tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  // Home now renders what used to live at /feed (the personalized feed) —
  // the old search-header Home screen was removed and this became "/".
  test('Home is the default route', async ({ page }) => {
    await expect(homeSearch(page)).toBeVisible();
  });

  test('Activity tab routes to the activity inbox', async ({ page }) => {
    await page.getByRole('button', { name: /Activity|Inbox/i }).click();
    await page.waitForURL(/\/chat/);
    await expect(
      page.getByText(/Activity|Inbox|Sign in to chat|It's quiet here/).first(),
    ).toBeVisible();
  });

  // The Browse tab opens a search sheet over Home; picking a category opens
  // Home's search results filtered to it. Desktop (>=1024px) has no tab bar —
  // its top nav owns category browsing instead.
  test('Browse tab opens the search sheet, which routes on pick', async ({ page }) => {
    test.skip(await hasTopNav(page), 'desktop top nav has no Browse tab');
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page.getByPlaceholder('Search Grabsty...')).toBeVisible();
    await expect(page.getByText('Categories', { exact: true })).toBeVisible();
    // Still on Home — the sheet is an overlay, not a route.
    await expect(page).toHaveURL(/\/(\?.*)?$/);

    await page.getByRole('button', { name: 'Browse Clothing' }).click();
    await page.waitForURL(/searchCategory=clothing/);
  });

  test('Sell tab routes (gate or upload form depending on auth)', async ({ page }) => {
    await page.getByRole('button', { name: 'Sell', exact: true }).first().click();
    await expect(
      page.getByText(/Upload listing|Sign in to sell|Continue as guest/i).first(),
    ).toBeVisible();
  });

  test('Account tab routes (auth gate or profile)', async ({ page }) => {
    await page.getByRole('button', { name: 'Account' }).click();
    await expect(
      page.getByText(/Posts|Continue as guest|Pre-loved fashion,[\s\S]*protected\./i).first(),
    ).toBeVisible();
  });
});
