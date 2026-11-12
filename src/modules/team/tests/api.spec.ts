import { scopedGet, scopeHeaders } from "../../auth/tests/fixtures";
import { randomUUID, createHash } from "node:crypto";
import { test, expect, origin } from "../../auth/tests/fixtures";
import { onboard, write } from "../../functions/tests/fixtures";
import type { APIRequestContext } from "@playwright/test";
import { deliveredCode } from "./helpers";

async function invite(
  api: APIRequestContext,
  data: unknown = {
    role: "ORGANIZER",
    intendedEmail: "recipient@example.invalid",
    expiresInHours: 48,
  },
  key = randomUUID(),
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.post("/api/v1/member-invitations", {
    headers: {
      ...(await scopeHeaders(api)),
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "Idempotency-Key": key,
    },
    data: {
      deliveryMethod: "EMAIL",
      ...(data && typeof data === "object" ? data : {}),
    },
  });
}

test("emailed invitations return safe DTOs and keep keyed code verifiers at rest", async ({
  request,
  database,
}) => {
  await onboard(request);
  const roster = (await (await scopedGet(request, "/api/v1/members")).json())
    .data.members;
  expect(roster).toHaveLength(1);
  expect(roster[0]).toMatchObject({
    displayName: "Test Family",
    role: "ADMIN",
    isYou: true,
  });
  expect(Object.keys(roster[0]).sort()).toEqual([
    "displayName",
    "email",
    "id",
    "isYou",
    "revision",
    "role",
  ]);
  const key = randomUUID();
  const created = await invite(
    request,
    {
      role: "ADMIN",
      intendedEmail: " RELATIVE@EXAMPLE.INVALID ",
      expiresInHours: 24,
    },
    key,
  );
  expect(created.status()).toBe(201);
  const body = (await created.json()).data;
  expect(Object.keys(body)).toEqual(["invitation"]);
  expect(body.invitation.emailStatus).toBe("ACCEPTED");
  const stored = await database.collection("membershipInvites").findOne({});
  expect(stored!.codeVerifier).toMatch(/^[a-f0-9]{64}$/);
  expect(stored!.encryptedCode.keyVersion).toBe(1);
  const revealed = await write(
    request,
    `member-invitations/${body.invitation.id}/reveal`,
    {},
  );
  expect(revealed.status()).toBe(200);
  expect((await revealed.json()).data.code).toBe(
    await deliveredCode("relative@example.invalid"),
  );
  expect(stored!.intendedEmailNormalized).toBe("relative@example.invalid");
  expect(stored!.expiresAt - stored!.createdAt).toBe(86400000);
  const listed = await scopedGet(request, "/api/v1/member-invitations");
  const serialized = JSON.stringify(await listed.json());
  expect(serialized).not.toContain("#token=");
  expect(serialized).not.toContain("tokenHash");
  expect(serialized).not.toContain("codeVerifier");
  expect(serialized).not.toContain("encryptedCode");
  expect(serialized).not.toContain("creationKey");
  expect(
    (
      await invite(
        request,
        {
          role: "ADMIN",
          intendedEmail: "relative@example.invalid",
          expiresInHours: 24,
        },
        key,
      )
    ).status(),
  ).toBe(409);
  expect(await database.collection("membershipInvites").countDocuments()).toBe(
    1,
  );
  expect(await database.collection("weddingMemberships").countDocuments()).toBe(
    1,
  );
});

test("organizers cannot create/list/revoke invitations and foreign revocation returns 404", async ({
  request,
  playwright,
  database,
}) => {
  await onboard(request);
  const item = (await (await invite(request)).json()).data.invitation;
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    await onboard(other, "other-team@example.invalid");
    expect(
      (await (await scopedGet(other, "/api/v1/members")).json()).data.members,
    ).toHaveLength(1);
    expect(
      (
        await write(other, `member-invitations/${item.id}`, {}, "DELETE")
      ).status(),
    ).toBe(404);
    const user = await database
      .collection("users")
      .findOne({ emailNormalized: "other-team@example.invalid" });
    await database
      .collection("weddingMemberships")
      .updateOne({ userId: user!._id }, { $set: { role: "ORGANIZER" } });
    expect((await scopedGet(other, "/api/v1/members")).status()).toBe(200);
    expect(
      (await scopedGet(other, "/api/v1/member-invitations")).status(),
    ).toBe(403);
    expect((await invite(other)).status()).toBe(403);
    expect(
      (
        await write(other, `member-invitations/${item.id}`, {}, "DELETE")
      ).status(),
    ).toBe(403);
    await database
      .collection("weddingMemberships")
      .updateOne({ userId: user!._id }, { $set: { status: "REMOVED" } });
    expect((await scopedGet(other, "/api/v1/members")).status()).toBe(404);
  } finally {
    await other.dispose();
  }
});

test("revoke is idempotent, safe and cannot revoke accepted/expired invitations", async ({
  request,
  database,
}) => {
  await onboard(request);
  const item = (await (await invite(request)).json()).data.invitation;
  expect(
    (
      await write(request, `member-invitations/${item.id}`, {}, "DELETE")
    ).status(),
  ).toBe(204);
  expect(
    (
      await write(request, `member-invitations/${item.id}`, {}, "DELETE")
    ).status(),
  ).toBe(204);
  expect(
    (await database.collection("membershipInvites").findOne({}))!.revokedAt,
  ).toBeTruthy();
  expect(
    await database
      .collection("auditEvents")
      .countDocuments({ action: "MEMBERSHIP_INVITATION_REVOKED" }),
  ).toBe(1);
  const second = (await (await invite(request)).json()).data.invitation;
  await database
    .collection("membershipInvites")
    .updateOne({ revokedAt: null }, { $set: { expiresAt: new Date(0) } });
  expect(
    (
      await write(request, `member-invitations/${second.id}`, {}, "DELETE")
    ).status(),
  ).toBe(409);
  expect(
    (
      await (await scopedGet(request, "/api/v1/member-invitations")).json()
    ).data.invitations.some(
      (value: { status: string }) => value.status === "EXPIRED",
    ),
  ).toBe(true);
});

test("create rejects malformed data and CSRF; concurrent same-key creates only one invitation", async ({
  request,
  database,
}) => {
  expect((await scopedGet(request, "/api/v1/members")).status()).toBe(401);
  await onboard(request);
  expect(
    (await request.post("/api/v1/member-invitations", { data: {} })).status(),
  ).toBe(403);
  for (const value of [
    { role: "OWNER" },
    { role: "ADMIN", weddingId: "000000000000000000000000" },
    { role: "ORGANIZER", intendedEmail: "bad" },
    { role: "ORGANIZER", expiresInHours: 999 },
    {
      intendedEmail: "recipient@example.invalid",
      subject: "Injected\r\nBcc: other@example.invalid",
    },
    { intendedEmail: "recipient@example.invalid", message: "x".repeat(4001) },
    { intendedEmail: "recipient@example.invalid", subject: " " },
  ])
    expect((await invite(request, value)).status()).toBe(422);
  const key = randomUUID();
  const results = await Promise.all([
    invite(
      request,
      { role: "ORGANIZER", intendedEmail: "recipient@example.invalid" },
      key,
    ),
    invite(
      request,
      { role: "ORGANIZER", intendedEmail: "recipient@example.invalid" },
      key,
    ),
  ]);
  expect(results.map((value) => value.status()).sort()).toEqual([201, 409]);
  expect(await database.collection("membershipInvites").countDocuments()).toBe(
    1,
  );
});

test("rejected email is shown as failed and outbox contains no private invitation body", async ({
  request,
  database,
}) => {
  await onboard(request);
  const result = await invite(request, {
    intendedEmail: "fail@example.invalid",
    role: "ORGANIZER",
  });
  expect(result.status()).toBe(201);
  expect((await result.json()).data.invitation.emailStatus).toBe("FAILED");
  const outbox = await database.collection("emailOutbox").findOne({});
  expect(outbox!.status).toBe("FAILED");
  expect(JSON.stringify(outbox)).not.toContain("#token=");
  expect(outbox!.text).toBeUndefined();
  const stored = await database.collection("membershipInvites").findOne({});
  expect(stored!.encryptedCode.keyVersion).toBe(1);
  expect(JSON.stringify(outbox)).not.toContain(
    stored!.encryptedCode.ciphertext,
  );
});

test("reissuing an email invalidates the prior code and removes its delivery ciphertext", async ({
  request,
  database,
}) => {
  await onboard(request);
  await invite(request, {
    intendedEmail: "fail@example.invalid",
    role: "ORGANIZER",
  });
  const previous = await database.collection("membershipInvites").findOne({});
  expect(previous!.encryptedCode).toBeTruthy();
  expect(
    (
      await invite(request, {
        intendedEmail: "fail@example.invalid",
        role: "ADMIN",
      })
    ).status(),
  ).toBe(201);
  const old = await database
    .collection("membershipInvites")
    .findOne({ _id: previous!._id });
  expect(old!.revocationReason).toBe("REISSUED");
  expect(old!.revokedAt).toBeTruthy();
  expect(old!.encryptedCode).toBeUndefined();
  expect(
    await database
      .collection("membershipInvites")
      .countDocuments({ revokedAt: null }),
  ).toBe(1);
});

test("daily email cap fails closed before creating an invitation", async ({
  request,
  database,
}) => {
  await onboard(request);
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  await database.collection("rateLimitWindows").insertOne({
    keyHash: createHash("sha256")
      .update("organizer-invitation-email:platform")
      .digest("hex"),
    windowStart: day,
    count: 100,
    expiresAt: new Date(+day + 86400000),
  });
  expect((await invite(request)).status()).toBe(429);
  expect(await database.collection("membershipInvites").countDocuments()).toBe(
    0,
  );
  expect(await database.collection("emailOutbox").countDocuments()).toBe(0);
});
