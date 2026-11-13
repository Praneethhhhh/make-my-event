import { test, expect, origin } from "../../auth/tests/fixtures";

for (const screen of [
  { width: 1536, height: 740, scale: 1.25 },
  { width: 1920, height: 900, scale: 1 },
]) {
  test(`hero paints on a fresh ${screen.width}px load without resizing`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.scale,
    });
    try {
      const page = await context.newPage();
      await page.goto(origin + "/", { waitUntil: "networkidle" });
      const hero = page.locator(".hero-artwork");
      await hero.evaluate((image) => (image as HTMLImageElement).decode());
      await expect(hero).toHaveAttribute(
        "src",
        "/images/celebration-pixels.jpg",
      );
      await expect(hero).toHaveAttribute("loading", "eager");
      await expect(page.locator(".hero-visual")).toHaveCSS(
        "animation-name",
        "none",
      );
      await expect(hero).toHaveCSS("object-fit", "contain");
      // A viewport screenshot deliberately avoids full-page resizing and animation suppression.
      await page.screenshot({
        path: `.next/cold-production-hero-${screen.width}.png`,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    } finally {
      await context.close();
    }
  });
}

for (const width of [390, 1440]) {
  test(`supplied artwork composition and navigation feedback at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const hero = page.locator(".hero-artwork");
    const palace = page.locator(".palace-scene img");
    const closing = page.locator(".closing-artwork img");
    for (const image of [hero, palace, closing]) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate(
            (element) => (element as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
    }
    await expect(hero).toHaveAttribute("src", /celebration-pixels/);
    await expect(palace).toHaveAttribute("src", /palace-celebration/);
    await expect(closing).toHaveAttribute("src", /wedding-pixels/);
    const frame = await palace.boundingBox();
    expect(frame!.width / frame!.height).toBeCloseTo(1200 / 896, 1);
    const heroFit = await hero.evaluate((element) => ({
      fit: getComputedStyle(element).objectFit,
      position: getComputedStyle(element).objectPosition,
    }));
    expect(heroFit).toEqual({ fit: "contain", position: "50% 50%" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.evaluate(() => document.fonts.ready);
    await page
      .getByRole("heading", { name: /Every moment/ })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.next/supplied-artwork-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Sign In", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.locator(".route-arrival")).toHaveCSS(
      "animation-name",
      "route-arrival",
    );
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("draft-kept-during-animation");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveValue("draft-kept-during-animation");
    await expect(password).toHaveAttribute("type", "text");
    if (width === 1440)
      expect(
        await page
          .locator("aside")
          .evaluate((element) => getComputedStyle(element).backgroundImage),
      ).toContain("celebration-pixels");
    await page.screenshot({
      path: `.next/supplied-artwork-signin-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("link", { name: /Back to home/ }).click();
    await expect(hero).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Every moment/ }),
    ).toBeVisible();
  });
}
test("reduced motion disables entry, navigation and press animations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Every moment/ }),
  ).toBeVisible();
  await expect(page.locator(".route-arrival")).toHaveCSS("display", "none");
  await expect(page.locator(".hero-artwork")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === "running").length,
    ),
  ).toBe(0);
  await page.getByRole("link", { name: "Sign In", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.locator(".route-arrival")).toHaveCSS("display", "none");
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === "running").length,
    ),
  ).toBe(0);
});
