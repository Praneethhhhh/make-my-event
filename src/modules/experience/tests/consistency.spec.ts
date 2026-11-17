import { randomUUID } from "node:crypto";
import type { Page, Locator } from "@playwright/test";
import { test, expect } from "../../auth/tests/fixtures";
import { setup, invite, reveal } from "../../guests/tests/fixtures";
import { write } from "../../operations/tests/fixtures";

for (const mode of ["light", "dark"] as const)
  for (const width of [390, 1440])
    test(`consistent presentation across canonical routes in ${mode} at ${width}px`, async ({
      page,
      browser,
      database,
    }) => {
      void database;
      test.setTimeout(240000);
      await page.setViewportSize({ width, height: 960 });
      await page.addInitScript(
        (preference) => localStorage.setItem("mme-theme", preference),
        mode,
      );
      const { wedding, fn } = await setup(page.request),
        prefix = `/weddings/${wedding.id}`;
      const task = await write(page.request, "tasks", {
        title: "Confirm family flowers",
        description: "Confirm the arrival time with the florist.",
        weddingTimeZone: "Asia/Kolkata",
        assigneeType: "USER",
        status: "TODO",
        priority: "NORMAL",
        functionId: fn.id,
      });
      expect(task.status()).toBe(201);
      const taskId = (await task.json()).data.id;
      expect(
        (
          await write(page.request, `tasks/${taskId}/comments`, {
            body: "We will confirm the delivery tomorrow.",
            mentionedUserIds: [],
            mentionRanges: [],
            creationKey: randomUUID(),
          })
        ).status(),
      ).toBe(201);
      expect(
        (
          await write(page.request, "vendors", {
            name: "Family florist",
            category: "Flowers",
            phones: ["+919876543210"],
            color: "rose",
            status: "ACTIVE",
            internalNotes: "Arrival at the courtyard.",
          })
        ).status(),
      ).toBe(201);
      expect(
        (
          await write(page.request, "finance/expenses", {
            description: "Courtyard flowers",
            category: "Decor",
            amountPaise: 100000,
            currency: "INR",
            creationKey: randomUUID(),
          })
        ).status(),
      ).toBe(201);
      const invitation = await invite(page.request, [fn]),
        link = await reveal(page.request, invitation);
      async function capture(current: Page, name: string, ready: Locator) {
        await expect(ready.first()).toBeVisible();
        await current.evaluate(() => document.fonts.ready);
        await expect(current.locator("html")).toHaveAttribute(
          "data-theme",
          mode,
        );
        if (mode === "dark") {
          const brightPanels = await current
            .locator(
              ".operations-panel:visible,.team-panel:visible,.guest-directory-row:visible,.invitation-paper:visible,.wedding-card:visible,.account-panel:visible,.workspace-nav:visible,.finance-row:visible",
            )
            .evaluateAll((elements) =>
              elements
                .filter(
                  (el) =>
                    getComputedStyle(el).backgroundColor ===
                    "rgb(255, 255, 255)",
                )
                .map((el) => el.className),
            );
          expect(brightPanels, name + " dark surfaces").toEqual([]);
        }
        expect(
          await current.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          name + " overflow",
        ).toBe(true);
        const wrong = await current
          .locator(
            "button:visible,input:visible,select:visible,textarea:visible",
          )
          .evaluateAll((elements) =>
            elements
              .filter(
                (el) => !getComputedStyle(el).fontFamily.includes("Manrope"),
              )
              .map((el) => ({
                tag: el.tagName,
                text: el.textContent?.slice(0, 30),
                font: getComputedStyle(el).fontFamily,
              })),
          );
        expect(wrong, name + " control fonts").toEqual([]);
        if (width === 390) {
          const smallInputs = await current
            .locator(
              'input:visible:not([type="checkbox"]):not([type="radio"]),select:visible,textarea:visible',
            )
            .evaluateAll((elements) =>
              elements
                .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
                .map((el) => ({
                  tag: el.tagName,
                  size: getComputedStyle(el).fontSize,
                })),
            );
          expect(smallInputs, name + " mobile field size").toEqual([]);
        }

        const logo = current.locator(".brand-wordmark:visible");
        if (await logo.count()) {
          expect(
            await logo
              .first()
              .evaluate((el) => getComputedStyle(el).fontFamily),
          ).toContain("Newsreader");
          await expect(logo.first()).toHaveText("Make My Event");
          expect(
            await logo
              .first()
              .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
          ).toBeGreaterThanOrEqual(18);
        }
        await current.screenshot({
          path: `playwright-report/consistency/${mode}/${name}-${width}.png`,
          fullPage: false,
          animations: "disabled",
        });
      }
      const routes: [string, string, string][] = [
        ["weddings", "/weddings", "Your weddings"],
        ["new", "/weddings/new", "Create your wedding"],
        ["join", "/weddings/join", "Join your organizing team"],
        ["account", "/account", "Your account"],
        ["dashboard", prefix, wedding.title],
        ["functions", prefix + "/functions", "Wedding functions"],
        ["tasks", prefix + "/tasks", "Tasks"],
        ["task-details", prefix + "/tasks/" + taskId, "Confirm family flowers"],
        ["vendors", prefix + "/vendors", "Vendors"],
        ["finance", prefix + "/finance", "Finance"],
        ["team", prefix + "/team", "Your organizing team"],
        ["details", prefix + "/details", "Wedding details"],
        ["notifications", prefix + "/notifications", "Notifications"],
        ["guests", prefix + "/guests", "Guest invitations"],
      ];
      for (const [name, path, heading] of routes) {
        await page.goto(path);
        if (name === "weddings")
          await expect(
            page.locator(".wedding-choice-card").first(),
          ).toBeVisible();
        if (name === "join")
          await expect(
            page.getByLabel("Invitation code", { exact: true }),
          ).toBeVisible();
        if (name === "finance")
          await expect(
            page.getByRole("heading", {
              name: "Courtyard flowers",
              exact: true,
            }),
          ).toBeVisible();
        if (name === "notifications")
          await expect(
            page.getByText("Confirm family flowers", { exact: true }),
          ).toBeVisible();
        if (name === "account")
          await expect(
            page.getByLabel("Your name", { exact: true }),
          ).toHaveValue("Test Family");
        if (name === "functions")
          await expect(page.getByLabel("Function name")).toBeVisible();
        if (name === "tasks")
          await expect(
            page.getByRole("heading", {
              name: "Confirm family flowers",
              exact: true,
            }),
          ).toBeVisible();
        if (name === "vendors")
          await expect(
            page.getByRole("heading", { name: "Family florist", exact: true }),
          ).toBeVisible();
        if (name === "team")
          await expect(
            page.getByRole("heading", {
              name: "Active team members",
              exact: true,
            }),
          ).toBeVisible();
        if (name === "guests")
          await expect(
            page.getByRole("heading", {
              name: "Elon Musk & family",
              exact: true,
            }),
          ).toBeVisible();
        await capture(
          page,
          name,
          page.getByRole("heading", { name: heading, exact: true, level: 1 }),
        );
        if (name === "dashboard") {
          await page.getByRole("button", { name: "Account menu" }).click();
          await expect(
            page.getByRole("link", { name: "Your account profile" }),
          ).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(
            page.getByRole("button", { name: "Account menu" }),
          ).toBeFocused();
          if (width < 961) {
            await page.getByRole("button", { name: "Wedding menu" }).click();
            await expect(
              page.getByRole("dialog", { name: "Wedding navigation" }),
            ).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(
              page.getByRole("button", { name: "Wedding menu" }),
            ).toBeFocused();
          }
        }
        if (name === "tasks") {
          const choicesPattern = /\/api\/v1\/operations\?view=choices/;
          let releaseChoices = () => {};
          const choicesGate = new Promise<void>((resolve) => {
            releaseChoices = resolve;
          });
          await page.route(choicesPattern, async (route) => {
            await choicesGate;
            await route.continue();
          });
          try {
            await page
              .getByRole("button", { name: "New task", exact: true })
              .click();
            const loading = page.locator('.record-picker small[role="status"]');
            await expect(loading.first()).toBeVisible();
            await expect(loading.first()).toHaveCSS(
              "color",
              mode === "dark" ? "rgb(177, 189, 180)" : "rgb(90, 102, 100)",
            );
          } finally {
            releaseChoices();
          }
          await expect(
            page.locator('.record-picker select[aria-busy="true"]'),
          ).toHaveCount(0);
          await expect(
            page.locator('.record-picker small[role="status"]'),
          ).toHaveCount(0);
          await page.unroute(choicesPattern);
          await capture(page, "task-editor", page.getByRole("dialog"));
          await page
            .getByRole("button", { name: "Close editor", exact: true })
            .click();
        }
        if (name === "finance") {
          await expect(
            page.getByRole("heading", {
              name: "Courtyard flowers",
              exact: true,
            }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Add entry", exact: true })
            .click();
          await capture(page, "finance-editor", page.getByRole("dialog"));
          await page
            .getByRole("button", { name: "Close editor", exact: true })
            .click();
        }
      }
      for (const query of ["", `?recipient=${invitation.id}`]) {
        await page.goto(prefix + "/guests/preview" + query);
        await capture(
          page,
          query ? "recipient-preview" : "master-preview",
          page.getByRole("heading", { name: /Pavithra.*Manish/, level: 1 }),
        );
      }
      await page.goto("/weddings/000000000000000000000000/functions");
      await capture(
        page,
        "access-unavailable",
        page.getByRole("heading", { name: "Wedding access unavailable" }),
      );
      const aliases = [
        "/wedding",
        "/wedding/created",
        "/wedding/functions",
        "/wedding/details",
        "/wedding/team",
      ];
      for (const path of aliases) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/weddings$/);
      }
      await page.goto("/wedding/setup");
      await expect(page).toHaveURL(/\/weddings\/new$/);
      await page.goto("/wedding/join");
      await expect(page).toHaveURL(/\/weddings\/join$/);
      await page.goto(prefix + "/dashboard");
      await expect(page).toHaveURL(new RegExp(prefix + "$"));
      const visitor = await browser.newContext({
        baseURL: "http://127.0.0.1:3100",
        viewport: { width, height: 960 },
        extraHTTPHeaders: { "x-auth-test-ip": "consistency-guest" },
      });
      try {
        await visitor.addInitScript(
          (preference) => localStorage.setItem("mme-theme", preference),
          mode,
        );
        const publicPage = await visitor.newPage();
        await publicPage.goto("/");
        await capture(
          publicPage,
          "landing",
          publicPage.getByRole("heading", { name: /Every moment/, level: 1 }),
        );
        const art = publicPage.locator(".hero-artwork");
        await expect
          .poll(() =>
            art.evaluate((el) => (el as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        await expect(art).toHaveCSS("object-fit", "contain");
        for (const [path, heading, name] of [
          ["/sign-in", "Welcome back", "signin"],
          ["/register", "Create an account", "register"],
        ] as const) {
          await publicPage.goto(path);
          await capture(
            publicPage,
            name,
            publicPage.getByRole("heading", { name: heading, exact: true }),
          );
          const toggle = publicPage
            .getByRole("button", { name: "Show password", exact: true })
            .first();
          await toggle.click();
          await expect(
            publicPage.getByLabel("Password", { exact: true }),
          ).toHaveAttribute("type", "text");
        }
        await publicPage.goto("/invite");
        await capture(
          publicPage,
          "missing-link",
          publicPage.getByRole("heading", {
            name: "This invitation is unavailable",
            exact: true,
          }),
        );
        await publicPage.goto(link);
        await capture(
          publicPage,
          "guest",
          publicPage.getByRole("heading", {
            name: /Pavithra.*Manish/,
            level: 1,
          }),
        );
        expect(await publicPage.locator("img").count()).toBe(0);
        await publicPage.goto("/unmatched-route-for-review");
        await capture(
          publicPage,
          "not-found",
          publicPage.getByRole("heading", {
            name: "This page isn’t here.",
            exact: true,
          }),
        );
        const back = publicPage.getByRole("link", {
          name: "Your weddings",
          exact: true,
        });
        await back.focus();
        await expect(back).toBeFocused();
        await expect(back).toHaveAttribute("href", "/weddings");
      } finally {
        await visitor.close();
      }
      // Keep test data solely within the disposable database.
    });
