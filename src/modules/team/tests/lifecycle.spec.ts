import { scopedGet, scopeHeaders } from "../../auth/tests/fixtures";
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  mutation,
  account,
  origin,
} from "../../auth/tests/fixtures";
import { onboard, write } from "../../functions/tests/fixtures";
import { deliveredCode, deliveredEmail } from "./helpers";
import type { APIRequestContext } from "@playwright/test";
async function send(api: APIRequestContext, email: string, role = "ORGANIZER") {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.post("/api/v1/member-invitations", {
    headers: {
      ...(await scopeHeaders(api)),
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "Idempotency-Key": randomUUID(),
    },
    data: {
      intendedEmail: email,
      deliveryMethod: "EMAIL",
      role,
      subject: "Please join our family team",
      message: "A personal note\nWe’d love your help!",
    },
  });
}
async function redeem(api: APIRequestContext, email: string, code: string) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.post("/api/v1/member-invitations/redeem", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "x-auth-test-ip": email,
    },
    data: { email, code },
  });
}
test("custom email -> second account acceptance -> role change -> removal -> rejoin", async ({
  request,
  playwright,
  database,
}) => {
  await onboard(request);
  const email = "invitee@example.invalid";
  expect((await send(request, email)).status()).toBe(201);
  const mail = await deliveredEmail(email);
  expect(mail.subject).toBe("Please join our family team");
  expect(mail.text).toContain("A personal note\nWe’d love your help!");
  expect(mail.text).toContain("/weddings/join");
  expect(mail.text).not.toContain("next update");
  const code = await deliveredCode(email);
  const recipient = await playwright.request.newContext({ baseURL: origin });
  try {
    await mutation(recipient, "register", { ...account, email }, email);
    expect((await redeem(recipient, email, code)).status()).toBe(200);
    expect((await scopedGet(recipient, "/api/v1/wedding")).status()).toBe(200);
    expect((await redeem(recipient, email, code)).status()).toBe(422);
    const roster = (await (await scopedGet(request, "/api/v1/members")).json())
      .data.members;
    const member = roster.find((m: { email: string }) => m.email === email);
    expect(
      (
        await write(
          recipient,
          `members/${roster[0].id}`,
          { revision: 1 },
          "DELETE",
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await write(
          request,
          `members/${member.id}`,
          { role: "ADMIN", revision: member.revision },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    expect((await recipient.get("/api/v1/auth/me")).status()).toBe(200);
    await mutation(
      recipient,
      "login",
      { email, password: account.password },
      email,
    );
    expect(
      (
        await write(
          request,
          `members/${member.id}`,
          { revision: member.revision },
          "DELETE",
        )
      ).status(),
    ).toBe(409);
    expect(
      (
        await write(
          request,
          `members/${member.id}`,
          { revision: member.revision + 1 },
          "DELETE",
        )
      ).status(),
    ).toBe(204);
    expect((await scopedGet(recipient, "/api/v1/functions")).status()).toBe(
      404,
    );
    await mutation(
      recipient,
      "login",
      { email, password: account.password },
      email,
    );
    expect((await scopedGet(recipient, "/api/v1/wedding")).status()).toBe(404);
    expect((await send(request, email)).status()).toBe(201);
    expect(
      (await redeem(recipient, email, await deliveredCode(email))).status(),
    ).toBe(200);
    expect(
      await database
        .collection("weddingMemberships")
        .countDocuments({ status: "ACTIVE" }),
    ).toBe(2);
    expect(
      await database.collection("weddingMemberships").countDocuments(),
    ).toBe(2);
  } finally {
    await recipient.dispose();
  }
});
test("invalid, wrong-account, revoked, expired and replaced codes cannot grant access", async ({
  request,
  playwright,
  database,
}) => {
  await onboard(request);
  const email = "target@example.invalid";
  await send(request, email);
  const old = await deliveredCode(email);
  const recipient = await playwright.request.newContext({ baseURL: origin });
  try {
    await mutation(
      recipient,
      "register",
      { ...account, email: "wrong@example.invalid" },
      "wrong",
    );
    expect((await redeem(recipient, email, old)).status()).toBe(422);
    expect(
      (await redeem(recipient, "wrong@example.invalid", old)).status(),
    ).toBe(422);
    await mutation(recipient, "logout", {});
    await mutation(recipient, "register", { ...account, email }, email);
    await send(request, email);
    expect((await redeem(recipient, email, old)).status()).toBe(422);
    const replacement = await deliveredCode(email);
    await database
      .collection("membershipInvites")
      .updateMany({ revokedAt: null }, { $set: { expiresAt: new Date(0) } });
    expect((await redeem(recipient, email, replacement)).status()).toBe(422);
    const fresh = (await (await send(request, email)).json()).data.invitation;
    const freshCode = await deliveredCode(email);
    await write(request, `member-invitations/${fresh.id}`, {}, "DELETE");
    expect((await redeem(recipient, email, freshCode)).status()).toBe(422);
    expect(
      await database.collection("weddingMemberships").countDocuments(),
    ).toBe(1);
  } finally {
    await recipient.dispose();
  }
});
test("last administrator and cross-tenant membership boundaries are protected", async ({
  request,
  playwright,
}) => {
  await onboard(request);
  const member = (await (await scopedGet(request, "/api/v1/members")).json())
    .data.members[0];
  expect(
    (
      await write(
        request,
        `members/${member.id}`,
        { revision: member.revision },
        "DELETE",
      )
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(
        request,
        `members/${member.id}`,
        { role: "ORGANIZER", revision: member.revision },
        "PATCH",
      )
    ).status(),
  ).toBe(409);
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    await onboard(other, "other@example.invalid");
    expect(
      (
        await write(
          other,
          `members/${member.id}`,
          { revision: member.revision },
          "DELETE",
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await write(
          other,
          `members/${member.id}`,
          { role: "ADMIN", revision: member.revision },
          "PATCH",
        )
      ).status(),
    ).toBe(404);
    await send(request, "other@example.invalid");
    expect(
      (
        await redeem(
          other,
          "other@example.invalid",
          await deliveredCode("other@example.invalid"),
        )
      ).status(),
    ).toBe(200);
  } finally {
    await other.dispose();
  }
});
test("concurrent redemption creates one membership; failed guesses have persisted limits", async ({
  request,
  playwright,
  database,
}) => {
  await onboard(request);
  const email = "concurrent@example.invalid";
  await send(request, email);
  const code = await deliveredCode(email);
  const recipient = await playwright.request.newContext({ baseURL: origin });
  try {
    await mutation(recipient, "register", { ...account, email }, email);
    const outcomes = await Promise.all([
      redeem(recipient, email, code),
      redeem(recipient, email, code),
    ]);
    expect(outcomes.filter((r) => r.status() === 200)).toHaveLength(1);
    expect(
      outcomes.every((r) => [200, 401, 409, 422].includes(r.status())),
    ).toBe(true);
    expect(
      await database
        .collection("weddingMemberships")
        .countDocuments({ status: "ACTIVE" }),
    ).toBe(2);
    for (let i = 0; i < 9; i++) await redeem(recipient, email, "badcode00000x");
    const limited = await redeem(recipient, email, "badcode00000x");
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  } finally {
    await recipient.dispose();
  }
});

test("simultaneous administrators cannot remove every administrator", async ({
  request,
  playwright,
  database,
}) => {
  await onboard(request);
  const email = "coadmin@example.invalid";
  await send(request, email, "ADMIN");
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    await mutation(other, "register", { ...account, email }, email);
    expect(
      (await redeem(other, email, await deliveredCode(email))).status(),
    ).toBe(200);
    const members = (await (await scopedGet(request, "/api/v1/members")).json())
      .data.members;
    const first = members.find(
      (m: { email: string }) => m.email === account.email,
    );
    const second = members.find((m: { email: string }) => m.email === email);
    const results = await Promise.all([
      write(
        request,
        `members/${first.id}`,
        { revision: first.revision },
        "DELETE",
      ),
      write(
        other,
        `members/${second.id}`,
        { revision: second.revision },
        "DELETE",
      ),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([204, 409]);
    expect(
      await database
        .collection("weddingMemberships")
        .countDocuments({ status: "ACTIVE", role: "ADMIN" }),
    ).toBe(1);
  } finally {
    await other.dispose();
  }
});
