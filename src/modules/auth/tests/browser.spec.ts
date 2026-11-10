import { test, expect, account } from "./fixtures";

for (const width of [390, 1440]) {
  test.describe("account flow at " + width + "px", () => {
    test.use({
      viewport: { width, height: 900 },
      extraHTTPHeaders: { "x-auth-test-ip": "browser-client" },
    });
    test("register, refresh, sign out and sign in through the UI", async ({
      page,
      database,
    }) => {
      await page.goto("/");
      await page
        .getByRole("link", { name: "Create an account", exact: true })
        .first()
        .click();
      await page.getByLabel("Your name").fill(account.displayName);
      await page.getByLabel("Email", { exact: true }).fill(account.email);
      const password = page.getByLabel("Password", { exact: true });
      await password.fill(account.password);
      await page.getByRole("button", { name: "Show password" }).click();
      await expect(password).toHaveAttribute("type", "text");
      await expect(password).toHaveValue(account.password);
      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(password).toHaveAttribute("type", "password");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Welcome, Test Family" }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Welcome, Test Family" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page
        .getByRole("link", { name: "Already registered? Sign in" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeEnabled();
      await page.getByLabel("Email", { exact: true }).fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill("wrong");
      await page.getByRole("button", { name: "Show password" }).click();
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        "wrong",
      );
      await expect(
        page.getByLabel("Password", { exact: true }),
      ).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "Hide password" }).click();
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText(
        "Invalid email or password.",
      );
      await page.getByLabel("Password", { exact: true }).fill(account.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Welcome, Test Family" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
      expect(await database.collection("users").countDocuments()).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    });

    test("field validation, keyboard access and reduced motion", async ({
      page,
      database,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/register");
      await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
      ).toBeEnabled();
      await page.getByLabel("Your name").fill("123");
      await page.getByLabel("Email", { exact: true }).fill("bad");
      await page
        .getByLabel("Password", { exact: true })
        .fill("aaaaaaaaaaaaaaa");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await expect(page.getByLabel("Your name")).toBeFocused();
      await expect(page.getByLabel("Your name")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(
        page.getByLabel("Password", { exact: true }),
      ).toHaveAttribute("aria-invalid", "true");
      await page.getByLabel("Your name").fill(account.displayName);
      await page.getByLabel("Email", { exact: true }).fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill(account.password);
      await expect(page.getByLabel("Your name")).toHaveAttribute(
        "aria-invalid",
        "false",
      );
      await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "false",
      );
      await expect(
        page.getByLabel("Password", { exact: true }),
      ).toHaveAttribute("aria-invalid", "false");
      await expect(
        page.getByText("Password strength looks good."),
      ).toBeVisible();
      await expect(
        page.getByText("Choose a less predictable password."),
      ).toHaveCount(0);
      await page.getByLabel("Your name").fill(account.password);
      await expect(
        page.getByText(
          "Choose a less predictable password. Try several unrelated words.",
        ),
      ).toBeVisible();
      await page.getByLabel("Your name").fill(account.displayName);
      await expect(
        page.getByText("Password strength looks good."),
      ).toBeVisible();
      const toggle = page.getByRole("button", { name: "Show password" });
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByLabel("Password", { exact: true }),
      ).toHaveAttribute("type", "text");
      expect(
        await page
          .locator(".account-panel")
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe("none");
      expect(await database.collection("users").countDocuments()).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    });
  });
}
test("network failure is recoverable and double submission is prevented", async ({
  page,
  database,
}) => {
  await page.goto("/register");
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Your name").fill(account.displayName);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  let calls = 0;
  await page.route("**/api/v1/auth/register", async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.abort();
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Please wait…" }),
  ).toBeDisabled();
  await page.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Could not reach",
  );
  await page.getByLabel("Your name").fill("Updated Test Family");
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  expect(calls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeEnabled();
  expect(await database.collection("users").countDocuments()).toBe(0);
});
