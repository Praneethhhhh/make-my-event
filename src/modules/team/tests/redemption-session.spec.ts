import { randomUUID, createHash } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import {
  test,
  expect,
  account,
  mutation,
  origin,
} from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";
const newPassword = "Cedar moons ripple quartz 482!";
async function post(
  api: APIRequestContext,
  path: string,
  data: unknown,
  weddingId?: string,
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.post(`/api/v1/${path}`, {
    data,
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "Idempotency-Key": randomUUID(),
      "x-auth-test-ip": "session-race",
      ...(weddingId ? { "X-Wedding-Id": weddingId } : {}),
    },
  });
}
async function invitation(
  api: APIRequestContext,
  weddingId: string,
  email: string,
) {
  const created = await post(
    api,
    "member-invitations",
    {
      deliveryMethod: "MANUAL",
      intendedEmail: email,
      role: "ORGANIZER",
      expiresInHours: 48,
    },
    weddingId,
  );
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.invitation.id;
  const revealed = await post(
    api,
    `member-invitations/${id}/reveal`,
    {},
    weddingId,
  );
  expect(revealed.status()).toBe(200);
  return (await revealed.json()).data.code as string;
}
test("a redemption paused after authentication cannot restore a session revoked by password change", async ({
  request,
  playwright,
  database,
}) => {
  const wedding = await onboard(request);
  const email = "paused-redemption@example.invalid";
  const code = await invitation(request, wedding.id, email);
  const device = await playwright.request.newContext({ baseURL: origin });
  const passwordDevice = await playwright.request.newContext({
    baseURL: origin,
  });
  let body: ReadableStreamDefaultController<Uint8Array> | undefined;
  let pending: Promise<Response> | undefined;
  try {
    expect(
      (
        await mutation(device, "register", { ...account, email }, email)
      ).status(),
    ).toBe(201);
    expect(
      (
        await mutation(
          passwordDevice,
          "login",
          { email, password: account.password },
          "password-device",
        )
      ).status(),
    ).toBe(200);
    const csrf = await device.get("/api/v1/auth/csrf");
    const token = (await csrf.json()).data.token;
    const cookies = (await device.storageState()).cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        body = controller;
        controller.enqueue(new TextEncoder().encode("{"));
      },
    });
    pending = fetch(origin + "/api/v1/member-invitations/redeem", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookies,
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
        "x-auth-test-ip": "paused-redemption",
      },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: string });
    // This persisted bucket is written after currentUser succeeds and before input
    // finishes reading. Holding the body here reproduces the reviewer's exact gap.
    const keyHash = createHash("sha256")
      .update(`invitation-redeem:email:${email}`)
      .digest("hex");
    await expect
      .poll(
        async () =>
          !!(await database
            .collection("rateLimitWindows")
            .findOne({ keyHash, count: { $gte: 1 } })),
      )
      .toBe(true);
    const changed = await post(passwordDevice, "account/password", {
      currentPassword: account.password,
      newPassword,
      confirmPassword: newPassword,
      revision: 1,
    });
    expect(changed.status()).toBe(200);
    body!.enqueue(
      new TextEncoder().encode(JSON.stringify({ email, code }).slice(1)),
    );
    body!.close();
    body = undefined;
    const rejected = await pending;
    expect(rejected.status).toBe(401);
    expect(rejected.headers.has("set-cookie")).toBe(false);
    expect((await device.get("/api/v1/auth/me")).status()).toBe(401);
    expect((await passwordDevice.get("/api/v1/auth/me")).status()).toBe(200);
    expect(
      await database.collection("weddingMemberships").countDocuments(),
    ).toBe(1);
    expect(
      await database
        .collection("membershipInvites")
        .countDocuments({ consumedAt: null }),
    ).toBe(1);
    const user = await database
      .collection("users")
      .findOne({ emailNormalized: email });
    expect(
      await database
        .collection("authSessions")
        .countDocuments({ userId: user!._id, revokedAt: null }),
    ).toBe(1);
    expect(
      (
        await post(passwordDevice, "member-invitations/redeem", { email, code })
      ).status(),
    ).toBe(200);
  } finally {
    body?.error(new Error("Test cleanup"));
    if (pending) await pending.catch(() => undefined);
    await device.dispose();
    await passwordDevice.dispose();
  }
});
test("password changes also revoke a replacement session when redemption commits first", async ({
  request,
  playwright,
  database,
}) => {
  const wedding = await onboard(request);
  const email = "joined-before-password@example.invalid";
  const code = await invitation(request, wedding.id, email);
  const device = await playwright.request.newContext({ baseURL: origin });
  const passwordDevice = await playwright.request.newContext({
    baseURL: origin,
  });
  try {
    await mutation(device, "register", { ...account, email }, email);
    await mutation(
      passwordDevice,
      "login",
      { email, password: account.password },
      "password-after-join",
    );
    expect(
      (
        await post(device, "member-invitations/redeem", { email, code })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(passwordDevice, "account/password", {
          currentPassword: account.password,
          newPassword,
          confirmPassword: newPassword,
          revision: 1,
        })
      ).status(),
    ).toBe(200);
    expect((await device.get("/api/v1/auth/me")).status()).toBe(401);
    expect((await passwordDevice.get("/api/v1/auth/me")).status()).toBe(200);
    expect(
      await database.collection("weddingMemberships").countDocuments(),
    ).toBe(2);
  } finally {
    await device.dispose();
    await passwordDevice.dispose();
  }
});
