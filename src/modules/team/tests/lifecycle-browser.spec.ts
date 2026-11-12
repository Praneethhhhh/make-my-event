import { scopedGet, weddingRoute } from "../../auth/tests/fixtures";
import {
  test,
  expect,
  mutation,
  account,
  origin,
} from "../../auth/tests/fixtures";
import {
  onboard,
  write,
  ceremony,
  profile,
} from "../../functions/tests/fixtures";
import { deliveredCode, deliveredEmail } from "./helpers";
for (const width of [390, 1440]) {
  test(`personalized email, code acceptance and access removal at ${width}px`, async ({
    page,
    browser,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page.request);
    await page.goto(await weddingRoute(page.request, "team"));
    await expect(
      page.getByRole("button", { name: "Remove access for Test Family" }),
    ).toBeDisabled();
    await page.getByLabel("Invitation delivery").selectOption("EMAIL");
    await page.getByLabel("Recipient email").fill("relative@example.invalid");
    await page.getByRole("button", { name: "Continue to email" }).click();
    const composer = page.getByRole("dialog", {
      name: "Personalize your invitation",
    });
    await expect(composer).toBeVisible();
    const placement = await composer.evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const backdrop = getComputedStyle(dialog, "::backdrop");
      return {
        xOffset: Math.abs(rect.x + rect.width / 2 - innerWidth / 2),
        yOffset: Math.abs(rect.y + rect.height / 2 - innerHeight / 2),
        top: rect.top,
        bottom: rect.bottom,
        height: innerHeight,
        blur: backdrop.backdropFilter,
        background: backdrop.backgroundColor,
      };
    });
    expect(placement.xOffset).toBeLessThan(2);
    expect(placement.yOffset).toBeLessThan(2);
    expect(placement.top).toBeGreaterThanOrEqual(15);
    expect(placement.bottom).toBeLessThanOrEqual(placement.height - 15);
    expect(placement.blur).toBe("blur(4px)");
    expect(placement.background).toBe("rgba(32, 42, 41, 0.48)");
    await expect(page.getByLabel("Subject", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Message", { exact: true })).not.toBeEmpty();
    await page
      .getByLabel("Subject", { exact: true })
      .fill("Help us celebrate together");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Hello family!\nPlease help us plan our celebration.");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `.next/team-composer-${width}.png`,
      fullPage: true,
    });
    await composer
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(composer).not.toBeVisible();
    const mail = await deliveredEmail("relative@example.invalid");
    expect(mail.subject).toBe("Help us celebrate together");
    expect(mail.text).toContain("Hello family!");
    const recipient = await browser.newContext({
      baseURL: origin,
      viewport: { width, height: 900 },
      extraHTTPHeaders: { "x-auth-test-ip": `relative-${width}` },
    });
    try {
      await mutation(
        recipient.request,
        "register",
        {
          ...account,
          displayName: "Family Relative",
          email: "relative@example.invalid",
        },
        `relative-${width}`,
      );
      const join = await recipient.newPage();
      await join.goto("/weddings/join");
      await expect(
        join.getByText("relative@example.invalid", { exact: true }),
      ).toBeVisible();
      await join.getByRole("button", { name: "Accept invitation" }).click();
      await expect(join.getByLabel("Invitation code")).toBeFocused();
      await join.getByLabel("Invitation code").fill("invalid00000x");
      await join.getByRole("button", { name: "Accept invitation" }).click();
      await expect(join.locator("p[role=alert]")).toContainText(
        "invalid, expired or unavailable",
      );
      await join.screenshot({
        path: `.next/team-join-${width}.png`,
        fullPage: true,
      });
      expect(
        await join.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await join
        .getByLabel("Invitation code")
        .fill(await deliveredCode("relative@example.invalid"));
      await join.getByRole("button", { name: "Accept invitation" }).click();
      await expect(
        join.getByRole("link", { name: "Open this wedding" }),
      ).toBeVisible();
      await join.getByRole("link", { name: "Open this wedding" }).click();
      await join.getByRole("link", { name: "Team", exact: true }).click();
      await expect(
        join.getByText("Only administrators can invite team members.", {
          exact: false,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Refresh invitations", exact: true })
        .click();
      await expect(
        page.getByText("Family Relative", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Change role for Family Relative" })
        .click();
      const roleDialog = page.getByRole("dialog", { name: "Change team role" });
      await roleDialog
        .getByLabel("Role", { exact: true })
        .selectOption("ADMIN");
      await roleDialog.getByRole("button", { name: "Save role" }).click();
      await expect(page.getByRole("status")).toContainText("Role updated");
      expect((await recipient.request.get("/api/v1/auth/me")).status()).toBe(
        200,
      );
      await mutation(
        recipient.request,
        "login",
        { email: "relative@example.invalid", password: account.password },
        `relative-${width}`,
      );
      await page
        .getByRole("button", { name: "Remove access for Family Relative" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Remove access?" });
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(
        page.getByRole("button", { name: "Remove access for Family Relative" }),
      ).toBeFocused();
      await page
        .getByRole("button", { name: "Remove access for Family Relative" })
        .click();
      await dialog
        .getByRole("button", { name: "Remove access", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Access removed");
      expect(
        (await scopedGet(recipient.request, "/api/v1/wedding")).status(),
      ).toBe(404);
      await join.reload();
      await expect(
        join.getByRole("heading", { name: "Wedding access unavailable" }),
      ).toBeVisible();
      expect(
        await database
          .collection("weddingMemberships")
          .countDocuments({ status: "REMOVED" }),
      ).toBe(1);
    } finally {
      await recipient.close();
    }
  });
  test(`wedding details allow unused date changes and explain excluded functions at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page.request);
    await write(page.request, "functions", ceremony);
    await page.goto(await weddingRoute(page.request, "details"));
    await page.getByLabel("Start date").fill("2027-02-19");
    await page.getByLabel("End date").fill("2027-02-20");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Wedding details saved.");
    await page.getByLabel("Start date").fill("2027-02-20");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.locator("p[role=alert]")).toContainText(
      "exclude an existing function",
    );
    await expect(page.getByLabel("Start date")).toBeFocused();
    expect((await database.collection("weddings").findOne({}))!.startsOn).toBe(
      "2027-02-19",
    );
    await page.getByLabel("Start date").fill(profile.startsOn);
    await page.getByLabel("End date").fill(profile.endsOn);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Wedding details saved.");
  });
}
