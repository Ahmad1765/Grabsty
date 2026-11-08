import { test, expect, gotoRoute, waitForAppReady, scrollFeedToBottom, priceText } from './helpers/page';

test.describe('iPhone Product Card Slider', () => {
  test('swiping the card carousel does not navigate away to product detail page', async ({ page }) => {
    await gotoRoute(page, '/');
    await waitForAppReady(page);
    await scrollFeedToBottom(page);

    await expect(priceText(page).first()).toBeVisible({ timeout: 15_000 });
    const card = page.getByTestId('listing-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    const carousel = page.getByTestId('listing-card-carousel').first();
    // Live data: carousels only render for multi-photo listings.
    test.skip((await carousel.count()) === 0, 'no multi-photo listing in the live feed');
    await expect(carousel).toBeVisible({ timeout: 10_000 });
    const box = await carousel.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width * 0.8;
    const startY = box.y + box.height * 0.5;
    const endX = box.x + box.width * 0.2;
    const endY = startY;

    const initialUrl = page.url();

    // Trigger touchstart, touchmove, touchend + synthetic click as iOS Safari does
    await page.evaluate(
      ({ sX, sY, eX, eY }) => {
        const el = document.elementFromPoint(sX, sY);
        if (!el) return;

        const touchObjStart = new Touch({
          identifier: 1,
          target: el,
          clientX: sX,
          clientY: sY,
          pageX: sX,
          pageY: sY,
        });

        el.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [touchObjStart],
            targetTouches: [touchObjStart],
            changedTouches: [touchObjStart],
            bubbles: true,
            cancelable: true,
          }),
        );

        const touchObjMove = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [touchObjMove],
            targetTouches: [touchObjMove],
            changedTouches: [touchObjMove],
            bubbles: true,
            cancelable: true,
          }),
        );

        const touchObjEnd = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchend', {
            touches: [],
            targetTouches: [],
            changedTouches: [touchObjEnd],
            bubbles: true,
            cancelable: true,
          }),
        );

        // In mobile browsers (Safari/Chrome), a synthetic click is then dispatched
        el.dispatchEvent(
          new MouseEvent('click', {
            clientX: sX,
            clientY: sY,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { sX: startX, sY: startY, eX: endX, eY: endY },
    );

    // Wait 500ms to verify navigation did not trigger
    await page.waitForTimeout(500);
    expect(page.url()).toBe(initialUrl);
  });

  test('tapping a card without swiping navigates to product detail page', async ({ page }) => {
    await gotoRoute(page, '/');
    await waitForAppReady(page);
    await scrollFeedToBottom(page);

    await expect(priceText(page).first()).toBeVisible({ timeout: 15_000 });
    const card = page.getByTestId('listing-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.click();
    await page.waitForURL(/\/product\/[\w-]+/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/product\/[\w-]+/);
  });

  test('swiping card carousel advances to next image without resetting to first image', async ({ page }) => {
    await gotoRoute(page, '/');
    await waitForAppReady(page);
    await expect(priceText(page).first()).toBeVisible({ timeout: 15_000 });

    const carousel = page.getByTestId('listing-card-carousel').first();
    // Live data: carousels only render for multi-photo listings.
    test.skip((await carousel.count()) === 0, 'no multi-photo listing in the live feed');
    const count = await carousel.count();
    if (count === 0) return;

    await carousel.scrollIntoViewIfNeeded();
    await expect(carousel).toBeVisible({ timeout: 10_000 });
    const box = await carousel.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width * 0.8;
    const startY = box.y + box.height * 0.5;
    const endX = box.x + box.width * 0.2;
    const endY = startY;

    // Perform swipe via touch events with realistic step intervals
    await carousel.evaluate(
      async (carouselEl, { sX, sY, eX, eY }) => {
        const el = document.elementFromPoint(sX, sY) || carouselEl;
        const touchStart = new Touch({
          identifier: 1,
          target: el,
          clientX: sX,
          clientY: sY,
          pageX: sX,
          pageY: sY,
        });

        el.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [touchStart],
            targetTouches: [touchStart],
            changedTouches: [touchStart],
            bubbles: true,
            cancelable: true,
          }),
        );

        await new Promise((r) => setTimeout(r, 60));

        const touchMove = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [touchMove],
            targetTouches: [touchMove],
            changedTouches: [touchMove],
            bubbles: true,
            cancelable: true,
          }),
        );

        await new Promise((r) => setTimeout(r, 60));

        const touchEnd = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchend', {
            touches: [],
            targetTouches: [],
            changedTouches: [touchEnd],
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { sX: startX, sY: startY, eX: endX, eY: endY },
    );

    // Wait for smooth transition
    await page.waitForTimeout(600);

    // Verify card scrollLeft advanced past 0 (to the second photo)
    const scrollInfo = await carousel.evaluate((el) => {
      const all = Array.from(el.querySelectorAll('*')).map((node, i) => ({
        i,
        tag: node.tagName,
        className: (node as HTMLElement).className,
        scrollLeft: (node as HTMLElement).scrollLeft,
        scrollWidth: (node as HTMLElement).scrollWidth,
        clientWidth: (node as HTMLElement).clientWidth,
      }));
      return all.filter((n) => n.scrollWidth > n.clientWidth || n.scrollLeft > 0);
    });

    const maxScrollLeft = Math.max(0, ...scrollInfo.map((s) => s.scrollLeft));
    expect(maxScrollLeft).toBeGreaterThan(0);
  });

  test('swiping product detail hero carousel advances to next photo without resetting', async ({ page }) => {
    await gotoRoute(page, '/');
    await waitForAppReady(page);
    await expect(priceText(page).first()).toBeVisible({ timeout: 15_000 });

    const card = page.getByTestId('listing-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();
    await page.waitForURL(/\/product\/[\w-]+/, { timeout: 15_000 });

    const photoButtons = page.getByRole('button', { name: 'View full photo' });
    await expect(photoButtons.first()).toBeVisible({ timeout: 15_000 });

    const photoCount = await photoButtons.count();
    if (photoCount <= 1) {
      // Single photo product; swipe advance is a no-op
      return;
    }

    const firstPhoto = photoButtons.first();
    const box = await firstPhoto.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width * 0.8;
    const startY = box.y + box.height * 0.5;
    const endX = box.x + box.width * 0.2;
    const endY = startY;

    const heroCarousel = page.getByTestId('product-hero-carousel');
    await heroCarousel.evaluate(
      async (carouselEl, { sX, sY, eX, eY }) => {
        const el = document.elementFromPoint(sX, sY) || carouselEl;

        const touchStart = new Touch({
          identifier: 1,
          target: el,
          clientX: sX,
          clientY: sY,
          pageX: sX,
          pageY: sY,
        });

        el.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [touchStart],
            targetTouches: [touchStart],
            changedTouches: [touchStart],
            bubbles: true,
            cancelable: true,
          }),
        );

        await new Promise((r) => setTimeout(r, 60));

        const touchMove = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [touchMove],
            targetTouches: [touchMove],
            changedTouches: [touchMove],
            bubbles: true,
            cancelable: true,
          }),
        );

        await new Promise((r) => setTimeout(r, 60));

        const touchEnd = new Touch({
          identifier: 1,
          target: el,
          clientX: eX,
          clientY: eY,
          pageX: eX,
          pageY: eY,
        });

        el.dispatchEvent(
          new TouchEvent('touchend', {
            touches: [],
            targetTouches: [],
            changedTouches: [touchEnd],
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { sX: startX, sY: startY, eX: endX, eY: endY },
    );

    await page.waitForTimeout(600);

    const scrollLeft = await heroCarousel.evaluate((el: HTMLElement) => {
      const scrollChild = Array.from(el.querySelectorAll('*')).find(
        (c) => (c as HTMLElement).scrollWidth > (c as HTMLElement).clientWidth,
      );
      return (scrollChild as HTMLElement)?.scrollLeft ?? 0;
    });
    expect(scrollLeft).toBeGreaterThan(0);
  });
});
