// Picking a profile photo on WEB must register as a new image.
//
// Regression guard: expo-image-picker returns `URL.createObjectURL(file)` on
// web — a `blob:` URI. The edit screen's "is this a newly picked image" check
// (isLocalImage in app/profile/edit.tsx) originally recognised only
// file:/content:/data:, so on web a picked photo never counted as a change and
// the upload branch never ran. (This spec used to cover the banner picker,
// which has since been removed from the edit screen.)
//
// We never press Save — the account is not mutated.

import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

// Smallest valid PNG (1x1, transparent).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Profile photo picker (web)', () => {
  test('picking a photo previews it from a blob: URI', async ({ page }) => {
    await page.goto('/profile/edit');
    await waitForAppReady(page);

    const avatar = page.getByRole('button', { name: 'Change profile picture' });
    await expect(avatar).toBeVisible({ timeout: 20_000 });

    // expo-image-picker clicks a hidden <input type="file"> on web, which the
    // browser surfaces as a file chooser.
    const chooser = page.waitForEvent('filechooser');
    await avatar.click();
    await (await chooser).setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG_1X1 });

    // allowsEditing routes web picks through a crop step on some versions;
    // accept it if it appears.
    const usePhoto = page.getByText(/^(Use photo|Done|Crop)$/);
    if (await usePhoto.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await usePhoto.first().click();
    }

    // The avatar now renders the picked image, not the initial letter.
    await expect(avatar.locator('img').first()).toBeVisible();
  });
});
