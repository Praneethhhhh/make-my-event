import {
  test,
  expect,
  account,
  mutation,
  origin,
} from "../../auth/tests/fixtures";
import { onboard, ceremony, write } from "../../functions/tests/fixtures";
import type { Page } from "@playwright/test";
for (const width of [390, 768, 1440])
  test(`redesigned organizer lifecycle at ${width}px`, async ({
    page,
    browser,
    database,
  }) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width, height: 960 });
    const wedding = await onboard(page.request);
    const prefix = `/weddings/${wedding.id}`;
    const functionRecord = (
      await (await write(page.request, "functions", ceremony)).json()
    ).data.function;
    const recipient = await browser.newContext({
      baseURL: origin,
      viewport: { width, height: 960 },
    });
    async function navigate(label: string) {
      if (width < 961)
        await page.getByRole("button", { name: "Wedding menu" }).click();
      await page.getByRole("link", { name: label, exact: true }).click();
    }
    async function screenshot(name: string, current: Page = page) {
      expect(
        await current.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const modal = current.locator("dialog:modal");
      const hasModal = (await modal.count()) > 0;
      if (hasModal) {
        const bounds = await modal.first().boundingBox();
        expect(Math.abs(bounds!.y)).toBeLessThan(1);
        expect(
          await current.evaluate(
            () => !!document.elementFromPoint(10, 10)?.closest("dialog:modal"),
          ),
        ).toBe(true);
      }
      await current.screenshot({
        path: `.next/redesign-${name}-${width}.png`,
        fullPage: !hasModal,
        animations: "disabled",
      });
    }
    try {
      await mutation(
        recipient.request,
        "register",
        {
          ...account,
          email: "ops-recipient@example.invalid",
          displayName: "Family Helper",
        },
        "ops-recipient",
      );
      const helper = await database
        .collection("users")
        .findOne({ emailNormalized: "ops-recipient@example.invalid" });
      const { default: mongoose } = await import("mongoose");
      await database.collection("weddingMemberships").insertOne({
        weddingId: new mongoose.Types.ObjectId(wedding.id),
        userId: helper!._id,
        status: "ACTIVE",
        role: "ORGANIZER",
        revision: 1,
      });
      await page.goto(`${prefix}/vendors`);
      await page
        .getByRole("button", { name: "Add vendor", exact: true })
        .click();
      await page
        .getByLabel("Vendor name", { exact: true })
        .fill("Family florist");
      await page.getByLabel("Category", { exact: true }).fill("Flowers");
      await page
        .getByLabel("Phone numbers (comma-separated)", { exact: true })
        .fill("+91 9876543210");
      await page.getByLabel("Forest", { exact: true }).check();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Family florist", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Assign function", exact: true }),
      ).toHaveCount(0);
      await screenshot("vendors");
      await navigate("Tasks");
      await page.getByRole("button", { name: "New task", exact: true }).click();
      await page
        .getByLabel("Task title", { exact: true })
        .fill("Temporary draft");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(
        page.getByRole("alertdialog", { name: "Discard this draft?" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await expect(
        page.getByLabel("Task title", { exact: true }),
      ).toBeFocused();
      await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
        "Temporary draft",
      );
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page
        .getByRole("button", { name: "Discard draft", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "New task", exact: true }),
      ).toBeFocused();
      await page.getByRole("button", { name: "New task", exact: true }).click();

      await page
        .getByLabel("Task title", { exact: true })
        .fill("Confirm @Family");
      await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
        "Confirm @Family",
      );
      await page
        .getByRole("listbox", { name: "Mention a team member" })
        .getByRole("option", { name: "Family Helper", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Task owner", exact: true })
        .selectOption(String(helper!._id));
      await page
        .getByRole("combobox", { name: "Vendor (optional)", exact: true })
        .selectOption({ label: "Family florist" });
      await page
        .getByRole("dialog", { name: "Edit wedding record" })
        .getByRole("combobox", { name: "Function", exact: true })
        .selectOption(functionRecord.id);
      await page
        .getByLabel("Description", { exact: true })
        .fill("Use white jasmine @Test");
      await expect(
        page.getByRole("listbox", { name: "Mention a team member" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Edit wedding record" }),
      ).toBeVisible();
      await page
        .getByLabel("Description", { exact: true })
        .fill("Use white jasmine @Tes");
      await page.getByLabel("Description", { exact: true }).press("t");
      await expect(
        page
          .getByRole("listbox", { name: "Mention a team member" })
          .getByRole("option", { name: "Test Family", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
        "Use white jasmine @Test Family ",
      );
      await screenshot("task-editor");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "Confirm @Family Helper", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Kanban", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "To Do · 1", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Status for Confirm @Family Helper", { exact: true })
        .selectOption("IN_PROGRESS");
      await expect(
        page.getByRole("heading", { name: "In Progress · 1", exact: true }),
      ).toBeVisible();
      expect(
        (
          await write(page.request, `functions/${functionRecord.id}/archive`, {
            revision: functionRecord.revision,
          })
        ).status(),
      ).toBe(200);
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(
        page
          .getByRole("dialog", { name: "Edit wedding record" })
          .getByRole("combobox", { name: "Function", exact: true }),
      ).toHaveValue(functionRecord.id);
      await page
        .getByLabel("Description", { exact: true })
        .fill("Updated after function archive.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "Edit wedding record" }),
      ).not.toBeVisible();
      await page.getByRole("button", { name: "List", exact: true }).click();
      await screenshot("tasks");
      await page
        .getByRole("link", { name: "Confirm @Family Helper", exact: true })
        .click();
      await page
        .getByLabel("Write a comment", { exact: true })
        .fill("Please confirm @Family");
      await page
        .getByRole("listbox", { name: "Mention a team member" })
        .getByRole("option", { name: "Family Helper", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Post comment", exact: true })
        .click();
      await expect(
        page.getByText("Please confirm @Family Helper", { exact: true }),
      ).toBeVisible();
      const joined = await recipient.newPage();
      await joined.goto(`${prefix}/notifications`);
      await expect(
        joined.getByRole("heading", {
          name: "Test Family assigned and mentioned you",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        joined.getByRole("heading", {
          name: "Test Family mentioned you",
          exact: true,
        }),
      ).toBeVisible();
      await joined
        .getByRole("link", { name: "Open comment →", exact: true })
        .click();
      await expect(
        joined.getByText("Please confirm @Family Helper", { exact: true }),
      ).toBeVisible();
      await navigate("Finance");
      let balanceRequests = 0;
      page.on("request", (request) => {
        if (request.url().includes("/finance/vendor-balances"))
          balanceRequests++;
      });
      await page
        .getByRole("button", { name: "Add entry", exact: true })
        .click();
      await page
        .getByLabel("Description", { exact: true })
        .fill("Flower delivery");
      await page.getByLabel("Category", { exact: true }).fill("Flowers");
      await page.getByLabel("Amount (₹ INR)", { exact: true }).fill("1000");
      await page
        .getByRole("combobox", { name: "Vendor (optional)", exact: true })
        .selectOption({ label: "Family florist" });
      await screenshot("expense-editor");
      await page
        .getByRole("button", { name: "Save expense", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Flower delivery", exact: true }),
      ).toBeVisible();
      expect(balanceRequests).toBe(0);
      await page
        .locator(".finance-row")
        .filter({ hasText: "Flower delivery" })
        .getByRole("button", { name: "Record payment", exact: true })
        .click();
      await expect(page.locator(".finance-payment-context")).toContainText(
        "₹1,000.00",
      );
      await page
        .getByRole("button", { name: "Refresh remaining balance", exact: true })
        .click();
      await expect(page.locator(".finance-payment-context")).toContainText(
        "₹1,000.00",
      );
      await page.getByLabel("Amount (₹ INR)", { exact: true }).fill("250");
      await page
        .getByRole("button", { name: "Save payment", exact: true })
        .click();
      await expect(
        page
          .locator(".finance-summary article")
          .filter({ hasText: "Actual paid" }),
      ).toContainText("₹250.00");
      await expect(
        page
          .locator(".finance-summary article")
          .filter({ hasText: "Outstanding" }),
      ).toContainText("₹750.00");
      await page
        .getByRole("button", { name: "Add entry", exact: true })
        .click();
      await page
        .getByLabel("Description", { exact: true })
        .fill("Ritual supplies");
      await page.getByLabel("Category", { exact: true }).fill("Ceremony");
      await page.getByLabel("Amount (₹ INR)", { exact: true }).fill("123.45");
      await page.getByRole("radio", { name: /Something already paid/ }).check();
      await page
        .getByRole("button", { name: "Save payment", exact: true })
        .click();
      await expect(
        page
          .locator(".finance-summary article")
          .filter({ hasText: "Actual paid" }),
      ).toContainText("₹373.45");
      await page
        .getByRole("button", { name: "View vendor balances", exact: true })
        .click();
      await expect(page.locator(".finance-balances-list")).toContainText(
        "₹750.00 remaining",
      );
      expect(balanceRequests).toBe(1);
      await screenshot("finance");
      await page.getByRole("button", { name: "Payments", exact: true }).click();
      await page
        .locator(".finance-row")
        .filter({ hasText: "Ritual supplies" })
        .getByRole("button", {
          name: "Remove payment: Ritual supplies",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Reason for removal", { exact: true })
        .fill("Duplicate receipt");
      await page
        .getByRole("button", { name: "Remove entry", exact: true })
        .click();
      await expect(
        page
          .locator(".finance-summary article")
          .filter({ hasText: "Actual paid" }),
      ).toContainText("₹250.00");
      await navigate("Dashboard");
      await expect(
        page.getByRole("heading", { name: "1 active vendor", exact: true }),
      ).toBeVisible();
      await screenshot("dashboard");
      await page.getByRole("link", { name: /Notifications/ }).click();
      await expect(
        page.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();
      await page.route(/\/api\/v1\/operations\?view=context$/, (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Temporary test interruption" },
          }),
        }),
      );
      await page.reload();
      await expect(
        page.locator(".operations-workspace > .operations-alert"),
      ).toContainText("Temporary test interruption");
      await page.unroute(/\/api\/v1\/operations\?view=context$/);
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(
        page.locator(".operations-workspace > .operations-alert"),
      ).toHaveCount(0);
      await expect(page.locator(".operations-list")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();
      expect(
        await joined.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await recipient.close();
    }
  });
