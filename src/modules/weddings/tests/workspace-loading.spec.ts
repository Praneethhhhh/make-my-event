import { test, expect } from "../../auth/tests/fixtures";
import { onboard, write, ceremony } from "../../functions/tests/fixtures";

for (const width of [390, 1440]) {
  test(`overview guidance and workspace loading at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const wedding = await onboard(page.request);
    const prefix = `/weddings/${wedding.id}`;
    await page.goto(prefix);
    await expect(
      page.getByRole("heading", { name: "Create your first function" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Invite family organizers" }),
    ).toBeVisible();
    expect((await write(page.request, "functions", ceremony)).status()).toBe(
      201,
    );
    await page.reload();
    await expect(
      page.getByText("1 active function in your wedding schedule."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Create your first function" }),
    ).toHaveCount(0);
    // This fixture database is isolated; no retained tester records are modified.
    await database
      .collection("weddingMemberships")
      .updateMany({}, { $set: { role: "ORGANIZER" } });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Meet your organizing team" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Invite family organizers" }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "View team →" }).click();
    await expect(page).toHaveURL(`${prefix}/team`);
    await expect(
      page.getByRole("heading", { name: "Your organizing team" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Functions", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: ceremony.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Could not load functions. Reload the page to try again."),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Wedding details", exact: true })
      .click();
    await expect(page.getByLabel("Wedding title")).toHaveValue(wedding.title);
    await expect(
      page.getByText("Could not load wedding setup. Try again."),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

test("real loading failures remain visible and failed function summaries stay neutral", async ({
  page,
}) => {
  const wedding = await onboard(page.request);
  const prefix = `/weddings/${wedding.id}`;
  await page.route("**/api/v1/functions", (route) =>
    route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }),
  );
  await page.goto(prefix);
  await expect(
    page.getByRole("heading", { name: "Manage your functions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your first function" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Manage functions →" }).click();
  await expect(
    page.getByText("Could not load functions. Reload the page to try again."),
  ).toBeVisible();
  await page.unroute("**/api/v1/functions");
  await page.reload();
  await expect(page.getByLabel("Function name")).toBeVisible();
  await expect(
    page.getByText("Could not load functions. Reload the page to try again."),
  ).toHaveCount(0);
  await page.route("**/api/v1/wedding", (route) =>
    route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }),
  );
  await page.goto(prefix);
  await expect(
    page.getByText("Could not load your wedding workspace."),
  ).toBeVisible();
});
