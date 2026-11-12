import { scopedGet, weddingRoute } from "../../auth/tests/fixtures";
import { test, expect } from "../../auth/tests/fixtures";
import { ceremony, onboard, profile, write } from "./fixtures";

test("create and edit reject a stale wedding revision without changing functions", async ({
  request,
  database,
}) => {
  await onboard(request);
  const item = (await (await write(request, "functions", ceremony)).json()).data
    .function;
  expect(
    (
      await write(
        request,
        "wedding",
        { ...profile, revision: 1, timeZone: "America/New_York" },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  for (const path of ["functions", `functions/${item.id}`]) {
    const result = await write(
      request,
      path,
      {
        ...ceremony,
        weddingRevision: 1,
        ...(path === "functions" ? {} : { revision: 1 }),
      },
      path === "functions" ? "POST" : "PATCH",
    );
    expect(result.status()).toBe(409);
    const error = (await result.json()).error;
    expect(error.code).toBe("STALE_WEDDING_SCHEDULE");
    expect(error.details.wedding).toMatchObject({
      revision: 2,
      timeZone: "America/New_York",
    });
  }
  expect(await database.collection("functions").countDocuments()).toBe(1);
  expect((await database.collection("functions").findOne({}))!.revision).toBe(
    1,
  );
  const missing = await scopedGet(request, "/api/v1/wedding");
  expect(missing.status()).toBe(200);
});

for (const width of [390, 1440]) {
  test(`two tabs refresh stale zone and range while preserving entries at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page.request);
    await page.goto(await weddingRoute(page.request, "functions"));
    await page.getByLabel("Function name").fill("Family ceremony");
    await page.getByRole("radio", { name: "Rose", exact: true }).check();
    await page.getByLabel("Start date and time").fill("2027-02-19T10:00");
    const other = await page.context().newPage();
    await other.goto(await weddingRoute(other.request, "details"));
    await other.getByLabel("Wedding time zone").fill("America/New_York");
    await other
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(other.getByRole("status")).toHaveText(
      "Wedding details saved.",
    );
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(
      page.getByText(/Your entries are preserved. Review them/),
    ).toBeVisible();
    await expect(page.locator(".zone-notice")).toContainText(
      "America/New_York",
    );
    await expect(page.getByLabel("Start date and time")).toHaveValue(
      "2027-02-19T10:00",
    );
    expect(await database.collection("functions").countDocuments()).toBe(0);
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Function saved.");
    expect(
      (await database
        .collection("functions")
        .findOne({}))!.startsAt.toISOString(),
    ).toBe("2027-02-19T15:00:00.000Z");
    await page
      .getByRole("button", { name: "Edit Family ceremony", exact: true })
      .click();
    await other.getByLabel("End date").fill("2027-02-20");
    await other
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(other.getByRole("status")).toHaveText(
      "Wedding details saved.",
    );
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(
      page.getByText(/Your entries are preserved. Review them/),
    ).toBeVisible();
    await expect(
      page.getByText(/Functions must fall between 2027-02-18 and 2027-02-20/),
    ).toBeVisible();
    await expect(page.getByLabel("Start date and time")).toHaveAttribute(
      "max",
      "2027-02-20T23:59",
    );
    await expect(page.getByLabel("Start date and time")).toHaveValue(
      "2027-02-19T10:00",
    );
    expect((await database.collection("functions").findOne({}))!.revision).toBe(
      1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await other.close();
  });
}
