// /(tabs)/profile while signed in: the @handle / stats / tabs render and
// the Selling / Liked / Collections tabs hydrate without throwing. We do NOT
// mutate the account in any way.

import { test, expect } from '@playwright/test';
import { waitForAppReady, PRICE_PATTERN } from '../helpers/page';

test.describe('Profile tab (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile');
    await waitForAppReady(page);
  });

  test('renders @handle, the stats (Following, Followers, Likes) and the three tabs', async ({ page }) => {
    await expect(page.locator('text=/^@[\\w.]+$/').first()).toBeVisible({ timeout: 20_000 });
    for (const stat of ['Following', 'Followers', 'Likes']) {
      await expect(page.getByText(new RegExp(`^\\d+ ${stat}$|^${stat}$`)).first()).toBeVisible();
    }
    for (const tab of ['Selling', 'Liked', 'Collections']) {
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    }
    // Selling's status chips (All / Available / Sold with counts).
    await expect(page.getByText(/^Available \(\d+\)$/)).toBeVisible();
  });

  test('Liked tab renders either its grid or the empty state', async ({ page }) => {
    await page.getByRole('tab', { name: 'Liked', exact: true }).click();
    await expect(
      page.locator(`text=/${PRICE_PATTERN}|No liked items/`).first(),
    ).toBeVisible();
  });

  test('Collections tab shows its list chips and a grid or empty state', async ({ page }) => {
    await page.getByRole('tab', { name: 'Collections', exact: true }).click();
    await expect(page.getByText(/^All \(\d+\)$/).first()).toBeVisible();
    await expect(
      page.locator(`text=/${PRICE_PATTERN}|No saved items yet|This list is empty/`).first(),
    ).toBeVisible();
  });

  test('Edit profile button routes to /profile/edit', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit profile', exact: true }).first().click();
    await page.waitForURL(/profile\/edit/);
    await expect(page.getByText(/^edit profile$/i).first()).toBeVisible();
  });
});
