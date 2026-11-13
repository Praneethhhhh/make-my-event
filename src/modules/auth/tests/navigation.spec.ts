import { test, expect, mutation, account } from "./fixtures";
import { onboard } from "../../functions/tests/fixtures";
for (const width of [390, 1440]) {
  test(`homepage and account routes reflect an existing wedding at ${width}px`, async ({
    page,
    browser,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page.request);
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Your weddings", exact: true }),
    ).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: "Create your wedding" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Sign In", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `.next/signed-in-home-${width}.png`,
      fullPage: true,
    });
    for (const path of ["/sign-in", "/register"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe("/weddings");
      await page.goto(path);
      await expect(page).toHaveURL(/\/weddings$/);
      await expect(
        page.getByRole("heading", { name: "Welcome, Test Family" }),
      ).toHaveCount(0);
    }
    const guest = await browser.newContext({
      viewport: { width, height: 900 },
    });
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto("http://127.0.0.1:3100/");
      await expect(
        guestPage.getByRole("link", { name: "Create your wedding" }),
      ).toHaveCount(width === 390 ? 2 : 3);
      await expect(
        guestPage.getByRole("link", { name: "Your weddings", exact: true }),
      ).toHaveCount(0);
    } finally {
      await guest.close();
    }
    await database
      .collection("authSessions")
      .updateMany({}, { $set: { revokedAt: new Date() } });
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Create your wedding" }),
    ).toHaveCount(width === 390 ? 2 : 3);
    await expect(
      page.getByRole("link", { name: "Sign In", exact: true }),
    ).toBeVisible();
  });
  test(`signed-in account without a wedding continues setup at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mutation(page.request, "register", account);
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Your weddings", exact: true }),
    ).toHaveCount(3);
    for (const path of ["/sign-in", "/register"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/weddings$/);
      await expect(
        page.getByRole("link", {
          name: "Join with code",
        }),
      ).toBeVisible();
    }
    await database
      .collection("authSessions")
      .updateMany({}, { $set: { expiresAt: new Date(0) } });
    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });
}
