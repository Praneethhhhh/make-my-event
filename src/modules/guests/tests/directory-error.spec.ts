import { test, expect } from "../../auth/tests/fixtures";
import { setup } from "./fixtures";
test("failed guest directory requests stop loading and recover after retry", async ({
  page,
  database,
}) => {
  void database;
  const { wedding } = await setup(page.request);
  let fail = true;
  await page.route(/\/api\/v1\/guests\?/, (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              message: "Guest directory unavailable.",
            },
          },
        })
      : route.continue(),
  );
  await page.goto(`/weddings/${wedding.id}/guests`);
  await expect(
    page.getByRole("alert").filter({ hasText: "Guest directory unavailable." }),
  ).toBeVisible();
  await expect(page.getByText("Loading guests…", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", {
      name: "Your guest list starts here",
      exact: true,
    }),
  ).toHaveCount(0);
  fail = false;
  await page
    .getByRole("button", { name: "Refresh guests", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your guest list starts here",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Guest directory unavailable." }),
  ).toHaveCount(0);
  fail = true;
  await page
    .getByLabel("Search guests", { exact: true })
    .fill("Unknown family");
  await expect(
    page.getByRole("alert").filter({ hasText: "Guest directory unavailable." }),
  ).toBeVisible();
  await expect(page.getByText("Loading guests…", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "No matching invitations", exact: true }),
  ).toHaveCount(0);
});
