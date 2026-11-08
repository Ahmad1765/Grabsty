// /(tabs)/chat — inbox renders the Inbox header, the three tabs (Messages, Orders, Support),
// and within Messages the 4 filter chips (All, Buying, Selling, Socials).

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Inbox (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForAppReady(page);
  });

  test('renders the Inbox header and the three tabs', async ({ page }) => {
    await expect(page.getByText(/^(Activity|Inbox)$/).first()).toBeVisible({ timeout: 20_000 });
    for (const label of ['Messages', 'Orders', 'Support']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('renders the four message filter chips in Messages tab', async ({ page }) => {
    for (const chip of ['All', 'Buying', 'Selling', 'Socials']) {
      await expect(page.getByRole('button', { name: chip }).first()).toBeVisible();
    }
  });

  test('the default tab hydrates its content area', async ({ page }) => {
    await expect(
      page
        .locator(
          "text=/^just now$|^\\d+ (min|hour|day|month|year)s? ago$|No messages yet|No buying chats yet|No buyer chats yet|No social messages yet/",
        )
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('Buying chip filters message list', async ({ page }) => {
    await page.getByRole('button', { name: 'Buying', exact: true }).first().click();
    await expect(
      page.locator('text=/^just now$|^\\d+ (min|hour|day|month|year)s? ago$|No buying chats yet/').first(),
    ).toBeVisible();
  });

  test('Selling chip filters message list', async ({ page }) => {
    await page.getByRole('button', { name: 'Selling', exact: true }).first().click();
    await expect(
      page.locator('text=/^just now$|^\\d+ (min|hour|day|month|year)s? ago$|No buyer chats yet/').first(),
    ).toBeVisible();
  });

  test('Socials chip filters message list', async ({ page }) => {
    await page.getByRole('button', { name: 'Socials', exact: true }).first().click();
    await expect(
      page.locator('text=/^just now$|^\\d+ (min|hour|day|month|year)s? ago$|No social messages yet/').first(),
    ).toBeVisible();
  });
});
