// Search (formerly the Discover screen). Discover was folded into Home's
// search — app/(tabs)/discover.tsx now redirects to "/" keeping its query
// params. Structural assertions only: we never type a real brand (we don't
// know what data exists); we type junk and confirm the empty state.

import { test, expect, waitForAppReady, homeSearch, openHomeSearch, searchUrl } from './helpers/page';

test.describe('Search (formerly Discover)', () => {
  test('/discover redirects to Home and keeps its query params', async ({ page }) => {
    await page.goto('/discover?foo=bar');
    await page.waitForURL(/127\.0\.0\.1:\d+\/\?foo=bar$/);
    await expect(homeSearch(page)).toBeVisible();
  });

  test('focusing search opens the landing with popular searches', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await openHomeSearch(page);
    // Both layouts list popular searches (phone overlay: "Popular searches";
    // desktop dropdown: "POPULAR" + category browse).
    await expect(page.getByText(/^Popular( searches)?$/i).first()).toBeVisible();
    await expect(page.getByText('Vintage', { exact: true }).first()).toBeVisible();
  });

  test('a junk query renders the "No listings found" empty state', async ({ page }) => {
    await page.goto(searchUrl('quantumprocessorrandomtokenxyz'));
    await waitForAppReady(page);
    await expect(
      page.getByText('No listings found matching "quantumprocessorrandomtokenxyz"').first(),
    ).toBeVisible();
  });

  test('a category deep link opens filtered results without crashing', async ({ page }) => {
    await page.goto('/?searchOpen=1&searchCategory=bags');
    await waitForAppReady(page);
    await expect(page.getByText('Bags', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
  });

  test('legacy /discover?q= brand link does not crash', async ({ page }) => {
    await page.goto('/discover?q=Khaadi');
    await waitForAppReady(page);
    await page.waitForTimeout(2000);
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
  });
});
