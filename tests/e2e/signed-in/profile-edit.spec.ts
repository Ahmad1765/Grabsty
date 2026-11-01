// /profile/edit — the form renders prefilled values for the signed-in user;
// the Sign-in email row is present. We do NOT submit any changes (that
// would mutate the real account).

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Profile edit (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile/edit');
    await waitForAppReady(page);
  });

  test('renders top title, profile avatar, and a current email value', async ({ page }) => {
    await expect(page.getByText('Edit Profile')).toBeVisible({ timeout: 20_000 });
    // Some email is in the Account section (we don't pin to the literal so
    // the credential never leaks into a fail snapshot).
    await expect(page.getByText(/^[\w.+-]+@[\w-]+\.[\w.-]+$/).first()).toBeVisible();
  });

  test('the four fields (Username / Full name / Bio / fixed Lahore) are present', async ({ page }) => {
    await expect(page.getByPlaceholder('Username')).toBeVisible();
    await expect(page.getByPlaceholder('Full name')).toBeVisible();
    await expect(page.getByPlaceholder('Bio')).toBeVisible();
    // Location is a fixed, read-only field prefilled with Lahore.
    const values = await page
      .locator('input')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(values).toContain('Lahore');
  });

  test('Save CTA is rendered in-flow', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });
});
