import { expect, test } from "@playwright/test";

test("starts a cached production game while offline", async ({
  context,
  page
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Quick Play" })).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active)
      throw new Error("The production service worker is not active");
  });
  await page.reload();
  await expect(page.getByText("Version 1.1.0")).toBeVisible();

  await context.setOffline(true);
  await page.goto("/play?mode=quick&skipOnboarding=1");
  await expect(
    page.getByRole("button", { name: /Ready Team A/i })
  ).toBeVisible();
  await expect(page.getByTestId("tracing-canvas")).toBeVisible();
});
