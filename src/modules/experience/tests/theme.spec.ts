import { test, expect } from "../../auth/tests/fixtures";

test("appearance persists, ignores OS changes, syncs tabs and preserves drafts", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("draft@example.invalid");
  const trigger = page.getByRole("button", {
    name: "Choose color theme",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("group", { name: "Color theme", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  async function choose(label: string) {
    await trigger.click();
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await choose("Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "draft@example.invalid",
  );
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("mme-theme"))).toBe(
    "dark",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const second = await page.context().newPage();
  await second.goto("/register");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await choose("Light");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Choose color theme", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "System", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await second.close();
});

test("saved dark theme paints before hydration with readable semantic contrast", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("mme-theme", "dark"));
  await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(18, 26, 23)",
  );
  const colors = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      [
        "text",
        "text-muted",
        "surface",
        "canvas",
        "primary",
        "on-primary",
        "danger",
        "danger-surface",
      ].map((name) => [name, css.getPropertyValue("--color-" + name).trim()]),
    );
  });
  function luminance(hex: string) {
    const channels = hex
      .replace("#", "")
      .match(/../g)!
      .map((value) => {
        const n = parseInt(value, 16) / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
    return (
      channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    );
  }
  function contrast(a: string, b: string) {
    const x = luminance(colors[a]!),
      y = luminance(colors[b]!);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  expect(contrast("text", "canvas")).toBeGreaterThan(7);
  expect(contrast("text-muted", "surface")).toBeGreaterThan(4.5);
  expect(contrast("on-primary", "primary")).toBeGreaterThan(4.5);
  expect(contrast("danger", "danger-surface")).toBeGreaterThan(4.5);
});

test("theme selection stays usable when storage is blocked", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Blocked");
    };
  });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Choose color theme", exact: true })
    .click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(failures).toEqual([]);
});

for (const mode of ["light", "dark"] as const) {
  for (const width of [390, 1440]) {
    test(`transparent landing artwork in ${mode} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.addInitScript(
        (theme) => localStorage.setItem("mme-theme", theme),
        mode,
      );
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      for (const selector of [".hero-artwork", ".closing-artwork img"]) {
        const image = page.locator(selector);
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        await expect(image).toHaveCSS("filter", "none");
        await expect(image).toHaveCSS("mix-blend-mode", "normal");
        await expect(image).toHaveAttribute("src", /transparent.*\.png/);
      }
      await expect(page.locator(".closing-artwork")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await page.locator(".hero-artwork").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `playwright-report/transparent-artwork/${mode}-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}
