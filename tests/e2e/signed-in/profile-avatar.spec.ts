// Picking a banner on WEB must mark the form dirty.
//
// Regression guard: expo-image-picker returns `URL.createObjectURL(file)` on
// web — a `blob:` URI. The edit screen's "is this a newly picked image" check
// originally recognised only file:/content:/data:, so on web a picked photo
// never counted as a change: the save CTA stayed disabled and the upload branch
// never ran. Avatars were silently broken on web the same way.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

// Smallest valid PNG (1x1, transparent).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Profile banner picker (web)', () => {
  test('picking a banner enables Save', async ({ page }) => {
    await page.goto('/profile/edit');
    await waitForAppReady(page);

    const save = page.getByText('All saved', { exact: true });
    await expect(save).toBeVisible({ timeout: 20_000 });

    // expo-image-picker clicks a hidden <input type="file"> on web, which the
    // browser surfaces as a file chooser.
    const chooser = page.waitForEvent('filechooser');
    // Regex, not the placeholder copy: the control reads "Add a profile banner"
    // on an account with no banner and "Change profile banner" once one is set.
    await page.getByLabel(/profile banner/i).click();
    await (await chooser).setFiles({
      name: 'banner.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    // Web has no OS crop UI, so the pick routes through our own cropper.
    await expect(page.getByText('Position your banner', { exact: true })).toBeVisible();
    await page.getByText('Use photo', { exact: true }).click();

    // The CTA flips out of its "nothing to save" state once the crop registers.
    await expect(page.getByText('Save changes', { exact: true })).toBeVisible();
  });

  test('the cropper can be dismissed without changing anything', async ({ page }) => {
    await page.goto('/profile/edit');
    await waitForAppReady(page);
    await expect(page.getByText('All saved', { exact: true })).toBeVisible({ timeout: 20_000 });

    const chooser = page.waitForEvent('filechooser');
    // Regex, not the placeholder copy: the control reads "Add a profile banner"
    // on an account with no banner and "Change profile banner" once one is set.
    await page.getByLabel(/profile banner/i).click();
    await (await chooser).setFiles({
      name: 'banner.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    await expect(page.getByText('Position your banner', { exact: true })).toBeVisible();
    await page.getByLabel('Close').click();

    await expect(page.getByText('Position your banner', { exact: true })).toBeHidden();
    // Backing out of the cropper must not count as an edit.
    await expect(page.getByText('All saved', { exact: true })).toBeVisible();
  });
});
