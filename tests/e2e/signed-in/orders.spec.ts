// Order history. /orders now redirects into the Activity screen's Orders tab
// (/chat?tab=orders), which carries the Purchases / Selling segmented toggle
// above the status filter chips (AGENTS.md: Activity Screen invariant).
//
// The fixture account's order count isn't fixed, so every assertion below
// accepts either populated rows or the empty state.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

const ROWS_OR_EMPTY = /Rs [\d,]+|No orders in progress|No orders/;

test.describe('Order history (signed in)', () => {
  test('/orders lands on the Orders tab with both sides and the status chips', async ({ page }) => {
    await page.goto('/orders');
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/chat\?tab=orders/);

    await expect(page.getByText(/^Purchases \(\d+\)$/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Selling \(\d+\)$/).first()).toBeVisible();
    for (const chip of ['In Progress', 'Completed', 'Refunds', 'Canceled']) {
      await expect(page.getByRole('button', { name: chip, exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(ROWS_OR_EMPTY).first()).toBeVisible();
  });

  test('the Selling side is reachable and never renders blank', async ({ page }) => {
    await page.goto('/orders');
    await waitForAppReady(page);
    await page.getByText(/^Selling \(\d+\)$/).first().click();
    await expect(page.getByText(ROWS_OR_EMPTY).first()).toBeVisible();
  });

  test('?side=sold deep-links without a blank screen', async ({ page }) => {
    await page.goto('/orders?side=sold');
    await waitForAppReady(page);
    await expect(page.getByText(ROWS_OR_EMPTY).first()).toBeVisible({ timeout: 20_000 });
  });

  test('Settings → Purchases & Sales → View orders opens it', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);
    await page.getByText('Purchases & Sales', { exact: true }).first().click();
    await page.getByText('View orders', { exact: true }).click();
    await expect(page).toHaveURL(/\/(orders|chat\?tab=orders)/);
  });
});
