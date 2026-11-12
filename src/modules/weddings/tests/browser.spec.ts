import { account, expect, mutation, test } from "../../auth/tests/fixtures";

for (const width of [390, 1440]) {
  test(`creates a wedding through the UI at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mutation(page.request, "register", account);
    await page.route("**/api/v1/auth/me", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    await page.goto("/wedding/setup");
    await expect(page.getByText("Loading wedding setup…")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Creating wedding…" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Create your wedding" }),
    ).toBeVisible();
    await page.unroute("**/api/v1/auth/me");

    await page.getByRole("button", { name: /Create wedding/ }).click();
    await expect(page.getByLabel("Wedding title")).toBeFocused();
    await expect(
      page.getByText("Check the highlighted fields and try again."),
    ).toBeVisible();

    await page.getByLabel("Wedding title").fill("Pavithra & Manish’s Wedding");
    await page.getByLabel("First partner or host").fill("Pavithra");
    await page.getByLabel("Second partner or host").fill("Manish");
    await page.getByLabel("Wedding style or tradition").selectOption("HINDU");
    await page.getByLabel("Start date").fill("2027-02-21");
    await page.getByLabel("End date").fill("2027-02-18");
    await expect(page.getByLabel("Wedding time zone")).toHaveValue(
      "Asia/Kolkata",
    );
    await page.getByRole("button", { name: /Create wedding/ }).click();
    await expect(page.getByLabel("End date")).toBeFocused();
    await page.getByLabel("End date").fill("2027-02-21");
    await page.getByLabel("Short description").fill("Our family celebration.");
    await page.getByRole("button", { name: /Create wedding/ }).click();

    await expect(
      page.getByRole("heading", { name: "Pavithra & Manish’s Wedding" }),
    ).toBeVisible();
    await expect(
      page.getByText("Pavithra & Manish’s Wedding", { exact: true }).first(),
    ).toBeVisible();
    expect(await database.collection("weddings").countDocuments()).toBe(1);
    expect(
      await database.collection("weddingMemberships").countDocuments(),
    ).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.goto("/weddings/new");
    await expect(
      page.getByRole("heading", { name: "Create your wedding" }),
    ).toBeVisible();
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/weddings$/);
    await expect(
      page.getByRole("link", { name: "Open wedding", exact: true }),
    ).toHaveCount(1);
  });
}
