import { test, expect } from "../../auth/tests/fixtures";
import { onboard, write, ceremony } from "../../functions/tests/fixtures";
for (const width of [390, 1440])
  test(`guest invite prerequisite and count failure at ${width}px`, async ({
    page,
    database,
  }) => {
    void database;
    await page.setViewportSize({ width, height: 960 });
    const wedding = await onboard(page.request),
      prefix = `/weddings/${wedding.id}`;
    await page.goto(prefix + "/guests");
    const add = page.getByRole("link", { name: "Add function", exact: true });
    await expect(add).toBeVisible();
    await expect(
      page.getByText("Add a function first, then invite guests to it.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite guest", exact: true }),
    ).toHaveCount(0);
    await expect(add).toHaveAttribute("href", prefix + "/functions");
    await add.focus();
    await expect(add).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `playwright-report/guest-invitations/prerequisite-${width}.png`,
      animations: "disabled",
    });
    await add.click();
    await expect(page).toHaveURL(prefix + "/functions");
    await expect(page.getByLabel("Function name")).toBeVisible();
    expect((await write(page.request, "functions", ceremony)).status()).toBe(
      201,
    );
    await page.route("**/api/v1/guests/summary", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: { code: "DEPENDENCY_UNAVAILABLE", message: "Unavailable" },
        },
      }),
    );
    await page.goto(prefix + "/guests");
    await expect(
      page.getByRole("alert").filter({
        hasText: "Guest counts couldn’t load. Refresh to try again.",
      }),
    ).toBeVisible();
    const invite = page.getByRole("button", {
      name: "Invite guest",
      exact: true,
    });
    await expect(invite).toBeEnabled();
    await expect(
      page.getByRole("link", { name: "Add function", exact: true }),
    ).toHaveCount(0);
    await invite.click();
    await expect(
      page.getByLabel("Recipient name", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Haldi/ })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    await expect(invite).toBeFocused();
  });
