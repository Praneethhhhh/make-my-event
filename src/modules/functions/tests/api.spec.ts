import { scopedGet } from "../../auth/tests/fixtures";
import { test, expect, origin } from "../../auth/tests/fixtures";
import { ceremony, onboard, profile, write } from "./fixtures";
import { localDateTimeToUtc } from "@/modules/weddings/zoned-date";
import { createHash } from "node:crypto";

test("local function times use the wedding zone and reject DST gaps and ambiguity", () => {
  expect(localDateTimeToUtc("2027-02-19T10:00", "Asia/Kolkata")).toBe(
    "2027-02-19T04:30:00.000Z",
  );
  expect(() =>
    localDateTimeToUtc("2027-03-14T02:30", "America/New_York"),
  ).toThrow("does not exist");
  expect(() =>
    localDateTimeToUtc("2027-11-07T01:30", "America/New_York"),
  ).toThrow("occurs twice");
});

test("function creation, validation and revision-protected editing", async ({
  request,
  database,
}) => {
  await onboard(request);
  const created = await write(request, "functions", ceremony);
  expect(created.status()).toBe(201);
  const item = (await created.json()).data.function;
  expect(item.startsAt).toBe(ceremony.startsAt);
  const patch = {
    ...ceremony,
    name: "Haldi ceremony",
    revision: item.revision,
  };
  expect(
    (await write(request, "functions/" + item.id, patch, "PATCH")).status(),
  ).toBe(200);
  expect(
    (await write(request, "functions/" + item.id, patch, "PATCH")).status(),
  ).toBe(409);
  for (const invalid of [
    { ...ceremony, endsAt: ceremony.startsAt },
    { ...ceremony, venue: { latitude: 91, longitude: 181 } },
    { ...ceremony, weddingId: "000000000000000000000000" },
    { ...ceremony, venue: { mapUrl: "javascript:alert(1)" } },
  ]) {
    expect((await write(request, "functions", invalid)).status()).toBe(422);
  }
  const list = (await (await scopedGet(request, "/api/v1/functions")).json())
    .data.functions;
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe("Haldi ceremony");
  expect(await database.collection("functions").countDocuments()).toBe(1);
});

test("tenant isolation, removed memberships and organizer access", async ({
  request,
  playwright,
  database,
}) => {
  await onboard(request);
  const item = (await (await write(request, "functions", ceremony)).json()).data
    .function;
  const second = await playwright.request.newContext({ baseURL: origin });
  try {
    await onboard(second, "other@example.invalid");
    expect(
      (await (await scopedGet(second, "/api/v1/functions")).json()).data
        .functions,
    ).toEqual([]);
    expect(
      (
        await write(
          second,
          "functions/" + item.id,
          { ...ceremony, revision: 1 },
          "PATCH",
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await write(
          second,
          "functions/not-an-id",
          { ...ceremony, revision: 1 },
          "PATCH",
        )
      ).status(),
    ).toBe(404);
    const user = await database
      .collection("users")
      .findOne({ emailNormalized: "other@example.invalid" });
    await database
      .collection("weddingMemberships")
      .updateOne({ userId: user!._id }, { $set: { role: "ORGANIZER" } });
    expect((await write(second, "functions", ceremony)).status()).toBe(201);
    expect(
      (
        await write(
          second,
          "wedding",
          { ...profile, title: "Updated by organizer", revision: 1 },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    await database
      .collection("weddingMemberships")
      .updateOne({ userId: user!._id }, { $set: { status: "REMOVED" } });
    expect((await scopedGet(second, "/api/v1/functions")).status()).toBe(404);
    expect((await write(second, "functions", ceremony)).status()).toBe(404);
  } finally {
    await second.dispose();
  }
});

test("wedding profile edits preserve function instants and reject stale revisions", async ({
  request,
  database,
}) => {
  const wedding = await onboard(request);
  await write(request, "functions", ceremony);
  const patch = {
    ...profile,
    title: "Our celebration",
    timeZone: "America/New_York",
    revision: wedding.revision,
  };
  const response = await write(request, "wedding", patch, "PATCH");
  expect(response.status()).toBe(200);
  expect((await response.json()).data.wedding.title).toBe("Our celebration");
  expect((await write(request, "wedding", patch, "PATCH")).status()).toBe(409);
  expect(
    (
      await write(
        request,
        "wedding",
        { ...patch, revision: 2, role: "ADMIN" },
        "PATCH",
      )
    ).status(),
  ).toBe(422);
  const stored = await database.collection("weddings").findOne({});
  expect(stored!.startsAt.toISOString()).toBe("2027-02-18T05:00:00.000Z");
  expect(
    (await database
      .collection("functions")
      .findOne({}))!.startsAt.toISOString(),
  ).toBe(ceremony.startsAt);
});

test("new mutation routes require authentication and CSRF", async ({
  request,
  database,
}) => {
  expect(await database.collection("functions").countDocuments()).toBe(0);
  expect((await write(request, "functions", ceremony)).status()).toBe(401);
  await onboard(request);
  expect(
    (await request.post("/api/v1/functions", { data: ceremony })).status(),
  ).toBe(403);
  expect(
    (await request.patch("/api/v1/wedding", { data: profile })).status(),
  ).toBe(403);
});

test("management mutation throttling persists and returns Retry-After", async ({
  request,
  database,
}) => {
  await onboard(request);
  const user = await database.collection("users").findOne({});
  const windowStart = new Date(Math.floor(Date.now() / 900000) * 900000);
  await database.collection("rateLimitWindows").insertOne({
    keyHash: createHash("sha256")
      .update("management:" + user!._id.toHexString())
      .digest("hex"),
    windowStart,
    count: 120,
    expiresAt: new Date(+windowStart + 900000),
  });
  const response = await write(request, "functions", ceremony);
  expect(response.status()).toBe(429);
  expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
  expect(await database.collection("functions").countDocuments()).toBe(0);
});
