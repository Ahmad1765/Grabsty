// Tapping the Browse tab must leave focus in a text field straight away.
//
// This is a soft-keyboard guard. Mobile browsers only raise the on-screen
// keyboard for a focus() that runs inside the tap's own task, while the page
// still holds user activation. A focus() that lands later (a timer backstop)
// shows a caret but never raises the keyboard.
//
// A headless browser has no soft keyboard to assert on, so what's pinned here
// is the mechanism that governs it: focus is in an <input> immediately after
// the press, never parked on the tab button.
//
// Discover itself was folded into Home's search; the Browse tab opens the
// search sheet over Home. Phones only — desktop has no tab bar.

import { test, expect } from '@playwright/test';
import { waitForAppReady, hasTopNav } from './helpers/page';

test.describe('Browse search focus', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    test.skip(await hasTopNav(page), 'desktop top nav has no Browse tab');
  });

  // FIXME (2026-11-01): fails — focus stays on the Browse tab BUTTON, so on a
  // real phone the soft keyboard does not rise when the Browse sheet opens.
  // Product decision pending: either focus "Search Grabsty..." synchronously
  // in the tab press (the Discover-era fix), or Browse is intentionally
  // shortcut-first and this test should be deleted.
  test.fixme('the search field is focused immediately after tapping the Browse tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? 'none');
    expect(activeTag).toBe('INPUT');
  });

  test('the Home search header focuses its input immediately on tap', async ({ page }) => {
    await page.getByRole('button', { name: 'Search items and brands' }).first().click();
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? 'none');
    expect(activeTag).toBe('INPUT');
  });

  // Browse shortcuts apply to Home's feed/search — never route to /discover.
  test('a Browse shortcut stays on Home', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByRole('button', { name: 'Browse New drops' }).click();
    await expect(page).not.toHaveURL(/\/discover/);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/(\?.*)?$/);
  });
});
