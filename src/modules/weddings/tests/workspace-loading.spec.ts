import { test, expect, navigateWorkspace } from "../../auth/tests/fixtures";
import { onboard, write, ceremony } from "../../functions/tests/fixtures";

for (const width of [390, 1440]) {
  test(`dashboard guidance and workspace loading at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const wedding = await onboard(page.request);
    const prefix = `/weddings/${wedding.id}`;
    await page.goto(prefix);
    await expect(
      page.getByRole("heading", { name: wedding.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Add a function to see guest responses here.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open all tasks" }),
    ).toHaveAttribute("href", `${prefix}/tasks`);
    expect((await write(page.request, "functions", ceremony)).status()).toBe(
      201,
    );
    await page.reload();
    await expect(page.locator(".guest-summary-row strong")).toHaveText(
      ceremony.name,
    );
    await expect(
      page.getByText("Add a function to see guest responses here.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await database
      .collection("weddingMemberships")
      .updateMany({}, { $set: { role: "ORGANIZER" } });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: wedding.title, exact: true }),
    ).toBeVisible();
    // Dashboard no longer gives admin-only invitations as onboarding guidance.
    await expect(
      page.getByRole("heading", { name: "Invite family organizers" }),
    ).toHaveCount(0);
    await navigateWorkspace(page, "Team");
    await expect(page).toHaveURL(`${prefix}/team`);
    await expect(
      page.getByRole("heading", { name: "Your organizing team" }),
    ).toBeVisible();
    await expect(page.getByLabel("Recipient email")).toHaveCount(0);
    await navigateWorkspace(page, "Functions");
    await expect(
      page.getByRole("heading", { name: ceremony.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Could not load functions. Reload the page to try again."),
    ).toHaveCount(0);
    await navigateWorkspace(page, "Wedding details");
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

test("real loading failures remain visible and dashboard recovers without false empty guidance", async ({
  page,
}) => {
  const wedding = await onboard(page.request);
  const prefix = `/weddings/${wedding.id}`;
  const dashboard = "**/api/v1/operations?view=dashboard";
  await page.route(dashboard, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }),
  );
  await page.goto(prefix);
  const failure = page
    .getByRole("alert")
    .filter({ hasText: "Your dashboard couldn’t load. Please try again." });
  await expect(failure).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading dashboard" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Add a function to see guest responses here.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.unroute(dashboard);
  await failure.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open all tasks" }),
  ).toBeVisible();
  await expect(failure).toHaveCount(0);
  await page.route("**/api/v1/functions", (route) =>
    route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }),
  );
  await navigateWorkspace(page, "Functions");
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
  // The canonical Dashboard does not read /wedding; details is its current consumer.
  await page.goto(`${prefix}/details`);
  await expect(
    page.getByText("Could not load wedding setup. Try again.", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/v1/wedding");
  await page.reload();
  await expect(page.getByLabel("Wedding title")).toHaveValue(wedding.title);
  await expect(
    page.getByText("Could not load wedding setup. Try again.", { exact: true }),
  ).toHaveCount(0);
});
