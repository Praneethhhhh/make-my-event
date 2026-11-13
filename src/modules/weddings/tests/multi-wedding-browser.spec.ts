import { randomUUID } from "node:crypto";
import { test, expect, account, origin } from "../../auth/tests/fixtures";
import { onboard, profile } from "../../functions/tests/fixtures";
import type { APIRequestContext } from "@playwright/test";
async function another(api: APIRequestContext, title: string) {
  const csrf = await api.get("/api/v1/auth/csrf");
  const response = await api.post("/api/v1/weddings", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "Idempotency-Key": randomUUID(),
    },
    data: { ...profile, title },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data.wedding;
}
for (const width of [390, 1440]) {
  test(`manual code sharing, multiple memberships and scoped removal at ${width}px`, async ({
    page,
    browser,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const a = await onboard(page.request);
    await another(page.request, "Second family wedding");
    await page.goto("/weddings");
    await expect(
      page.getByRole("link", { name: "Open wedding", exact: true }),
    ).toHaveCount(2);
    expect(
      (await page
        .getByRole("link", { name: "Open wedding", exact: true })
        .first()
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `.next/weddings-${width}.png`,
      fullPage: true,
    });
    await page
      .locator(".wedding-choice-card")
      .filter({ hasText: a.title })
      .getByRole("link", { name: "Open wedding", exact: true })
      .click();
    await page.getByRole("link", { name: "Team", exact: true }).click();
    await page
      .getByLabel("Recipient email")
      .fill("manual-relative@example.invalid");
    await page
      .getByRole("button", { name: "Generate invitation code" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Private invitation code",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Single-use code")).toHaveValue(
      "••••••••••••",
    );
    await dialog
      .getByRole("button", { name: "Show code", exact: true })
      .click();
    await expect(dialog.getByLabel("Single-use code")).toHaveValue(
      /^[A-Za-z0-9_-]{12}$/,
    );
    const code = await dialog.getByLabel("Single-use code").inputValue();
    expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () =>
            Promise.reject(new Error("test clipboard unavailable")),
        },
      });
    });
    await dialog.getByRole("button", { name: "Copy code" }).click();
    await expect(dialog.getByRole("status")).toContainText(
      "Clipboard unavailable",
    );
    await dialog.getByRole("button", { name: "Hide code" }).click();
    await page.screenshot({ path: `.next/manual-code-${width}.png` });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    expect(await database.collection("emailOutbox").countDocuments()).toBe(0);
    const recipient = await browser.newContext({
      baseURL: origin,
      viewport: { width, height: 900 },
      extraHTTPHeaders: { "x-auth-test-ip": `manual-${width}` },
    });
    try {
      const join = await recipient.newPage();
      await join.goto("/register");
      await join.getByLabel("Your name").fill("Family Helper");
      await join
        .getByLabel("Email", { exact: true })
        .fill("manual-relative@example.invalid");
      await join.getByLabel("Password", { exact: true }).fill(account.password);
      await join
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await expect(join).toHaveURL(/\/weddings$/);
      await expect(
        join.getByRole("heading", { name: "Your celebrations start here" }),
      ).toBeVisible();
      await another(recipient.request, "Helper’s own wedding");
      await join.reload();
      await join
        .getByRole("link", { name: "Join with code", exact: true })
        .click();
      await join.getByLabel("Invitation code").fill(code);
      await join
        .getByRole("button", { name: "Accept invitation", exact: true })
        .click();
      await expect(
        join.getByRole("heading", { name: "You’ve joined the wedding" }),
      ).toBeVisible();
      await join.getByRole("link", { name: "View all weddings" }).click();
      await expect(
        join.getByRole("link", { name: "Open wedding", exact: true }),
      ).toHaveCount(2);
      await join
        .locator(".wedding-choice-card")
        .filter({ hasText: a.title })
        .getByRole("link", { name: "Open wedding", exact: true })
        .click();
      await join.getByRole("link", { name: "Team", exact: true }).click();
      await expect(
        join.getByRole("heading", { name: "Invite a team member" }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Refresh invitations", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Remove access for Family Helper" })
        .click();
      await page
        .getByRole("dialog", { name: "Remove access?" })
        .getByRole("button", { name: "Remove access", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Access removed");
      await join.reload();
      await expect(
        join.getByRole("heading", { name: "Wedding access unavailable" }),
      ).toBeVisible();
      await join
        .getByRole("link", { name: "Your weddings", exact: true })
        .click();
      await expect(
        join.getByRole("link", { name: "Open wedding", exact: true }),
      ).toHaveCount(1);
      await join
        .getByRole("link", { name: "Open wedding", exact: true })
        .click();
      await expect(
        join.getByRole("heading", {
          name: "Helper’s own wedding",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await recipient.close();
    }
  });
  test(`tab-local wedding context and unsaved switch protection at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const a = await onboard(page.request);
    const b = await another(page.request, "Second family wedding");
    await page.goto(`/weddings/${a.id}/details`);
    await page.getByLabel("Wedding title").fill("Unsaved first-wedding draft");
    const other = await page.context().newPage();
    await other.setViewportSize({ width, height: 900 });
    await other.goto(`/weddings/${b.id}/functions`);
    await other.getByLabel("Function name").fill("Second-wedding ceremony");
    await other.getByRole("radio", { name: "Forest", exact: true }).check();
    await other.getByLabel("Start date and time").fill("2027-02-19T10:00");
    await other
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(other.getByRole("status")).toHaveText("Function saved.");
    await page.getByLabel("Account menu", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Choose wedding" })
      .getByRole("link", { name: /Second family wedding/ })
      .click();
    const guard = page.getByRole("dialog", { name: "Leave unsaved changes?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Stay", exact: true }).click();
    await expect(page.getByLabel("Wedding title")).toHaveValue(
      "Unsaved first-wedding draft",
    );
    await page.getByRole("button", { name: "Account menu" }).click();
    await page
      .getByRole("navigation", { name: "Choose wedding" })
      .getByRole("link", { name: /Second family wedding/ })
      .click();
    await guard.getByRole("button", { name: "Discard and continue" }).click();
    await expect(page).toHaveURL(`/weddings/${b.id}`);
    await expect(guard).not.toBeVisible();
    await expect(other).toHaveURL(`/weddings/${b.id}/functions`);
    const header = await page.locator(".wedding-header").boundingBox();
    const navigation = await page
      .getByRole("navigation", { name: "Wedding workspace" })
      .boundingBox();
    expect(navigation!.y).toBeGreaterThanOrEqual(
      header!.y + header!.height - 1,
    );
    await page.screenshot({ path: `.next/scoped-wedding-${width}.png` });
    const records = await database.collection("functions").find({}).toArray();
    expect(records).toHaveLength(1);
    expect(records[0]!.weddingId.toHexString()).toBe(b.id);
    expect(
      await database
        .collection("weddings")
        .findOne({ title: "Unsaved first-wedding draft" }),
    ).toBeNull();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("link", { name: "Wedding details", exact: true })
      .click();
    await page.getByLabel("Wedding title").fill("Discard within same wedding");
    await page.getByRole("link", { name: "Functions", exact: true }).click();
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Discard and continue" }).click();
    await expect(page).toHaveURL(`/weddings/${b.id}/functions`);
    await expect(guard).not.toBeVisible();
    const functionName = page.getByLabel("Function name");
    await functionName.fill("Destination remains interactive");
    await functionName.focus();
    await expect(functionName).toBeFocused();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => document.activeElement?.closest("dialog") !== null,
      ),
    ).toBe(false);
  });
}
