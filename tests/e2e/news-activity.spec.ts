// Notifications screen (/news) — All / Buyer / Important filter pills. Signed
// out, it shows the create-account prompt. No backend dependency.

import { test, expect, waitForAppReady } from './helpers/page';

test.describe('Notifications (/news)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/news');
    await waitForAppReady(page);
  });

  test('renders the Notifications header and the three filters', async ({ page }) => {
    await expect(page.getByText('Notifications', { exact: true }).first()).toBeVisible();
    for (const f of ['All', 'Buyer', 'Important']) {
      await expect(page.getByRole('button', { name: `Filter ${f}` })).toBeVisible();
    }
  });

  test('signed-out viewer sees the create-account prompt', async ({ page }) => {
    await expect(page.getByText('Create an account to see notifications')).toBeVisible();
  });

  test('Sign in CTA routes to the auth flow', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page
        .getByText(/Your story[\s\S]*starts now\.|Welcome[\s\S]*back\.|Continue as guest|you@example\.com/i)
        .first(),
    ).toBeVisible();
  });
});
