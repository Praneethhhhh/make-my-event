import { randomUUID } from "node:crypto";
import { test, expect } from "../../auth/tests/fixtures";
import {
  setup,
  recipient,
  write,
  scopedGet,
  reveal,
  open,
  rsvp,
} from "./fixtures";

for (const width of [390, 1440])
  test(`guest review editor regressions at ${width}px`, async ({
    page,
    database,
  }) => {
    void database;
    await page.setViewportSize({ width, height: 960 });
    const { wedding, fn, second } = await setup(page.request),
      payload = recipient([fn, second]);
    const input = {
      ...payload,
      functions: payload.functions.map((f, i) => ({
        ...f,
        maxAttendees: i === 0 ? 8 : f.maxAttendees,
        deadlineOverrideAt: i === 0 ? "2027-02-18T12:30:00.000Z" : null,
      })),
    };
    const created = await write(page.request, "guests", input);
    expect(created.status()).toBe(201);
    const id = (await created.json()).data.id;
    const details = async () =>
      (await (await scopedGet(page.request, `/api/v1/guests/${id}`)).json())
        .data;
    let current = await details();
    expect(
      (await open(page.request, await reveal(page.request, current))).status(),
    ).toBe(200);
    const first = current.functions.find((f: { id: string }) => f.id === fn.id),
      other = current.functions.find((f: { id: string }) => f.id === second.id);
    expect(
      (
        await rsvp(page.request, id, first.invitationId, first.revision, 2)
      ).status(),
    ).toBe(200);
    expect(
      (
        await rsvp(
          page.request,
          id,
          other.invitationId,
          other.revision,
          0,
          "DECLINED",
        )
      ).status(),
    ).toBe(200);
    await page.goto(`/weddings/${wedding.id}/guests`);
    await page
      .getByRole("button", { name: "View invitation for Elon Musk & family" })
      .click();
    const correct = page.getByRole("button", {
      name: "Correct response",
      exact: true,
    });
    await correct.nth(0).click();
    const form = page.locator(".guest-correction");
    await form.getByLabel("People attending", { exact: true }).fill("3");
    await form
      .getByLabel("Reason for correction", { exact: true })
      .fill("Draft for Haldi only");
    let previousKey = "";
    await page.route(
      "**/api/v1/function-invitations/*/rsvp",
      async (route) => {
        previousKey = route.request().postDataJSON().creationKey;
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "VALIDATION_ERROR",
              message: "First correction feedback",
            },
          }),
        });
      },
      { times: 1 },
    );
    await form
      .getByRole("button", { name: "Save correction", exact: true })
      .click();
    await expect(form.getByRole("alert")).toHaveText(
      "First correction feedback",
    );
    await correct.nth(1).click();
    await expect(form.getByRole("heading")).toHaveText(
      "Correct response · Sangeet",
    );
    await expect(
      form.getByRole("combobox", { name: "Response", exact: true }),
    ).toHaveValue("DECLINED");
    await expect(
      form.getByLabel("Reason for correction", { exact: true }),
    ).toHaveValue("");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await form
      .getByRole("combobox", { name: "Response", exact: true })
      .selectOption("ACCEPTED");
    await expect(
      form.getByLabel("People attending", { exact: true }),
    ).toHaveValue("1");
    await form
      .getByLabel("Reason for correction", { exact: true })
      .fill("Confirmed Sangeet attendance");
    const sent = page.waitForRequest(
      (r) =>
        r.method() === "PATCH" &&
        r.url().includes(`/function-invitations/${other.invitationId}/rsvp`),
    );
    await form
      .getByRole("button", { name: "Save correction", exact: true })
      .click();
    expect((await sent).postDataJSON().creationKey).not.toBe(previousKey);
    await expect(
      page.getByText("Response corrected. The reason is retained in history.", {
        exact: true,
      }),
    ).toBeVisible();
    current = await details();
    expect(
      current.functions.find((f: { id: string }) => f.id === fn.id)
        .attendeeCount,
    ).toBe(2);
    expect(
      current.functions.find((f: { id: string }) => f.id === second.id)
        .attendeeCount,
    ).toBe(1);
    await page
      .getByRole("button", { name: "Edit invitation", exact: true })
      .click();
    const choice = page
        .locator(".guest-function-choice")
        .filter({ hasText: "Haldi" }),
      checkbox = choice.getByRole("checkbox");
    await checkbox.uncheck();
    await checkbox.check();
    await expect(
      choice.getByLabel("Maximum people", { exact: true }),
    ).toHaveValue("8");
    await choice.locator("summary").click();
    const deadline = choice.getByLabel(/Deadline for Haldi/);
    await expect(deadline).toHaveValue("2027-02-18T18:00");
    await choice.getByLabel("Maximum people", { exact: true }).fill("9");
    await deadline.fill("2027-02-18T19:00");
    await checkbox.uncheck();
    await checkbox.check();
    await expect(
      choice.getByLabel("Maximum people", { exact: true }),
    ).toHaveValue("9");
    await choice.locator("summary").click();
    await expect(deadline).toHaveValue("2027-02-18T19:00");
    await checkbox.uncheck();
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(
      choice.getByLabel("Maximum people", { exact: true }),
    ).toHaveValue("9");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit invitation", exact: true }),
    ).toBeVisible();
    current = await details();
    const saved = current.functions.find((f: { id: string }) => f.id === fn.id);
    expect(saved.maxAttendees).toBe(9);
    expect(saved.deadlineOverrideAt).toBe("2027-02-18T13:30:00.000Z");
    expect(saved.attendeeCount).toBe(2);
    await page.locator(".guest-more > summary").click();
    await page
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm change", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Copy private link", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(
        "Access is revoked. Replace the link before sharing this invitation again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Copy and share this invitation with the recipient.", {
        exact: true,
      }),
    ).toHaveCount(0);
    const replace = page.getByRole("button", {
      name: "Replace link",
      exact: true,
    });
    await replace.focus();
    await expect(replace).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `playwright-report/guest-invitations/review-revoked-${width}.png`,
      animations: "disabled",
    });
  });

test("first guest link opens after a temporary exchange failure without re-sharing its secret", async ({
  page,
  database,
  browser,
}) => {
  void database;
  const { fn } = await setup(page.request),
    created = await write(page.request, "guests", recipient([fn]));
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id,
    current = (
      await (await scopedGet(page.request, `/api/v1/guests/${id}`)).json()
    ).data,
    url = await reveal(page.request, current);
  const visitor = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    extraHTTPHeaders: { "x-auth-test-ip": "guest-entry-regression" },
  });
  try {
    const guest = await visitor.newPage();
    let calls = 0;
    await guest.route("**/api/v1/guest/access/exchange", async (route) => {
      calls++;
      if (calls === 1)
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              message: "Please try again shortly.",
            },
          }),
        });
      else await route.continue();
    });
    await guest.goto(url);
    await expect(
      guest.getByRole("heading", { name: "Let’s try that again", exact: true }),
    ).toBeVisible();
    expect(new URL(guest.url()).hash).toBe("");
    expect(
      await guest.evaluate(
        () =>
          Object.keys(localStorage).length + Object.keys(sessionStorage).length,
      ),
    ).toBe(0);
    await guest.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      guest.getByRole("heading", { name: /Pavithra.*Manish/, level: 1 }),
    ).toBeVisible();
    expect(calls).toBe(2);
    expect(new URL(guest.url()).pathname).toBe(`/guest/${id}`);
    await write(
      page.request,
      `guests/${id}/links`,
      { revision: current.revision, creationKey: randomUUID() },
      "DELETE",
    );
    await guest.goto(url);
    await expect(
      guest.getByRole("heading", {
        name: "This invitation is unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Try again", exact: true }),
    ).toHaveCount(0);
    expect(new URL(guest.url()).hash).toBe("");
  } finally {
    await visitor.close();
  }
});
