import { test, expect, mutation, account, origin } from "./fixtures";
import { createHash } from "node:crypto";
import { verify } from "@node-rs/argon2";

const sessionCookie = "__Host-mme_session";

test("registration persists normalized identity and hashed credentials, with no membership", async ({
  request,
  database,
}) => {
  const response = await mutation(request, "register", {
    ...account,
    displayName: "  Test Family ",
    email: " FAMILY@EXAMPLE.INVALID ",
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(Object.keys(body.data.user).sort()).toEqual([
    "displayName",
    "email",
    "id",
  ]);
  expect(body.data.user.email).toBe(account.email);
  expect(body.meta.requestId).toBeTruthy();
  expect(response.headers()["cache-control"]).toBe("no-store");
  const user = await database
    .collection("users")
    .findOne({ emailNormalized: account.email });
  expect(await verify(user!.passwordHash, account.password)).toBe(true);
  expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
  const cookie = (await request.storageState()).cookies.find(
    (c) => c.name === sessionCookie,
  )!;
  expect(
    (await request.storageState()).cookies.some(
      (c) => c.name === "mme_session",
    ),
  ).toBe(false);
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  const session = await database
    .collection("authSessions")
    .findOne({ userId: user!._id });
  expect(session!.tokenHash).toBe(
    createHash("sha256").update(cookie.value).digest("hex"),
  );
  expect(JSON.stringify(body)).not.toContain(cookie.value);
  expect(
    (await (await request.get("/api/v1/auth/me")).json()).data.weddingCount,
  ).toBe(0);
  expect(await database.collection("weddingMemberships").countDocuments()).toBe(
    0,
  );
});

test("duplicate concurrent registrations leave exactly one user and session", async ({
  playwright,
  database,
}) => {
  const clients = await Promise.all([
    playwright.request.newContext({ baseURL: origin }),
    playwright.request.newContext({ baseURL: origin }),
  ]);
  try {
    const responses = await Promise.all(
      clients.map((c, i) => mutation(c, "register", account, "client-" + i)),
    );
    expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
    expect(await database.collection("users").countDocuments()).toBe(1);
    expect(await database.collection("authSessions").countDocuments()).toBe(1);
  } finally {
    await Promise.all(clients.map((c) => c.dispose()));
  }
});

test("login errors are generic; login rotates sessions; logout revokes replay", async ({
  request,
  database,
}) => {
  await mutation(request, "register", account);
  const original = (await request.storageState()).cookies.find(
    (c) => c.name === sessionCookie,
  )!.value;
  const bad = await mutation(request, "login", {
    email: account.email,
    password: "wrong",
  });
  const missing = await mutation(request, "login", {
    email: "missing@example.invalid",
    password: "wrong",
  });
  expect(bad.status()).toBe(401);
  expect(missing.status()).toBe(401);
  expect((await bad.json()).error).toEqual((await missing.json()).error);
  expect((await mutation(request, "login", account)).status()).toBe(422);
  expect(
    (
      await mutation(request, "login", {
        email: account.email,
        password: account.password,
      })
    ).status(),
  ).toBe(200);
  expect(
    await database
      .collection("authSessions")
      .countDocuments({ revokedAt: null }),
  ).toBe(1);
  expect(
    (
      await request.get("/api/v1/auth/me", {
        headers: { Cookie: sessionCookie + "=" + original },
      })
    ).status(),
  ).toBe(401);
  const cookie = (await request.storageState()).cookies.find(
    (c) => c.name === sessionCookie,
  )!.value;
  expect((await mutation(request, "logout", {})).status()).toBe(204);
  expect(
    (
      await request.get("/api/v1/auth/me", {
        headers: { Cookie: sessionCookie + "=" + cookie },
      })
    ).status(),
  ).toBe(401);
});

test("expired sessions and disabled users lose access immediately", async ({
  request,
  database,
}) => {
  await mutation(request, "register", account);
  await database
    .collection("authSessions")
    .updateMany({}, { $set: { expiresAt: new Date(0) } });
  expect((await request.get("/api/v1/auth/me")).status()).toBe(401);
  await mutation(request, "login", {
    email: account.email,
    password: account.password,
  });
  await database
    .collection("users")
    .updateMany({}, { $set: { status: "DISABLED" } });
  expect((await request.get("/api/v1/auth/me")).status()).toBe(401);
  expect(
    (
      await mutation(request, "login", {
        email: account.email,
        password: account.password,
      })
    ).status(),
  ).toBe(401);
});

test("unsafe requests require origin and matching CSRF; token is reusable", async ({
  request,
  database,
}) => {
  const csrf = await request.get("/api/v1/auth/csrf");
  const token = (await csrf.json()).data.token;
  expect(
    (await (await request.get("/api/v1/auth/csrf")).json()).data.token,
  ).toBe(token);
  for (const route of ["register", "login", "logout"]) {
    expect(
      (await request.post("/api/v1/auth/" + route, { data: account })).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/v1/auth/" + route, {
          headers: { Origin: "https://other.invalid", "X-CSRF-Token": token },
          data: account,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/v1/auth/" + route, {
          headers: { Origin: origin, "X-CSRF-Token": "bad" },
          data: account,
        })
      ).status(),
    ).toBe(403);
  }
  expect(await database.collection("users").countDocuments()).toBe(0);
});

test("malformed, oversized and invalid inputs never persist users", async ({
  request,
  database,
}) => {
  const token = (await (await request.get("/api/v1/auth/csrf")).json()).data
    .token;
  const headers = {
    Origin: origin,
    "X-CSRF-Token": token,
    "Content-Type": "application/json",
  };
  expect(
    (
      await request.post("/api/v1/auth/register", {
        headers,
        data: Buffer.from("{"),
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/v1/auth/register", {
        headers,
        data: Buffer.from("x".repeat(9000)),
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await request.post("/api/v1/auth/register", {
        headers: { ...headers, "Content-Type": "text/plain" },
        data: "{}",
      })
    ).status(),
  ).toBe(415);
  for (const data of [
    { ...account, password: "Password123456!" },
    { ...account, displayName: "123" },
    { ...account, email: "bad" },
    { ...account, role: "ADMIN" },
  ])
    expect((await mutation(request, "register", data)).status()).toBe(422);
  expect(await database.collection("users").countDocuments()).toBe(0);
});

test("rate limiting isolates source and email windows and survives independent clients", async ({
  request,
  database,
}) => {
  for (let i = 0; i < 10; i++)
    expect(
      (
        await mutation(request, "login", {
          email: "missing@example.invalid",
          password: "wrong",
        })
      ).status(),
    ).toBe(401);
  const sourceLimitedLogin = await mutation(request, "login", {
    email: "other@example.invalid",
    password: "wrong",
  });
  expect(sourceLimitedLogin.status()).toBe(429);
  expect(Number(sourceLimitedLogin.headers()["retry-after"])).toBeGreaterThan(
    0,
  );
  expect(
    Number(sourceLimitedLogin.headers()["retry-after"]),
  ).toBeLessThanOrEqual(900);
  expect(
    (
      await mutation(
        request,
        "login",
        { email: "different@example.invalid", password: "wrong" },
        "another-client",
      )
    ).status(),
  ).toBe(401);
  expect(
    (
      await mutation(
        request,
        "login",
        { email: "missing@example.invalid", password: "wrong" },
        "another-client",
      )
    ).status(),
  ).toBe(429);
  for (let i = 0; i < 10; i++)
    expect(
      (
        await mutation(
          request,
          "register",
          { ...account, password: "Password123456!" },
          "invalid-registration-client",
        )
      ).status(),
    ).toBe(422);
  const sourceLimitedRegistration = await mutation(
    request,
    "register",
    { ...account, password: "Password123456!" },
    "invalid-registration-client",
  );
  expect(sourceLimitedRegistration.status()).toBe(429);
  expect(
    Number(sourceLimitedRegistration.headers()["retry-after"]),
  ).toBeGreaterThan(0);
  expect(
    Number(sourceLimitedRegistration.headers()["retry-after"]),
  ).toBeLessThanOrEqual(900);
  expect(
    await database.collection("rateLimitWindows").countDocuments(),
  ).toBeGreaterThan(0);
});

test("registration throttle prevents additional writes", async ({
  request,
  database,
}) => {
  expect((await mutation(request, "register", account)).status()).toBe(201);
  for (let i = 0; i < 9; i++)
    expect((await mutation(request, "register", account)).status()).toBe(409);
  const limited = await mutation(request, "register", {
    ...account,
    email: "second@example.invalid",
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  expect(Number(limited.headers()["retry-after"])).toBeLessThanOrEqual(900);
  expect(await database.collection("users").countDocuments()).toBe(1);
});
