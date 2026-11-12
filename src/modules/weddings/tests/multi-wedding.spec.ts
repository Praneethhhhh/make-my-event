import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  account,
  mutation,
  origin,
} from "../../auth/tests/fixtures";
import { profile, ceremony, onboard } from "../../functions/tests/fixtures";
import type { APIRequestContext } from "@playwright/test";
export async function call(
  api: APIRequestContext,
  path: string,
  data: unknown,
  weddingId?: string,
  method = "POST",
  key = randomUUID(),
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.fetch(`/api/v1/${path}`, {
    method,
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "Idempotency-Key": key,
      "x-auth-test-ip": "multi-wedding",
      ...(weddingId ? { "X-Wedding-Id": weddingId } : {}),
    },
    data,
  });
}
async function create(
  api: APIRequestContext,
  title: string,
  key = randomUUID(),
) {
  const response = await call(
    api,
    "weddings",
    { ...profile, title },
    undefined,
    "POST",
    key,
  );
  expect(response.status()).toBe(201);
  return (await response.json()).data.wedding;
}
async function manual(
  api: APIRequestContext,
  id: string,
  email: string,
  role = "ORGANIZER",
) {
  const response = await call(
    api,
    "member-invitations",
    { intendedEmail: email, role, deliveryMethod: "MANUAL" },
    id,
  );
  expect(response.status()).toBe(201);
  return (await response.json()).data.invitation;
}
async function reveal(
  api: APIRequestContext,
  id: string,
  invitationId: string,
) {
  return call(api, `member-invitations/${invitationId}/reveal`, {}, id);
}
test("one account creates several isolated weddings with idempotent retries and signed pagination", async ({
  request,
  database,
}) => {
  await mutation(request, "register", account);
  const key = randomUUID();
  const results = await Promise.all([
    create(request, "First celebration", key),
    create(request, "First celebration", key),
  ]);
  expect(results[0].id).toBe(results[1].id);
  const second = await create(request, "Second celebration");
  expect(second.id).not.toBe(results[0].id);
  expect(await database.collection("weddings").countDocuments()).toBe(2);
  const conflict = await call(
    request,
    "weddings",
    { ...profile, title: "Changed attempt" },
    undefined,
    "POST",
    key,
  );
  expect(conflict.status()).toBe(409);
  expect(
    (await (await request.get("/api/v1/auth/me")).json()).data.weddingCount,
  ).toBe(2);
  const page = await (await request.get("/api/v1/weddings?limit=1")).json();
  expect(page.data).toHaveLength(1);
  expect(page.page.nextCursor).toBeTruthy();
  const next = await request.get(
    `/api/v1/weddings?limit=1&cursor=${page.page.nextCursor}`,
  );
  expect(next.status()).toBe(200);
  expect((await next.json()).data[0].id).not.toBe(page.data[0].id);
  expect(
    (
      await request.get(
        `/api/v1/weddings?cursor=${page.page.nextCursor.slice(0, -1)}x`,
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await (await request.get("/api/v1/weddings?search=Second")).json()
    ).data.map((row: { id: string }) => row.id),
  ).toEqual([second.id]);
  expect(
    (await (await request.get("/api/v1/weddings?search=%5B.*")).json()).data,
  ).toEqual([]);
});
test("context is mandatory and child IDs cannot cross even two authorized weddings", async ({
  request,
}) => {
  const a = await onboard(request);
  const b = await create(request, "Other wedding");
  expect((await request.get("/api/v1/wedding")).status()).toBe(400);
  expect(
    (
      await request.get("/api/v1/functions", {
        headers: { "X-Wedding-Id": "bad" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.get("/api/v1/functions", {
        headers: { "X-Wedding-Id": "000000000000000000000000" },
      })
    ).status(),
  ).toBe(404);
  const saved = await call(
    request,
    "functions",
    { ...ceremony, weddingRevision: a.revision },
    a.id,
  );
  expect(saved.status()).toBe(201);
  const item = (await saved.json()).data.function;
  expect(
    (
      await (
        await request.get("/api/v1/functions", {
          headers: { "X-Wedding-Id": b.id },
        })
      ).json()
    ).data.functions,
  ).toEqual([]);
  expect(
    (
      await call(
        request,
        `functions/${item.id}`,
        { ...ceremony, revision: 1, weddingRevision: b.revision },
        b.id,
        "PATCH",
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await call(request, `functions/${item.id}/archive`, { revision: 1 }, b.id)
    ).status(),
  ).toBe(404);
});
test("manual generation without email configuration or provider calls supports reveal and single-use joining", async ({
  request,
  playwright,
  database,
}) => {
  const a = await onboard(request);
  const invitation = await manual(request, a.id, "manual@example.invalid");
  expect(invitation).toMatchObject({
    deliveryMethod: "MANUAL",
    emailStatus: "NOT_SENT",
    status: "PENDING",
  });
  expect(invitation.code).toBeUndefined();
  expect(await database.collection("emailOutbox").countDocuments()).toBe(0);
  expect(
    await database
      .collection("rateLimitWindows")
      .countDocuments({ count: { $exists: true }, keyHash: { $exists: true } }),
  ).toBeGreaterThan(0);
  const response = await reveal(request, a.id, invitation.id);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const code = (await response.json()).data.code;
  expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/);
  expect(
    (await (await reveal(request, a.id, invitation.id)).json()).data.code,
  ).toBe(code);
  const stored = await database.collection("membershipInvites").findOne({});
  expect(stored!.encryptedCode).toBeTruthy();
  expect(JSON.stringify(stored)).not.toContain(code);
  const list = await request.get("/api/v1/member-invitations", {
    headers: { "X-Wedding-Id": a.id },
  });
  expect(JSON.stringify(await list.json())).not.toContain(code);
  const recipient = await playwright.request.newContext({ baseURL: origin });
  try {
    await mutation(
      recipient,
      "register",
      { ...account, email: "manual@example.invalid" },
      "manual",
    );
    expect(
      (
        await call(recipient, "member-invitations/redeem", {
          email: "manual@example.invalid",
          code,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await call(recipient, "member-invitations/redeem", {
          email: "manual@example.invalid",
          code,
        })
      ).status(),
    ).toBe(422);
    expect((await reveal(request, a.id, invitation.id)).status()).toBe(409);
    expect(
      (await database.collection("membershipInvites").findOne({}))!
        .encryptedCode,
    ).toBeUndefined();
  } finally {
    await recipient.dispose();
  }
});
test("joining additional weddings preserves independent roles and revocation leaves other access usable", async ({
  request,
  playwright,
  database,
}) => {
  const a = await onboard(request);
  const invitation = await manual(request, a.id, "helper@example.invalid");
  const code = (await (await reveal(request, a.id, invitation.id)).json()).data
    .code;
  const helper = await playwright.request.newContext({ baseURL: origin });
  try {
    await mutation(
      helper,
      "register",
      { ...account, email: "helper@example.invalid" },
      "helper",
    );
    const own = await create(helper, "Helper family wedding");
    expect(
      (
        await call(helper, "member-invitations/redeem", {
          email: "helper@example.invalid",
          code,
        })
      ).status(),
    ).toBe(200);
    const cards = (await (await helper.get("/api/v1/weddings")).json()).data;
    expect(cards.find((row: { id: string }) => row.id === a.id).role).toBe(
      "ORGANIZER",
    );
    expect(cards.find((row: { id: string }) => row.id === own.id).role).toBe(
      "ADMIN",
    );
    expect(
      (
        await call(
          helper,
          "member-invitations",
          { intendedEmail: "other@example.invalid", deliveryMethod: "MANUAL" },
          a.id,
        )
      ).status(),
    ).toBe(403);
    expect((await reveal(helper, a.id, invitation.id)).status()).toBe(403);
    const roster = (
      await (
        await request.get("/api/v1/members", {
          headers: { "X-Wedding-Id": a.id },
        })
      ).json()
    ).data.members;
    const target = roster.find(
      (row: { email: string }) => row.email === "helper@example.invalid",
    );
    expect(
      (
        await call(
          request,
          `members/${target.id}`,
          { revision: target.revision },
          a.id,
          "DELETE",
        )
      ).status(),
    ).toBe(204);
    expect((await helper.get("/api/v1/auth/me")).status()).toBe(200);
    expect(
      (
        await helper.get("/api/v1/wedding", {
          headers: { "X-Wedding-Id": a.id },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await helper.get("/api/v1/wedding", {
          headers: { "X-Wedding-Id": own.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      await database
        .collection("weddingMemberships")
        .countDocuments({ status: "REMOVED" }),
    ).toBe(1);
  } finally {
    await helper.dispose();
  }
});
test("reissue, expiry and missing legacy ciphertext never expose an invalid code", async ({
  request,
  database,
}) => {
  const a = await onboard(request);
  const old = await manual(request, a.id, "replace@example.invalid");
  await manual(request, a.id, "replace@example.invalid");
  expect((await reveal(request, a.id, old.id)).status()).toBe(409);
  await database
    .collection("membershipInvites")
    .updateMany({ revokedAt: null }, { $unset: { encryptedCode: "" } });
  const active = await database
    .collection("membershipInvites")
    .findOne({ revokedAt: null });
  const missing = await reveal(request, a.id, active!._id.toHexString());
  expect(missing.status()).toBe(409);
  expect((await missing.json()).error.code).toBe("CODE_UNAVAILABLE");
  const expires = await manual(request, a.id, "expires@example.invalid");
  await database
    .collection("membershipInvites")
    .updateOne(
      { intendedEmailNormalized: "expires@example.invalid" },
      { $set: { expiresAt: new Date(0) } },
    );
  expect((await reveal(request, a.id, expires.id)).status()).toBe(409);
  await request.get("/api/v1/member-invitations", {
    headers: { "X-Wedding-Id": a.id },
  });
  expect(
    (await database
      .collection("membershipInvites")
      .findOne({ intendedEmailNormalized: "expires@example.invalid" }))!
      .encryptedCode,
  ).toBeUndefined();
});
test("reveal has its own persistent cap, CSRF and cross-wedding protections", async ({
  request,
}) => {
  const a = await onboard(request);
  const b = await create(request, "Second wedding");
  const invitation = await manual(request, a.id, "rate@example.invalid");
  expect(
    (
      await request.post(`/api/v1/member-invitations/${invitation.id}/reveal`, {
        headers: { "X-Wedding-Id": a.id },
      })
    ).status(),
  ).toBe(403);
  expect((await reveal(request, b.id, invitation.id)).status()).toBe(404);
  for (let index = 0; index < 10; index++)
    expect((await reveal(request, a.id, invitation.id)).status()).toBe(200);
  const limited = await reveal(request, a.id, invitation.id);
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
});

test("concurrent joins to different weddings succeed while duplicate target joins stay single", async ({
  request,
  playwright,
  database,
}) => {
  const a = await onboard(request);
  const b = await create(request, "Second wedding");
  const email = "parallel@example.invalid";
  const first = await manual(request, a.id, email);
  const second = await manual(request, b.id, email);
  const codeA = (await (await reveal(request, a.id, first.id)).json()).data
    .code;
  const codeB = (await (await reveal(request, b.id, second.id)).json()).data
    .code;
  const helper = await playwright.request.newContext({ baseURL: origin });
  try {
    await mutation(helper, "register", { ...account, email }, "parallel");
    const results = await Promise.all([
      call(helper, "member-invitations/redeem", { email, code: codeA }),
      call(helper, "member-invitations/redeem", { email, code: codeB }),
    ]);
    expect(results.map((response) => response.status())).toEqual([200, 200]);
    const user = await database
      .collection("users")
      .findOne({ emailNormalized: email });
    expect(
      await database
        .collection("weddingMemberships")
        .countDocuments({ userId: user!._id, status: "ACTIVE" }),
    ).toBe(2);
    expect((await helper.get("/api/v1/auth/me")).status()).toBe(200);
  } finally {
    await helper.dispose();
  }
});

test("wedding creation has a persisted per-account limit without limiting existing memberships or retries", async ({
  request,
  database,
}) => {
  await mutation(request, "register", account);
  const key = randomUUID();
  await create(request, "First wedding", key);
  // Locate the creation bucket by its documented operation, not by other authentication counters.
  const { createHash } = await import("node:crypto");
  const user = await database
    .collection("users")
    .findOne({ emailNormalized: account.email });
  const keyHash = createHash("sha256")
    .update(`create-wedding:${user!._id.toHexString()}`)
    .digest("hex");
  await database
    .collection("rateLimitWindows")
    .updateOne({ keyHash }, { $set: { count: 10 } });
  const limited = await call(request, "weddings", {
    ...profile,
    title: "Rate limited wedding",
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  expect(
    (
      await call(
        request,
        "weddings",
        { ...profile, title: "First wedding" },
        undefined,
        "POST",
        key,
      )
    ).status(),
  ).toBe(201);
  expect(await database.collection("weddings").countDocuments()).toBe(1);
});
