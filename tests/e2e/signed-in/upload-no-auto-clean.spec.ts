// Sell form — background removal (auto-clean) is a Wardrobe-only feature and
// must NOT run on the listing upload flow. This guards against it regressing
// back: after a photo is added the tile shows no Cleaning…/CLEANED/ORIGINAL
// control, and the picked photo is used exactly as-is.

import { test, expect, openSellSheet } from '../helpers/page';
import * as path from 'node:path';

test.describe('Upload has no auto-clean (signed in)', () => {
  test('added photo is used as-is with no cleaning UI', async ({ page }) => {
    // 1. Open the sell sheet (a Modal, not a route — see openSellSheet()).
    await openSellSheet(page);
    await expect(page.getByText('Sell an item')).toBeVisible({ timeout: 20_000 });

    // 2. Drive the picker. expo-image-picker's web implementation builds its
    //    <input type="file"> on demand inside launchImageLibraryAsync and
    //    clicks it — there is no input in the DOM beforehand, so locating one
    //    up front never resolves. Catch the native file chooser instead.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Upload photos' }).click(),
    ]);
    await chooser.setFiles(path.resolve(process.cwd(), 'tests/e2e/fixtures/portrait.jpg'));

    // 3. The photo lands — the first tile gets the COVER badge.
    await expect(page.getByText('COVER', { exact: true })).toBeVisible({ timeout: 20_000 });

    // 4. No background-removal control should ever surface on the upload flow.
    await expect(page.getByText(/Cleaning…|CLEANED|ORIGINAL/)).toHaveCount(0);
  });
});
