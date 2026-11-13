import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect, origin, creationKey } from "../../auth/tests/fixtures";
import {
  onboard,
  profile,
  ceremony,
  write,
} from "../../functions/tests/fixtures";
import { weddingOwnedCollections } from "../wedding-deletion";
import type { APIRequestContext } from "@playwright/test";

async function call(
  api: APIRequestContext,
  path: string,
  data: unknown,
  id?: string,
  method = "DELETE",
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.fetch(`/api/v1/${path}`, {
    method,
    data,
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "Idempotency-Key": randomUUID(),
      ...(id ? { "X-Wedding-Id": id } : {}),
    },
  });
}
test("deletion waits for invitation delivery and prevents sends after deletion", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  const { emailMockUrl } = JSON.parse(
    await readFile(".next/auth-test-db.json", "utf8"),
  );
  const pending = call(
    page.request,
    "member-invitations",
    {
      deliveryMethod: "EMAIL",
      intendedEmail: "held-delivery@example.invalid",
      role: "ORGANIZER",
      expiresInHours: 48,
    },
    wedding.id,
    "POST",
  );
  try {
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(emailMockUrl + "/__delivery-status")
            ).json()
          ).processing,
      )
      .toBe(true);
    const blocked = await call(
      page.request,
      "wedding",
      { revision: 1, confirmationTitle: wedding.title },
      wedding.id,
    );
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error.code).toBe(
      "INVITATION_DELIVERY_IN_PROGRESS",
    );
    expect(blocked.headers()["retry-after"]).toBe("5");
    expect(await database.collection("weddings").countDocuments()).toBe(1);
    expect(
      await database
        .collection("emailOutbox")
        .countDocuments({ status: "PROCESSING" }),
    ).toBe(1);
  } finally {
    await page.request.get(emailMockUrl + "/__delivery-release");
  }
  expect((await pending).status()).toBe(201);
  expect(
    (
      await call(
        page.request,
        "wedding",
        { revision: 1, confirmationTitle: wedding.title },
        wedding.id,
      )
    ).status(),
  ).toBe(204);
  expect(await database.collection("emailOutbox").countDocuments()).toBe(0);
  expect(await database.collection("membershipInvites").countDocuments()).toBe(
    0,
  );
  expect(
    (
      await call(
        page.request,
        "member-invitations",
        {
          deliveryMethod: "EMAIL",
          intendedEmail: "held-delivery@example.invalid",
          role: "ORGANIZER",
          expiresInHours: 48,
        },
        wedding.id,
        "POST",
      )
    ).status(),
  ).toBe(404);
});
test("permanent deletion cascades only the selected wedding and retains account access", async ({
  page,
  database,
}) => {
  const a = await onboard(page.request);
  const originalCreationKey = creationKey(page.request);
  const bResponse = await call(
    page.request,
    "weddings",
    { ...profile, title: "Other family wedding" },
    undefined,
    "POST",
  );
  expect(bResponse.status()).toBe(201);
  const b = (await bResponse.json()).data.wedding;
  const row = await database.collection("weddings").findOne({ title: a.title });
  const other = await database
    .collection("weddings")
    .findOne({ title: b.title });
  for (const collection of weddingOwnedCollections.filter(
    (n) => !["photos", "weddingMemberships", "idempotencyRecords"].includes(n),
  )) {
    await database.collection(collection).insertMany([
      {
        weddingId: row!._id,
        fixture: true,
        dedupeKey: randomUUID(),
        provider: "fixture-a",
        scope: randomUUID(),
      },
      {
        weddingId: other!._id,
        fixture: true,
        dedupeKey: randomUUID(),
        provider: "fixture-b",
        scope: randomUUID(),
      },
    ]);
  }
  const result = await call(
    page.request,
    "wedding",
    { revision: a.revision, confirmationTitle: a.title },
    a.id,
  );
  expect(result.status()).toBe(204);
  for (const name of weddingOwnedCollections)
    expect(
      await database.collection(name).countDocuments({ weddingId: row!._id }),
    ).toBe(0);
  expect(
    await database.collection("weddings").countDocuments({ _id: row!._id }),
  ).toBe(0);
  expect(
    await database.collection("weddings").countDocuments({ _id: other!._id }),
  ).toBe(1);
  expect(await database.collection("users").countDocuments()).toBe(1);
  expect((await page.request.get("/api/v1/auth/me")).status()).toBe(200);
  const csrf = await page.request.get("/api/v1/auth/csrf");
  const replay = await page.request.post("/api/v1/weddings", {
    data: profile,
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "Idempotency-Key": originalCreationKey,
    },
  });
  expect(replay.status()).toBe(409);
  const cards = (await (await page.request.get("/api/v1/weddings")).json())
    .data;
  expect(cards.map((card: { id: string }) => card.id)).toEqual([b.id]);
  expect(
    (
      await page.request.get("/api/v1/functions", {
        headers: { "X-Wedding-Id": a.id },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get("/api/v1/functions", {
        headers: { "X-Wedding-Id": b.id },
      })
    ).status(),
  ).toBe(200);
});
test("deletion rejects missing CSRF, wrong title, stale revision and organizer permissions", async ({
  page,
  database,
  browser,
}) => {
  const a = await onboard(page.request);
  expect(
    (
      await page.request.delete("/api/v1/wedding", {
        headers: { Origin: origin, "X-Wedding-Id": a.id },
        data: { revision: 1, confirmationTitle: a.title },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await call(
        page.request,
        "wedding",
        { revision: 1, confirmationTitle: "Wrong wedding" },
        a.id,
      )
    ).status(),
  ).toBe(409);
  expect(
    (
      await call(
        page.request,
        "wedding",
        { revision: 99, confirmationTitle: a.title },
        a.id,
      )
    ).status(),
  ).toBe(409);
  const foreign = await browser.newContext({ baseURL: origin });
  try {
    await onboard(foreign.request, "other-deleter@example.invalid");
    expect(
      (
        await call(
          foreign.request,
          "wedding",
          { revision: 1, confirmationTitle: a.title },
          a.id,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await foreign.close();
  }
  const wedding = await database
    .collection("weddings")
    .findOne({ title: a.title });
  await database
    .collection("weddingMemberships")
    .updateMany({ weddingId: wedding!._id }, { $set: { role: "ORGANIZER" } });
  expect(
    (
      await call(
        page.request,
        "wedding",
        { revision: 1, confirmationTitle: a.title },
        a.id,
      )
    ).status(),
  ).toBe(403);
  expect(
    await database.collection("weddings").countDocuments({ _id: wedding!._id }),
  ).toBe(1);
  await page.goto(`/weddings/${a.id}/details`);
  await expect(page.getByLabel("Wedding title")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete wedding", exact: true }),
  ).toHaveCount(0);
});
test("deletion serializes against a concurrent function save without leaving orphan records", async ({
  page,
  database,
}) => {
  const a = await onboard(page.request);
  const [removed, saved] = await Promise.all([
    call(
      page.request,
      "wedding",
      { revision: 1, confirmationTitle: a.title },
      a.id,
    ),
    write(page.request, "functions", ceremony),
  ]);
  expect(removed.status()).toBe(204);
  expect([201, 404]).toContain(saved.status());
  expect(await database.collection("functions").countDocuments()).toBe(0);
  expect(await database.collection("weddingMemberships").countDocuments()).toBe(
    0,
  );
});
test("deletion refuses media records until object cleanup is implemented", async ({
  page,
  database,
}) => {
  const a = await onboard(page.request);
  const row = await database.collection("weddings").findOne({ title: a.title });
  await database
    .collection("photos")
    .insertOne({ weddingId: row!._id, objectKey: "test-only-object" });
  expect(
    (
      await call(
        page.request,
        "wedding",
        { revision: 1, confirmationTitle: a.title },
        a.id,
      )
    ).status(),
  ).toBe(409);
  expect(await database.collection("weddings").countDocuments()).toBe(1);
});
for (const width of [390, 1440])
  test(`account menu and confirmed deletion at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const a = await onboard(page.request);
    await page.goto(`/weddings/${a.id}/details`);
    const account = page.getByRole("button", { name: "Account menu" });
    await account.click();
    const menu = page.getByRole("navigation", { name: "Choose wedding" });
    await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(
      menu.getByRole("link", { name: new RegExp(a.title) }),
    ).toContainText("Administrator · Current");
    const menuBox = await menu.boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `.next/account-menu-${width}.png`,
      animations: "disabled",
    });
    await expect(
      menu.getByRole("link", { name: "Join with code" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(account).toBeFocused();
    await page
      .getByRole("link", { name: "Make My Event — Your weddings" })
      .click();
    await expect(page).toHaveURL("/weddings");
    await page.getByRole("link", { name: "Open wedding", exact: true }).click();
    await page
      .getByRole("link", { name: "Wedding details", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete wedding", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Delete this wedding?" });
    await expect(
      dialog.getByRole("button", { name: "Delete wedding permanently" }),
    ).toBeDisabled();
    await page
      .getByLabel(`Type ${a.title} to confirm`)
      .fill("Different wedding");
    await expect(
      dialog.getByRole("button", { name: "Delete wedding permanently" }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await database.collection("weddings").countDocuments()).toBe(1);
    await page
      .getByRole("button", { name: "Delete wedding", exact: true })
      .click();
    await page.getByLabel(`Type ${a.title} to confirm`).fill(a.title);
    const box = await dialog.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(2);
    await expect(
      dialog.getByRole("button", { name: "Delete wedding permanently" }),
    ).toBeEnabled();
    await page.screenshot({
      path: `.next/delete-dialog-${width}.png`,
      animations: "disabled",
    });
    await page.route("**/api/v1/wedding", (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({
            status: 503,
            json: { error: { message: "Deletion unavailable. Try again." } },
          })
        : route.continue(),
    );
    await dialog
      .getByRole("button", { name: "Delete wedding permanently" })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Deletion unavailable. Try again.",
    );
    await expect(page.getByLabel(`Type ${a.title} to confirm`)).toHaveValue(
      a.title,
    );
    await page.unroute("**/api/v1/wedding");
    await dialog
      .getByRole("button", { name: "Delete wedding permanently" })
      .click();
    await expect(page).toHaveURL("/weddings");
    expect(await database.collection("weddings").countDocuments()).toBe(0);
    await account.click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("link", { name: "Sign In", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".hero-artwork")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `.next/premium-landing-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".hero-copy")
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
  });
