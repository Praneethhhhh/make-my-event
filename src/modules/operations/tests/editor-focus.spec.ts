import { test, expect } from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";
for (const width of [390, 1440]) {
  test(`finance editor restores trigger focus at ${width}px`, async ({
    page,
    database,
  }) => {
    void database;
    await page.setViewportSize({ width, height: 960 });
    const wedding = await onboard(page.request);
    await page.goto(`/weddings/${wedding.id}/finance`);
    const add = page.getByRole("button", { name: "Add entry", exact: true });
    const panel = page.getByRole("dialog", { name: "Edit wedding record" });
    await add.click();
    await expect(panel).toBeVisible();
    await panel
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(add).toBeFocused();
    await add.click();
    await page.getByLabel("Description", { exact: true }).fill("Unsaved draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const guard = page.getByRole("alertdialog", {
      name: "Discard this draft?",
    });
    await expect(guard).toBeVisible();
    await guard
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Unsaved draft",
    );
    expect(
      await panel.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await guard
      .getByRole("button", { name: "Discard draft", exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await expect(add).toBeFocused();
    expect(await database.collection("expenses").countDocuments()).toBe(0);
  });
}
