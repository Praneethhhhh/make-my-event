import { test, expect } from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";
import { write } from "./fixtures";
import mongoose from "mongoose";

for (const width of [390, 1440])
  test(`minimal states and committed mentions at ${width}px`, async ({
    page,
    database,
  }) => {
    void database;
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const wedding = await onboard(page.request),
      prefix = `/weddings/${wedding.id}`;
    const capture = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `playwright-report/operations-refinements/${name}-${width}.png`,
        fullPage: !(await page.locator("dialog:modal").count()),
        animations: "disabled",
      });
    };
    await page.goto(`${prefix}/notifications`);
    await expect(
      page.getByRole("heading", { name: "You’re all caught up", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "All history", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "No notifications yet", exact: true }),
    ).toBeVisible();
    await capture("notifications-history-empty");
    await page.goto(`${prefix}/tasks`);
    await expect(
      page.getByRole("heading", { name: "No tasks yet", exact: true }),
    ).toBeVisible();
    await capture("tasks-empty");
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your board is ready", exact: true }),
    ).toBeVisible();
    await capture("tasks-kanban-empty");
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.getByRole("button", { name: "My tasks", exact: true }).click();
    await expect(page.locator(".task-audience")).toContainText(
      "Tasks assigned to you",
    );
    await page
      .getByRole("button", { name: "All team tasks", exact: true })
      .click();
    const response = await write(page.request, "tasks", {
      title: "Confirm the flowers",
      description: "",
      assigneeType: "USER",
      assigneeVendorId: null,
      vendorId: null,
      functionId: null,
      weddingTimeZone: "Asia/Kolkata",
      status: "TODO",
      priority: "NORMAL",
      dueAt: null,
    });
    expect(response.status()).toBe(201);
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Confirm the flowers", exact: true }),
    ).toBeVisible();
    await capture("tasks-populated");
    await page.locator(".task-filters > summary").click();
    await page
      .getByRole("combobox", { name: "Owner", exact: true })
      .selectOption({ label: "Test Family" });
    await expect(page.locator(".task-audience")).toContainText(
      "Tasks owned by Test Family",
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page
      .getByLabel("Search tasks", { exact: true })
      .fill("Nothing matches this search");
    await expect(
      page.getByRole("heading", { name: "No matching tasks", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();

    await page
      .getByRole("link", { name: "Confirm the flowers", exact: true })
      .click();
    const editor = page.getByLabel("Write a comment", { exact: true });
    await editor.fill("Please ask @Test");
    await page
      .getByRole("option", { name: "Test Family", exact: true })
      .click();
    await editor.pressSequentially("to confirm tomorrow.");
    await expect(
      page.getByRole("listbox", { name: "Mention a team member" }),
    ).toHaveCount(0);
    await editor.pressSequentially(" and @Test");
    await expect(
      page.getByRole("option", { name: "Test Family", exact: true }),
    ).toBeVisible();
    await editor.press("ArrowDown");
    await editor.press("Enter");
    await editor.pressSequentially("thanks.");
    await editor.press("Enter");
    await editor.pressSequentially("Second line is readable.");
    await page
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    const comment = page.locator(".discussion-comment");
    await expect(comment).toHaveCount(1);
    await expect(comment.locator(".inline-mention")).toHaveCount(2);
    await expect(comment.locator(".discussion-body")).toContainText(
      "Second line is readable.",
    );
    expect(
      await comment
        .locator(".discussion-body")
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(14);
    const bodyBox = await comment.locator(".discussion-body").boundingBox(),
      headerBox = await comment.locator("header").boundingBox(),
      composerBox = await page.locator(".discussion-composer").boundingBox();
    expect(bodyBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    expect(composerBox!.y).toBeGreaterThan(bodyBox!.y + bodyBox!.height);
    await capture("discussion");
    await page
      .getByRole("button", { name: "Edit comment", exact: true })
      .click();
    await expect(editor).toHaveValue(/Second line is readable/);
    await page
      .getByRole("button", { name: "Cancel edit", exact: true })
      .click();
    await expect(editor).toHaveValue("");
    const seed = await database.collection("notifications").findOne({
      weddingId: new mongoose.Types.ObjectId(wedding.id),
      targetType: "TASK",
    });
    expect(seed).toBeTruthy();
    await database.collection("notifications").insertMany(
      Array.from({ length: 12 }, (_, index) => ({
        ...seed!,
        _id: new mongoose.Types.ObjectId(),
        eventKey: `visual-${index}`,
        readAt: null,
        createdAt: new Date(Date.now() - Math.floor(index / 4) * 86400000),
      })),
    );
    await page.goto(`${prefix}/notifications`);
    await page
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();

    await expect(
      page.getByRole("heading", { name: "You’re all caught up", exact: true }),
    ).toBeVisible();
    await capture("notifications-unread-empty");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/api\/v1\/notifications\?view=all$/, async (route) => {
      await gate;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "All history", exact: true })
      .click();
    await expect(
      page.getByText("Loading notification history…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No notifications yet", exact: true }),
    ).toHaveCount(0);
    release();
    await expect(page.locator(".notification-row")).toHaveCount(13);
    await expect(page.locator(".notification-group")).toHaveCount(3);
    await expect(page.locator(".notification-group > h2").first()).toHaveText(
      new Intl.DateTimeFormat("en-IN", {
        dateStyle: "long",
        timeZone: "Asia/Kolkata",
      }).format(new Date()),
    );
    await capture("notifications-populated");
    await page.goto(`${prefix}/finance`);
    await expect(
      page.getByRole("heading", { name: "No expenses yet", exact: true }),
    ).toBeVisible();
    await capture("finance-empty");
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await page.getByRole("radio", { name: /Something already paid/ }).check();
    await page
      .getByLabel("Description", { exact: true })
      .fill("Unexpected taxi");
    await page.getByLabel("Category", { exact: true }).fill("Travel");
    await page.getByLabel("Amount (₹ INR)", { exact: true }).fill("250.50");
    await capture("finance-add-paid");
    await page
      .getByRole("button", { name: "Save payment", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Unexpected taxi", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".finance-summary")).toContainText("₹250.50");
    await page.getByRole("button", { name: "Payments", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Unexpected taxi", exact: true }),
    ).toBeVisible();
    await capture("finance-payments");
  });

test("notification count refreshes after scoped activity without idle polling", async ({
  page,
  database,
}) => {
  void database;
  const wedding = await onboard(page.request);
  let requests = 0;
  await page.route(/\/api\/v1\/notifications\?view=count$/, (route) => {
    requests++;
    return route.fulfill({ json: { data: { unreadCount: 0 } } });
  });
  await page.clock.install();
  await page.goto(`/weddings/${wedding.id}/tasks`);
  await expect(
    page.getByRole("heading", { name: "No tasks yet", exact: true }),
  ).toBeVisible();
  await page.clock.runFor(5000);
  await page.waitForLoadState("networkidle");
  await page.clock.runFor(5000);
  await page.waitForLoadState("networkidle");
  const settled = requests;
  expect(settled).toBeGreaterThan(0);
  await page.clock.runFor(120000);
  expect(requests).toBe(settled);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("mme-wedding-activity", {
        detail: { weddingId: "other-wedding" },
      }),
    ),
  );
  await page.clock.runFor(5000);
  expect(requests).toBe(settled);
  await page.getByRole("button", { name: "My tasks", exact: true }).click();
  await expect(page.locator(".task-audience")).toContainText(
    "Tasks assigned to you",
  );
  await page.clock.runFor(5000);
  await page.waitForLoadState("networkidle");
  await page.clock.runFor(5000);
  await expect.poll(() => requests).toBe(settled + 1);
});
