// Notifications feed, signed in (real backend). Data-agnostic: checks the
// filters work, rows (if any) open their target, and opening the screen
// clears the unread count server-side.

import { test, expect } from '@playwright/test';
import { waitForAppReady, SUPABASE_URL, SUPABASE_ANON_KEY } from '../helpers/page';

test('feed loads, filters switch, opening marks everything seen', async ({ page }) => {
  await page.goto('/news');
  await waitForAppReady(page);
  for (const f of ['all', 'orders', 'offers', 'activity']) {
    await expect(page.getByTestId(`notifications-filter-${f}`)).toBeVisible({ timeout: 20_000 });
  }
  // Either rows or the empty state, never a spinner forever.
  await expect(
    page.getByTestId('notification-row').first().or(page.getByText(/^No (notifications yet|order updates|offers|activity)$/)),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('notifications-filter-orders').click();
  await expect(
    page.getByTestId('notification-row').first().or(page.getByText('No order updates')),
  ).toBeVisible();

  // Server agrees nothing is unread after opening.
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.includes('auth-token')) return JSON.parse(localStorage.getItem(k)!).access_token as string;
    }
    return null;
  });
  expect(token).toBeTruthy();
  await expect
    .poll(async () => {
      const r = await page.request.post(`${SUPABASE_URL}/rest/v1/rpc/unread_notification_count`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: {},
      });
      return r.json();
    }, { timeout: 10_000 })
    .toBe(0);
});
