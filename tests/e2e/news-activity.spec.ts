// Notifications screen (/news), signed out: header + sign-in prompt.
// The signed-in feed is covered in signed-in/notifications.spec.ts.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Notifications (/news) signed out', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/news');
    await waitForAppReady(page);
  });

  test('renders the header and the sign-in prompt', async ({ page }) => {
    await expect(page.getByText('Notifications', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Sign in to see notifications')).toBeVisible();
  });

  test('Sign in CTA routes to the auth flow', async ({ page }) => {
    await page.getByText('Sign in', { exact: true }).last().click();
    await page.waitForURL(/auth\/login|sign-in/);
  });
});
