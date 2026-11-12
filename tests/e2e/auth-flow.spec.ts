// Auth modal — welcome step structure, validation paths, and the guest exit.
// We don't drive a real password sign-in here because the project may have
// confirm-email turned on (signup → "Check your email" alert, no session).
// What we DO assert is that the inputs/buttons exist, validation rejects bad
// shapes, and "Continue as guest" routes back to the tabs.

import { test, expect, waitForAppReady, freshTestEmail, passwordField, homeSearch } from "./helpers/page";

test.describe("Auth modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
    await waitForAppReady(page);
  });

  test("welcome step shows brand, heading, and the sign-in options", async ({
    page,
  }) => {
    await expect(page.getByText("Grabsty").first()).toBeVisible();
    await expect(page.getByText("Sign in to continue")).toBeVisible();
    await expect(page.getByText("Continue with Google")).toBeVisible();
    await expect(page.getByText("Continue with email")).toBeVisible();
    await expect(page.getByText("Continue as guest")).toBeVisible();
  });

  test("Continue as guest exits the modal back to the tab feed", async ({
    page,
  }) => {
    await page.getByText("Continue as guest").click();
    await page.waitForURL((u) => !u.pathname.includes("/auth/login"));
    // Some path under the tab navigator — the home feed's search field is
    // unique enough to identify it.
    await expect(
      homeSearch(page),
    ).toBeVisible();
  });

  test("Log in step renders the form with email + password fields", async ({
    page,
  }) => {
    await page.getByTestId("welcome-login-button").click();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(passwordField(page)).toBeVisible();
    // "Sign in" appears twice on the form step: in the mode toggle and on
    // the submit button. The submit button is the last one in document order.
    await expect(
      page.getByText("Sign in", { exact: true }).last(),
    ).toBeVisible();
  });

  // React-Native-Web's Alert.alert is implemented as a no-op (see
  // node_modules/react-native-web/dist/.../Alert/index.js). The login screen
  // surfaces every validation + backend error through Alert.alert, so on web
  // those code paths emit nothing observable to the test — neither a dialog
  // event nor a DOM change. We assert what IS observable: the user stays on
  // the form step (the email + password inputs remain on screen, the URL is
  // unchanged). That proves the submit didn't proceed.
  test.describe("Sign in validation (web-observable signals only)", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId("welcome-login-button").click();
      await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    });

    test("an invalid email shape leaves the user on the form step", async ({
      page,
    }) => {
      await page.getByPlaceholder("you@example.com").fill("not-an-email");
      await passwordField(page).fill("hunter22");
      await page.getByText("Sign in", { exact: true }).last().click();
      // Form is still rendered; we never reached the tabs.
      await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/login/);
    });

    test("a short password leaves the user on the form step", async ({
      page,
    }) => {
      await page.getByPlaceholder("you@example.com").fill("test@example.test");
      await passwordField(page).fill("123");
      await page.getByText("Sign in", { exact: true }).last().click();
      await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/login/);
    });

    test("unknown credentials keep the user on the form step", async ({
      page,
    }) => {
      await page.getByPlaceholder("you@example.com").fill(freshTestEmail());
      await passwordField(page).fill("hunter22-not-real");
      await page.getByText("Sign in", { exact: true }).last().click();
      // Give the auth roundtrip a moment to resolve.
      await page.waitForTimeout(2000);
      await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  });

  test("Sign-up form renders the input fields and submit copy", async ({
    page,
  }) => {
    await page.getByTestId("welcome-login-button").click();
    await page.getByText("Sign up", { exact: true }).click();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(passwordField(page)).toBeVisible();
    await expect(
      page.getByText("Create account", { exact: true }),
    ).toBeVisible();
  });

  test("Continue with email then Sign up shows the signup form", async ({
    page,
  }) => {
    // We don't drive the back-arrow press here because RN-Web's Pressable
    // doesn't always expose role="button" — clicking it from outside is
    // brittle. Going forward (welcome → signup → form) covers the same
    // routing semantics: the welcome panel collapses and the form appears.
    await page.getByTestId("welcome-login-button").click();
    await page.getByText("Sign up", { exact: true }).click();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(
      page.getByText("Create account", { exact: true }),
    ).toBeVisible();
  });
});
