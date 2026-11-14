import { test, expect } from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";

for (const failure of [false, true])
  test(`finance ignores stale pagination ${failure ? "errors" : "rows"} after switching views`, async ({
    page,
    database,
  }) => {
    void database;
    const wedding = await onboard(page.request);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const row = (description: string, id: string) => ({
      id,
      key: id,
      source: "expenses",
      revision: 1,
      description,
      vendorId: null,
      vendorName: null,
      amountPaise: 10000,
      paidPaise: 0,
      outstandingPaise: 10000,
      active: true,
      status: "ACTIVE",
    });
    await page.route("**/api/v1/finance/expenses?*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("cursor")) {
        await gate;
        await route.fulfill(
          failure
            ? {
                status: 503,
                json: { error: { message: "Stale pagination failure" } },
              }
            : {
                json: {
                  data: {
                    items: [row("Stale expense", "222222222222222222222222")],
                    nextCursor: null,
                    total: 2,
                  },
                },
              },
        );
      } else
        await route.fulfill({
          json: {
            data: {
              items: [row("Original expense", "111111111111111111111111")],
              nextCursor: "old-page",
              total: 2,
            },
          },
        });
    });
    await page.route("**/api/v1/finance/payments?*", (route) =>
      route.fulfill({
        json: { data: { items: [], nextCursor: null, total: 0 } },
      }),
    );
    await page.goto(`/weddings/${wedding.id}/finance`);
    await expect(
      page.getByRole("heading", { name: "Original expense", exact: true }),
    ).toBeVisible();
    const pagination = page.waitForRequest(
      (request) =>
        new URL(request.url()).searchParams.get("cursor") === "old-page",
    );
    await page
      .getByRole("button", { name: "More records", exact: true })
      .click();
    await pagination;
    const cancelled = page.waitForEvent("requestfailed", {
      predicate: (request) =>
        new URL(request.url()).searchParams.get("cursor") === "old-page",
    });
    await page.getByRole("button", { name: "Payments", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No payments recorded", exact: true }),
    ).toBeVisible();
    await cancelled;
    release();
    await expect(
      page.getByRole("heading", { name: "Stale expense", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Stale pagination failure", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Expenses", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Original expense", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More records", exact: true }),
    ).toBeEnabled();
  });

test("choice search hides the old cursor and preserves the selected record", async ({
  page,
  database,
}) => {
  void database;
  const wedding = await onboard(page.request);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  await page.route(
    "**/api/v1/operations?view=choices&type=people&*",
    async (route) => {
      const url = new URL(route.request().url()),
        query = url.searchParams.get("q") ?? "",
        cursor = url.searchParams.get("cursor");
      if (cursor) requests.push(cursor);
      if (query === "Fresh" && !cursor) await gate;
      await route.fulfill({
        json: {
          data: {
            items: cursor
              ? []
              : query === "Fresh"
                ? [{ id: "222222222222222222222222", name: "Fresh organizer" }]
                : [
                    {
                      id: "111111111111111111111111",
                      name: "Selected organizer",
                    },
                  ],
            nextCursor: cursor
              ? null
              : query === "Fresh"
                ? "fresh-cursor"
                : "old-cursor",
          },
        },
      });
    },
  );
  await page.goto(`/weddings/${wedding.id}/tasks`);
  await expect(
    page.getByRole("heading", { name: "No tasks yet", exact: true }),
  ).toBeVisible();
  await page.locator(".task-filters > summary").click();
  const picker = page.locator(".record-picker").filter({
    has: page.getByRole("combobox", { name: "Owner", exact: true }),
  });
  await picker
    .getByRole("combobox")
    .selectOption({ label: "Selected organizer" });
  await expect(
    picker.getByRole("button", { name: "More choices", exact: true }),
  ).toBeVisible();
  await picker.locator("summary").click();
  await picker.getByRole("searchbox").fill("Fresh");
  await expect(
    picker.getByRole("button", { name: "More choices", exact: true }),
  ).toHaveCount(0);
  await expect(picker.getByRole("combobox")).toHaveValue(
    "111111111111111111111111",
  );
  release();
  await expect(
    picker.getByRole("option", { name: "Fresh organizer", exact: true }),
  ).toBeAttached();
  await picker
    .getByRole("button", { name: "More choices", exact: true })
    .click();
  await expect.poll(() => requests).toEqual(["fresh-cursor"]);
  await expect(picker.getByRole("combobox")).toHaveValue(
    "111111111111111111111111",
  );
});
