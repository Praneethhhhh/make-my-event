import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  scopedGet,
  scopeHeaders,
} from "../../auth/tests/fixtures";
import { onboard, write } from "../../functions/tests/fixtures";

test("dashboard aggregates the selected wedding and filters before pagination", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  const weddingId = new mongoose.Types.ObjectId(wedding.id);
  const user = await database
    .collection("users")
    .findOne({ emailNormalized: "family@example.invalid" });
  const tasks = Array.from({ length: 57 }, (_, i) => ({
    weddingId,
    title: `Task ${i}`,
    description: "",
    deletedAt: null,
    revision: 1,
    status: i === 56 ? "COMPLETED" : "TODO",
    dueAt: i === 0 ? new Date("2020-01-01") : null,
    assigneeUserId: i < 3 ? user!._id : null,
  }));
  await database.collection("tasks").insertMany(tasks);
  await database.collection("tasks").insertOne({
    weddingId: new mongoose.Types.ObjectId(),
    deletedAt: null,
    status: "TODO",
    assigneeUserId: user!._id,
    dueAt: new Date("2020-01-01"),
  });
  await database.collection("vendors").insertMany([
    { weddingId, status: "ACTIVE" },
    { weddingId, status: "INACTIVE" },
    { weddingId: new mongoose.Types.ObjectId(), status: "ACTIVE" },
  ]);
  await database.collection("expenses").insertMany([
    { weddingId, status: "POSTED", amountPaise: 12345 },
    { weddingId, status: "VOID", amountPaise: 99999 },
  ]);
  const charge = await database
    .collection("vendorCharges")
    .insertOne({ weddingId, status: "ACTIVE", amountPaise: 100000 });
  await database.collection("vendorPayments").insertOne({
    weddingId,
    chargeId: charge.insertedId,
    status: "POSTED",
    amountPaise: 25000,
  });
  const summary = (
    await (
      await scopedGet(page.request, "/api/v1/operations?view=dashboard")
    ).json()
  ).data;
  expect(summary.summary).toEqual({
    open: 56,
    overdue: 1,
    mine: 3,
    activeVendors: 1,
    actualPaid: 37345,
    outstanding: 75000,
  });
  expect(Object.keys(summary).sort()).toEqual([
    "displayName",
    "summary",
    "timeZone",
    "title",
  ]);
  const mine = (
    await (await scopedGet(page.request, "/api/v1/tasks?scope=mine")).json()
  ).data;
  expect(mine.items).toHaveLength(3); // These are older than the first unfiltered page.
  const overdue = (
    await (await scopedGet(page.request, "/api/v1/tasks?scope=overdue")).json()
  ).data;
  expect(overdue.items).toHaveLength(1);
  const first = (
    await (await scopedGet(page.request, "/api/v1/tasks?scope=open")).json()
  ).data;
  expect(first.items).toHaveLength(50);
  const second = (
    await (
      await scopedGet(
        page.request,
        `/api/v1/tasks?scope=open&cursor=${first.nextCursor}`,
      )
    ).json()
  ).data;
  expect(second.items).toHaveLength(6);
  expect(
    (await scopedGet(page.request, "/api/v1/tasks?scope=invalid")).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get("/api/v1/operations?view=dashboard", {
        headers: {
          "X-Wedding-Id": new mongoose.Types.ObjectId().toHexString(),
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (await page.request.get("/api/v1/operations?view=dashboard")).status(),
  ).toBe(400);
});

for (const width of [390, 768, 1440]) {
  test(`dashboard navigation, focus and layout at ${width}px`, async ({
    page,
    database,
  }) => {
    void database;
    await page.setViewportSize({ width, height: 960 });
    const wedding = await onboard(page.request);
    const prefix = `/weddings/${wedding.id}`;
    const me = (await (await page.request.get("/api/v1/auth/me")).json()).data
      .user;
    await write(page.request, "tasks", {
      creationKey: randomUUID(),
      title: "Check ceremony flowers",
      description: "",
      weddingTimeZone: "Asia/Kolkata",
      assigneeType: "USER",
      assigneeUserId: me.id,
      assigneeVendorId: null,
      functionId: null,
      status: "TODO",
      priority: "NORMAL",
      dueAt: null,
    });
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/"))
        requests.push(new URL(request.url()).pathname);
    });
    await page.goto(prefix);
    await expect(
      page.getByRole("heading", { name: wedding.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /My open tasks/ }),
    ).toContainText("1");
    expect(requests).not.toContain("/api/v1/vendor-charges");
    expect(requests).not.toContain("/api/v1/vendor-payments");
    expect(requests).not.toContain("/api/v1/vendors");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bell = await page
      .getByRole("link", { name: /Notifications/ })
      .boundingBox();
    const account = await page
      .getByRole("button", { name: "Account menu" })
      .boundingBox();
    expect(account!.x - (bell!.x + bell!.width)).toBeLessThan(24);
    await page.screenshot({
      path: `.next/workspace-dashboard-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("link", { name: /My open tasks/ }).click();
    await expect(page).toHaveURL(`${prefix}/tasks?scope=mine`);
    await expect(
      page.getByRole("link", { name: "Check ceremony flowers", exact: true }),
    ).toBeVisible();
    if (width < 961) {
      const menu = page.getByRole("button", { name: "Wedding menu" });
      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Wedding navigation" });
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
      await expect(menu).toBeFocused();
      await menu.click();
      await drawer
        .getByRole("link", { name: "Functions", exact: true })
        .click();
      await expect(drawer).not.toBeVisible();
      await expect(page).toHaveURL(`${prefix}/functions`);
      await page
        .getByLabel("Function name", { exact: false })
        .fill("Unsaved function");
      await page.getByRole("button", { name: "Wedding menu" }).click();
      await page
        .getByRole("dialog", { name: "Wedding navigation" })
        .getByRole("link", { name: "Tasks", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Leave unsaved changes?" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Stay", exact: true }).click();
      await expect(
        page.getByLabel("Function name", { exact: false }),
      ).toHaveValue("Unsaved function");
      await page.getByRole("button", { name: "Wedding menu" }).click();
      await page
        .getByRole("dialog", { name: "Wedding navigation" })
        .getByRole("link", { name: "Tasks", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Discard and continue", exact: true })
        .click();
      await expect(page).toHaveURL(`${prefix}/tasks`);
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    } else {
      await page
        .getByRole("navigation", { name: "Wedding workspace" })
        .getByRole("link", { name: "Team", exact: true })
        .click();
      await expect(page).toHaveURL(`${prefix}/team`);
    }
    await page.goto(`${prefix}/dashboard`);
    await expect(page).toHaveURL(prefix);
    await expect(
      page.getByRole("heading", { name: wedding.title, exact: true }),
    ).toBeVisible();
    expect((await scopeHeaders(page.request))["X-Wedding-Id"]).toBe(wedding.id);
  });
}

test("dashboard loading, recoverable error and reduced motion", async ({
  page,
  database,
}) => {
  void database;
  const wedding = await onboard(page.request);
  let calls = 0;
  await page.route("**/api/v1/operations?view=dashboard", async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Unavailable" } }),
      });
    else {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/weddings/${wedding.id}`);
  await expect(
    page.getByRole("heading", { name: "Let’s try that again" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("status", { name: "Loading dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: wedding.title, exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".workspace-dashboard")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await expect(page.getByRole("link", { name: /My open tasks/ })).toContainText(
    "0",
  );
});
