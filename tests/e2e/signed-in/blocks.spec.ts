// Real backend: blocks a seller through the UI, checks the settings list, unblocks.
// Server-side enforcement is covered by tests/adversarial/blocks_and_launch_guards.sql.

import { test, expect, waitForAppReady, fetchAnyLiveListing } from '../helpers/page';

test.describe('Blocking', () => {
  test('block from a profile, see it in settings, unblock', async ({ page }) => {
    const listing = await fetchAnyLiveListing(page.request);
    test.skip(!listing, 'no live listing to get a seller from');
    const sellerId = (listing as any).seller_id as string;

    page.on('dialog', (d) => d.accept());

    await page.goto(`/user/${sellerId}`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByText('Block user', { exact: true }).click();

    // Wordless success: the animation appears, and no toast text does.
    await expect(page.getByTestId('done-animation')).toBeVisible();
    await expect(page.getByText(/^Blocked /)).toHaveCount(0);
    await expect(page.getByTestId('done-animation')).toHaveCount(0); // ends by itself

    await page.goto('/blocked');
    await waitForAppReady(page);
    const unblock = page.getByTestId(`unblock-${sellerId}`);
    await expect(unblock).toBeVisible({ timeout: 20_000 });

    // A blocked profile offers Unblock rather than Follow / Message.
    await page.goto(`/user/${sellerId}`);
    await waitForAppReady(page);
    await expect(page.getByTestId('profile-unblock')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Message seller' })).toHaveCount(0);
    // ...and their listings are gone.
    await expect(page.getByText((listing as any).title, { exact: true })).toHaveCount(0);

    await page.goto('/blocked');
    await waitForAppReady(page);
    await unblock.click();
    await expect(page.getByTestId('done-animation')).toBeVisible();
    await expect(unblock).toHaveCount(0, { timeout: 15_000 });
  });

  test('report offers every reason on web, not just the first', async ({ page }) => {
    const listing = await fetchAnyLiveListing(page.request);
    test.skip(!listing, 'no live listing to get a seller from');

    await page.goto(`/user/${(listing as any).seller_id}`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByText('Report user', { exact: true }).click();

    const dialog = page.getByRole('dialog', { name: /^Report / });
    await expect(dialog).toBeVisible();
    expect(await dialog.getByRole('button').count()).toBeGreaterThan(2);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
