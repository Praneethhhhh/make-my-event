import { weddingRoute } from "../../auth/tests/fixtures";
import { test, expect } from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";
import mongoose from "mongoose";

for (const width of [390, 1440]) {
  test(`team invitation email/revoke and recovery states at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page.request);
    await page.route("**/api/v1/members", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue();
    });
    await page.goto(await weddingRoute(page.request, "team"));
    await expect(
      page.getByRole("region", { name: "Loading team" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Planning is better together" }),
    ).toBeVisible();
    await page.unroute("**/api/v1/members");
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    await page.getByLabel("Invitation delivery").selectOption("EMAIL");
    await page.getByLabel("Recipient email").fill("bad");
    await page
      .locator("form")
      .getByRole("button", { name: "Continue to email", exact: true })
      .click();
    await expect(page.getByLabel("Recipient email")).toBeFocused();
    await expect(
      page.getByText("Enter a valid email address.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Invitation delivery").selectOption("EMAIL");
    await page.getByLabel("Recipient email").fill("invitee@example.invalid");
    await page
      .locator("form")
      .getByRole("button", { name: "Continue to email", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Personalize your invitation" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Invitation email accepted by Resend",
    );
    await expect(
      page.getByRole("button", { name: "Copy link", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Private invitation link", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("invitee@example.invalid", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Private invitation link", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: `.next/team-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("button", {
        name: "Revoke invitation for invitee@example.invalid",
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Revoke invitation for invitee@example.invalid",
      }),
    ).toBeFocused();
    await page
      .getByRole("button", {
        name: "Revoke invitation for invitee@example.invalid",
      })
      .click();
    await page
      .getByRole("button", { name: "Revoke invitation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Planning is better together" }),
    ).toBeVisible();
    expect(
      (await database.collection("membershipInvites").findOne({}))!.revokedAt,
    ).toBeTruthy();
    await page.route("**/api/v1/member-invitations", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Temporarily unavailable" } }),
      }),
    );
    await page.reload();
    await expect(
      page.getByText(
        "Couldn’t load invitations. Your team is still available.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Active team members" }),
    ).toBeVisible();
    await page.unroute("**/api/v1/member-invitations");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Planning is better together" }),
    ).toBeVisible();
  });
}

test("organizer view hides invitation controls", async ({ page, database }) => {
  await onboard(page.request);
  await database
    .collection("weddingMemberships")
    .updateOne({}, { $set: { role: "ORGANIZER" } });
  await page.goto(await weddingRoute(page.request, "team"));
  await expect(
    page.getByText("Only administrators can invite team members.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Invite a team member" }),
  ).toHaveCount(0);
});

test("multi-member team with no pending invitations has the correct empty state", async ({
  page,
  database,
}) => {
  await onboard(page.request);
  const wedding = await database.collection("weddings").findOne({});
  const userId = new mongoose.Types.ObjectId();
  await database.collection("users").insertOne({
    _id: userId,
    displayName: "Family Organizer",
    emailNormalized: "organizer@example.invalid",
    status: "ACTIVE",
  });
  await database.collection("weddingMemberships").insertOne({
    weddingId: wedding!._id,
    userId,
    role: "ORGANIZER",
    status: "ACTIVE",
    joinedAt: new Date(),
  });
  await page.goto(await weddingRoute(page.request, "team"));
  await expect(
    page.getByRole("heading", { name: "No pending invitations" }),
  ).toBeVisible();
  await expect(
    page.getByText("2 active members · 0 pending invitations"),
  ).toBeVisible();
});

test("ambiguous send failure preserves form values and requires reconciliation", async ({
  page,
  database,
}) => {
  await onboard(page.request);
  await page.goto(await weddingRoute(page.request, "team"));
  await page.getByLabel("Invitation delivery").selectOption("EMAIL");
  await page.getByLabel("Recipient email").fill("recover@example.invalid");
  await page
    .getByRole("radio", { name: "Administrator", exact: false })
    .check();
  await page.getByLabel("Invitation expires after").selectOption("24");
  await page.route("**/api/v1/member-invitations", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page
    .getByRole("button", { name: "Continue to email", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(
        "We couldn’t confirm whether the invitation was sent. Refresh invitations before trying again to avoid duplicates.",
      ),
  ).toBeVisible();
  await expect(page.getByLabel("Recipient email")).toHaveValue(
    "recover@example.invalid",
  );
  await expect(page.getByLabel("Invitation expires after")).toHaveValue("24");
  await expect(
    page.getByRole("button", { name: "Send invitation", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/v1/member-invitations");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Refresh invitations before retrying" })
    .click();
  await expect(
    page.getByRole("button", { name: "Send invitation", exact: true }),
  ).toBeEnabled();
  expect(await database.collection("membershipInvites").countDocuments()).toBe(
    0,
  );
});
