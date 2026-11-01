// Sell form (components/sell/SellSheet.tsx) — for a signed-in user, tapping
// Sell opens it as a full-screen Modal over whatever screen is active.
// openSellSheet() lands on Home and taps Sell, like a real user. (/upload
// also still opens it, as a fallback route.)
// The flow is a single continuous scroll (Photos → About your item → Item
// details → Pricing & Shipping) with row pickers, not a multi-step wizard.
//
// The Upload CTA is deliberately NOT disabled while incomplete: it stays
// tappable and toasts the first missing requirement ("Add a title",
// "Choose a category", …) so the seller learns why. Specs assert that.
// We never complete a publish — no real listings are inserted.

import { test, expect, openSellSheet, homeSearch } from '../helpers/page';
import type { Page } from '@playwright/test';

async function addPhoto(page: Page) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload photos' }).click(),
  ]);
  await chooser.setFiles('tests/e2e/fixtures/portrait.jpg');
  await expect(page.getByText('COVER', { exact: true })).toBeVisible({ timeout: 20_000 });
}

/** Tap Upload and expect the toast naming the first missing requirement. */
async function expectBlockedBy(page: Page, reason: string) {
  await page.getByRole('button', { name: 'Upload listing' }).click();
  await expect(page.getByText(reason, { exact: true }).last()).toBeVisible();
}

test.describe('Upload listing (signed in)', () => {
  test('the old /upload tab route opens the same sell sheet as a fallback', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });
  });

  test('sell form renders every section as one scroll, and Upload explains what is missing', async ({ page }) => {
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText('Photos', { exact: true })).toBeVisible();
    await expect(page.getByText('Select photos', { exact: true })).toBeVisible();

    await expect(page.getByText('About your item')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Vintage denim jacket')).toBeVisible();
    await expect(page.getByPlaceholder(/^Describe fit, condition/)).toBeVisible();

    await expect(page.getByText('Item details')).toBeVisible();
    for (const row of ['Category', 'Brand', 'Size', 'Condition', 'Color', 'Gender']) {
      await expect(page.getByText(row, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    }
    // Material was removed from the form (2026-07-27) so it must NOT be here.
    await expect(page.getByText('Material (recommended)')).toHaveCount(0);

    await expect(page.getByText('Pricing & Shipping', { exact: true })).toBeVisible();
    await expect(page.getByText('Parcel size', { exact: true })).toBeVisible();
    await expect(page.getByText(/The buyer pays for shipping/)).toBeVisible();

    await expectBlockedBy(page, 'Add at least one photo');
  });

  test('Category stays unset until a subcategory is actually picked', async ({ page }) => {
    // Regression test: Clothing requires a subcategory before canPublish is
    // true, but the row used to show "Clothing" regardless — looking
    // already-set — so sellers filled in everything else and Upload silently
    // refused with no visible reason.
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    await addPhoto(page);
    await page.getByPlaceholder('e.g. Vintage denim jacket').fill('Vintage denim jacket');

    // Nothing picked yet — the row says so, and Upload names the category.
    await expect(page.getByText('Select category', { exact: true })).toBeVisible();
    await expectBlockedBy(page, 'Choose a category');

    await page.getByText('Select category', { exact: true }).click();
    await page.getByText('Clothing', { exact: true }).last().click();
    await expect(page.getByText('Choose sub-category')).toBeVisible();
    await page.getByText('Jeans', { exact: true }).last().click();

    // The row reflects the real pick and the blocker moves on to the next field.
    await expect(page.getByText('Select category', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Jeans', { exact: true }).first()).toBeVisible();
    await expectBlockedBy(page, 'Choose the condition');
  });

  test('the X button closes the sheet back to the screen underneath', async ({ page }) => {
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    await page.getByLabel('Close').click();
    await expect(page.getByText('Sell an item')).toHaveCount(0);
    await expect(homeSearch(page)).toBeVisible();
  });
});
