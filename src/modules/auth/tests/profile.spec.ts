import type { APIRequestContext } from "@playwright/test";
import { test, expect, account, mutation, origin } from "./fixtures";
import { onboard } from "../../functions/tests/fixtures";
const nextPassword = "Cedar moons ripple quartz 482!";
// Activate isolated database cleanup even for cases that only assert HTTP/UI results.
test.beforeEach(async ({ database }) => {
  void database;
});
async function update(
  api: APIRequestContext,
  path: string,
  data: unknown,
  method = "POST",
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.fetch(`/api/v1/${path}`, {
    method,
    data,
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "x-auth-test-ip": "profile-test",
    },
  });
}
test("profile name updates are normalized, versioned and cannot change email or another account", async ({
  page,
  database,
}) => {
  await mutation(page.request, "register", account);
  const initial = await page.request.get("/api/v1/account");
  expect(initial.status()).toBe(200);
  const dto = (await initial.json()).data.user;
  expect(Object.keys(dto).sort()).toEqual([
    "displayName",
    "email",
    "id",
    "revision",
  ]);
  expect(
    (
      await page.request.patch("/api/v1/account", {
        data: { displayName: "Changed", revision: 1 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await update(
        page.request,
        "account",
        { displayName: "123", revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(422);
  expect(
    (
      await update(
        page.request,
        "account",
        { displayName: "Changed", email: "other@example.invalid", revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(422);
  const saved = await update(
    page.request,
    "account",
    { displayName: "  ಕುಟುಂಬ Family  ", revision: 1 },
    "PATCH",
  );
  expect(saved.status()).toBe(200);
  expect((await saved.json()).data.user.displayName).toBe("ಕುಟುಂಬ Family");
  expect(
    (
      await update(
        page.request,
        "account",
        { displayName: "Stale", revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(409);
  const row = await database
    .collection("users")
    .findOne({ emailNormalized: account.email });
  expect(row!.profileRevision).toBe(2);
  expect(row!.emailNormalized).toBe(account.email);
});
test("password change rotates the current session, revokes other devices and rejects the old password", async ({
  page,
  browser,
  database,
}) => {
  await onboard(page.request);
  const other = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await mutation(
          other.request,
          "login",
          { email: account.email, password: account.password },
          "other-profile-device",
        )
      ).status(),
    ).toBe(200);
    const changed = await update(page.request, "account/password", {
      currentPassword: account.password,
      newPassword: nextPassword,
      confirmPassword: nextPassword,
      revision: 1,
    });
    expect(changed.status()).toBe(200);
    expect((await page.request.get("/api/v1/auth/me")).status()).toBe(200);
    expect((await other.request.get("/api/v1/auth/me")).status()).toBe(401);
    expect(
      (
        await mutation(
          other.request,
          "login",
          { email: account.email, password: account.password },
          "old-profile-password",
        )
      ).status(),
    ).toBe(401);
    expect(
      (
        await mutation(
          other.request,
          "login",
          { email: account.email, password: nextPassword },
          "new-profile-password",
        )
      ).status(),
    ).toBe(200);
    expect(
      await database
        .collection("weddingMemberships")
        .countDocuments({ status: "ACTIVE" }),
    ).toBe(1);
    const row = await database
      .collection("users")
      .findOne({ emailNormalized: account.email });
    expect(row!.passwordChangedAt).toBeInstanceOf(Date);
    const dto = (await changed.json()).data.user;
    expect("passwordHash" in dto).toBe(false);
    expect("token" in dto).toBe(false);
  } finally {
    await other.close();
  }
});
test("password validation and persisted attempt limits prevent unsafe changes", async ({
  page,
}) => {
  await mutation(page.request, "register", account);
  const input = {
    currentPassword: account.password,
    newPassword: nextPassword,
    confirmPassword: nextPassword,
    revision: 1,
  };
  expect(
    (
      await update(page.request, "account/password", {
        ...input,
        confirmPassword: "different",
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await update(page.request, "account/password", {
        ...input,
        newPassword: "short",
        confirmPassword: "short",
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await update(page.request, "account/password", {
        ...input,
        currentPassword: "Wrong password words",
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await update(page.request, "account/password", {
        ...input,
        newPassword: account.password,
        confirmPassword: account.password,
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await update(page.request, "account/password", {
        ...input,
        currentPassword: "Wrong again",
      })
    ).status(),
  ).toBe(422);
  const blocked = await update(page.request, "account/password", input);
  expect(blocked.status()).toBe(429);
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
});
test("a password change prevents a racing old-password login from retaining access", async ({
  page,
  browser,
}) => {
  await mutation(page.request, "register", account);
  const other = await browser.newContext({ baseURL: origin });
  try {
    const [changed, login] = await Promise.all([
      update(page.request, "account/password", {
        currentPassword: account.password,
        newPassword: nextPassword,
        confirmPassword: nextPassword,
        revision: 1,
      }),
      mutation(
        other.request,
        "login",
        { email: account.email, password: account.password },
        "racing-profile-login",
      ),
    ]);
    expect(changed.status()).toBe(200);
    expect([200, 401]).toContain(login.status());
    expect((await other.request.get("/api/v1/auth/me")).status()).toBe(401);
    expect((await page.request.get("/api/v1/auth/me")).status()).toBe(200);
  } finally {
    await other.close();
  }
});
test("concurrent password changes leave only the winning credential and session active", async ({
  page,
  browser,
  database,
}) => {
  await mutation(page.request, "register", account);
  const other = await browser.newContext({ baseURL: origin });
  try {
    await mutation(
      other.request,
      "login",
      { email: account.email, password: account.password },
      "concurrent-password-device",
    );
    const alternate = "Copper herons orbit velvet 947!";
    const [first, second] = await Promise.all([
      update(page.request, "account/password", {
        currentPassword: account.password,
        newPassword: nextPassword,
        confirmPassword: nextPassword,
        revision: 1,
      }),
      update(other.request, "account/password", {
        currentPassword: account.password,
        newPassword: alternate,
        confirmPassword: alternate,
        revision: 1,
      }),
    ]);
    expect(
      [first.status(), second.status()].filter((status) => status === 200),
    ).toHaveLength(1);
    const winning = first.status() === 200 ? page.request : other.request;
    const losing = first.status() === 200 ? other.request : page.request;
    expect((await winning.get("/api/v1/auth/me")).status()).toBe(200);
    expect((await losing.get("/api/v1/auth/me")).status()).toBe(401);
    expect(
      await database
        .collection("authSessions")
        .countDocuments({ revokedAt: null }),
    ).toBe(1);
  } finally {
    await other.close();
  }
});

for (const width of [390, 1440])
  test(`profile navigation, editing, password controls and drafts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page.request);
    await page.goto("/weddings");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("link", { name: "Your account profile" }).click();
    await expect(page).toHaveURL("/account");
    await expect(page.getByLabel("Account email")).toHaveAttribute(
      "readonly",
      "",
    );
    await page.getByLabel("Your name", { exact: true }).fill("Updated Family");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Name updated.");
    await expect(
      page.getByRole("button", { name: "Account menu" }),
    ).toContainText("Updated Family");
    await page.getByLabel("Your name", { exact: true }).fill("Unsaved name");
    await expect(page.getByText("Name updated.", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole("link", { name: "Make My Event — Your weddings" })
      .click();
    const guard = page.getByRole("dialog", { name: "Leave unsaved changes?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Stay", exact: true }).click();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Unsaved name",
    );
    await page.getByLabel("Your name", { exact: true }).fill("Updated Family");
    await page
      .getByLabel("Current password", { exact: true })
      .fill(account.password);
    await page.getByLabel("New password", { exact: true }).fill(nextPassword);
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("Mismatch");
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(
      page.getByText("Passwords do not match.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill(nextPassword);
    for (const label of [
      "current password",
      "new password",
      "confirm new password",
    ]) {
      await page
        .getByRole("button", { name: `Show ${label}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: `Hide ${label}`, exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Password changed. Other devices have been signed out.",
    );
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveValue("");
    await page
      .getByLabel("Current password", { exact: true })
      .fill(nextPassword);
    await expect(
      page.getByText("Password changed. Other devices have been signed out.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Make My Event — Your weddings", exact: true })
      .click();
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Stay", exact: true }).click();
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveValue(nextPassword);
    await page.getByLabel("Current password", { exact: true }).fill("");
    await page.screenshot({
      path: `.next/profile-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.reload();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Updated Family",
    );
  });
