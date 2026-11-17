import { test, expect } from "../../auth/tests/fixtures";
import { setup, scopedGet } from "./fixtures";
for (const width of [390, 1440])
  test(`guest invitation lifecycle and responsive UI at ${width}px`, async ({
    page,
    database,
    browser,
  }) => {
    void database;
    test.setTimeout(120000);
    await page.setExtraHTTPHeaders({ "x-auth-test-ip": "guest-browser" });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 960 });
    const { wedding } = await setup(page.request),
      prefix = `/weddings/${wedding.id}`;
    async function capture(name: string, current = page) {
      expect(
        await current.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await current.screenshot({
        path: `playwright-report/guest-invitations/${name}-${width}.png`,
        fullPage: !(await current.locator("dialog:modal").count()),
        animations: "disabled",
      });
    }
    await page.goto(`${prefix}/guests`);
    await expect(
      page.getByRole("heading", {
        name: "Your guest list starts here",
        exact: true,
      }),
    ).toBeVisible();
    await capture("empty-directory");
    const inviteButton = page.getByRole("button", {
      name: "Invite guest",
      exact: true,
    });
    await inviteButton.focus();
    await expect(inviteButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Recipient name", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(inviteButton).toBeFocused();

    await page
      .getByRole("button", { name: "Invite guest", exact: true })
      .click();
    await page
      .getByLabel("Recipient name", { exact: true })
      .fill("Draft family");
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("alertdialog", { name: "Discard this draft?" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(
      page.getByLabel("Recipient name", { exact: true }),
    ).toHaveValue("Draft family");
    await page
      .getByLabel("Recipient name", { exact: true })
      .fill("Elon Musk & family");
    await page
      .getByLabel("Personalized message", { exact: false })
      .fill("We would love to celebrate with you.");
    await capture("invite-editor");
    await page
      .getByRole("button", { name: "Create invitation", exact: true })
      .click();
    await expect(page.locator(".guest-detail > h2")).toHaveText(
      "Elon Musk & family",
    );
    await capture("recipient-details");
    await page
      .getByRole("button", { name: "Copy private link", exact: true })
      .click();
    await expect(
      page.getByText("Private link copied.", { exact: true }),
    ).toBeVisible();
    const url = await page
      .getByLabel("Private link", { exact: true })
      .inputValue();
    expect(url).toContain("/invite#token=");
    const visitor = await browser.newContext({
      baseURL: "http://127.0.0.1:3100",
      viewport: { width, height: 960 },
      extraHTTPHeaders: { "x-auth-test-ip": "guest-visitor" },
    });
    try {
      const guest = await visitor.newPage();
      await guest.goto(url);
      await expect(
        guest.getByRole("heading", { name: /Pavithra.*Manish/, level: 1 }),
      ).toBeVisible();
      await expect(guest.locator(".invitation-function")).toHaveCount(2);
      expect(await guest.locator("img").count()).toBe(0);
      await expect(
        guest.getByText(/Maximum people|Party allocation/),
      ).toHaveCount(0);
      const haldi = guest.locator(".invitation-function").filter({
        has: guest.getByRole("heading", { name: "Haldi", exact: true }),
      });
      await haldi
        .getByRole("button", { name: "Will attend", exact: true })
        .click();
      await haldi.getByRole("spinbutton").fill("5");
      await guest
        .getByRole("button", { name: "Refresh invitation", exact: true })
        .click();
      await expect(guest.getByRole("dialog")).toBeVisible();
      await guest
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await expect(haldi.getByRole("spinbutton")).toHaveValue("5");
      await haldi
        .getByRole("button", { name: "Save response", exact: true })
        .click();
      await expect(haldi.getByRole("alert")).toContainText(
        "Please choose fewer people",
      );
      await expect(haldi.getByRole("spinbutton")).toHaveValue("5");
      await haldi.getByRole("spinbutton").fill("3");
      await haldi
        .getByRole("button", { name: "Save response", exact: true })
        .click();
      await expect(
        haldi.getByText("Response saved.", { exact: true }),
      ).toBeVisible();
      await expect(
        haldi.getByText("Attending · 3", { exact: true }),
      ).toBeVisible();
      const sangeet = guest.locator(".invitation-function").filter({
        has: guest.getByRole("heading", { name: "Sangeet", exact: true }),
      });
      await sangeet
        .getByRole("button", { name: "Cannot attend", exact: true })
        .click();
      await expect(sangeet.getByRole("spinbutton")).toHaveCount(0);
      await sangeet
        .getByRole("button", { name: "Save response", exact: true })
        .click();
      await expect(
        sangeet.getByText("Not attending", { exact: true }),
      ).toBeVisible();
      await sangeet.getByRole("button", { name: /Venue & directions/ }).click();
      await expect(
        sangeet.getByRole("link", { name: /Open in Google Maps/ }),
      ).toHaveAttribute("target", "_blank");
      await capture("guest-page", guest);
      await page
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await page.reload();
      await expect(
        page
          .locator(".guest-summary-row")
          .filter({ hasText: "Haldi" })
          .locator(".guest-people dd"),
      ).toHaveText("3");
      await expect(
        page.getByRole("button", {
          name: "View invitation for Elon Musk & family",
        }),
      ).toBeVisible();
      await capture("directory");
      await page
        .getByRole("button", { name: "View invitation for Elon Musk & family" })
        .click();
      await page
        .getByRole("button", { name: "Correct response", exact: true })
        .first()
        .click();
      await page
        .locator(".guest-correction")
        .getByLabel("People attending", { exact: true })
        .fill("4");
      await page
        .getByLabel("Reason for correction", { exact: true })
        .fill("Confirmed with the family");
      await page
        .getByRole("button", { name: "Save correction", exact: true })
        .click();
      await expect(
        page.getByText(
          "Response corrected. The reason is retained in history.",
          { exact: true },
        ),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Preview guest page", exact: true })
        .click();
      await expect(
        page.getByText("Preview only — responses are not saved.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Will attend", exact: true }).first(),
      ).toBeDisabled();
      await capture("organizer-preview");
      await page
        .getByRole("link", { name: "Back to guests", exact: false })
        .click();
      await page
        .getByRole("button", { name: "View invitation for Elon Musk & family" })
        .click();
      await page.locator(".guest-more > summary").click();
      await page
        .getByRole("button", { name: "Remove invitation", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm change", exact: true })
        .click();
      await expect(
        page.getByText("Invitation removed. Response history is retained.", {
          exact: true,
        }),
      ).toBeVisible();
      await guest.reload();
      await expect(
        guest.getByRole("heading", {
          name: "Your invitation is unavailable",
          exact: true,
        }),
      ).toBeVisible();
      await capture("unavailable", guest);
      await page
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Your guest list starts here",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "View removed invitations", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Elon Musk & family", exact: true }),
      ).toBeVisible();
      expect(
        (await (await scopedGet(page.request, "/api/v1/guests/summary")).json())
          .data.functions[0].people,
      ).toBe(0);
    } finally {
      await visitor.close();
    }
  });
