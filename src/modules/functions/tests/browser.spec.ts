import { test, expect } from "../../auth/tests/fixtures";
import { onboard } from "./fixtures";

for (const width of [390, 1440]) {
  test(`create and edit functions and wedding details at ${width}px`, async ({
    page,
    database,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page.request);
    await page.goto("/wedding/functions");
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    await expect(
      page.getByRole("heading", { name: "Your celebration starts here" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(page.getByLabel("Start date and time")).toBeFocused();
    await expect(
      page.getByText("Enter a date and time.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Function name").fill("Haldi");
    await page.getByLabel("Start date and time").fill("2027-02-17T10:00");
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(
      page.getByText(
        "Choose a time between 2027-02-18 and 2027-02-21 in Asia/Kolkata.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByLabel("Start date and time").fill("2027-02-19T10:00");
    await page.getByLabel("End date and time").fill("2027-02-19T12:00");
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(
      page.getByText("Choose a function color.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "Forest", exact: true }),
    ).toBeFocused();
    await page.getByRole("radio", { name: "Forest", exact: true }).check();
    await page.getByLabel("End date and time").fill("2027-02-19T09:00");
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(page.getByLabel("End date and time")).toBeFocused();
    await page.getByLabel("End date and time").fill("2027-02-19T12:00");
    await page.getByText("Venue and directions", { exact: false }).click();
    await page
      .getByLabel("Venue name", { exact: true })
      .fill("Family courtyard");
    await page.getByLabel("Latitude", { exact: true }).fill("91");
    await page.getByLabel("Longitude", { exact: true }).fill("181");
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(
      page.getByText("Latitude must be between -90 and 90.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Longitude must be between -180 and 180.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Latitude", { exact: true }).fill("12.9");
    await page.getByLabel("Longitude", { exact: true }).fill("77.6");
    await page.getByLabel("Dress code").fill("Yellow festive wear");
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Function saved.");
    await page.getByRole("button", { name: "Edit Haldi", exact: true }).click();
    await expect(page.getByLabel("Start date and time")).toHaveValue(
      "2027-02-19T10:00",
    );
    await expect(
      page.getByRole("radio", { name: "Forest", exact: true }),
    ).toBeChecked();
    await page.getByRole("radio", { name: "Plum", exact: true }).check();
    await page.getByLabel("Function name").fill("Haldi ceremony");
    await page
      .getByRole("button", { name: "Save function", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Haldi ceremony", exact: true }),
    ).toBeVisible();
    expect(await database.collection("functions").countDocuments()).toBe(1);
    expect((await database.collection("functions").findOne({}))!.color).toBe(
      "plum",
    );
    const card = page.locator(".function-tile").filter({
      has: page.getByRole("heading", { name: "Haldi ceremony", exact: true }),
    });
    await expect(card).toHaveCSS("border-top-color", "rgb(128, 97, 141)");
    await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(
      card.getByRole("button", { name: "Edit Haldi ceremony", exact: true }),
    ).toHaveText("Edit");
    await expect(
      card.getByRole("button", { name: "Remove Haldi ceremony", exact: true }),
    ).toHaveText("Remove");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `.next/functions-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Wedding details", exact: true })
      .click();
    await expect(page.getByLabel("Wedding title")).toHaveValue(
      "Pavithra & Manish’s Wedding",
    );
    const description = page.getByLabel("Short description");
    await description.evaluate((element) =>
      element.removeAttribute("maxlength"),
    );
    await description.fill("x".repeat(501));
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(description).toBeFocused();
    await expect(description).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Use at most 500 characters.", { exact: true }),
    ).toBeVisible();
    await description.fill("Our family celebration.");
    await page.getByLabel("Start date").fill("2027-02-20");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText(
        "These wedding dates or time zone would exclude an existing function. Move or remove that function first.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByLabel("Start date").fill("2027-02-18");
    await page
      .getByLabel("Wedding title")
      .fill("Pavithra & Manish’s Celebration");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Wedding details saved.");
    await page.reload();
    await expect(page.getByLabel("Wedding title")).toHaveValue(
      "Pavithra & Manish’s Celebration",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `.next/wedding-details-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Pavithra & Manish’s Celebration" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Functions", exact: true }).click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Remove Haldi ceremony", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Haldi ceremony", exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Remove Haldi ceremony", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Function removed");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your celebration starts here" }),
    ).toBeVisible();
    expect((await database.collection("functions").findOne({}))!.status).toBe(
      "ARCHIVED",
    );
  });
}
