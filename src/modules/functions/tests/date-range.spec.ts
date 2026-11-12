import { scopedGet } from "../../auth/tests/fixtures";
import { test, expect, origin } from "../../auth/tests/fixtures";
import { onboard, write, ceremony, profile } from "./fixtures";

test("function times must remain inside the inclusive wedding dates on create and edit", async ({
  request,
  database,
}) => {
  await onboard(request);
  for (const dates of [
    { startsAt: "2027-02-17T18:29:59.999Z", endsAt: null },
    { startsAt: "2027-02-21T18:30:00.000Z", endsAt: null },
    { startsAt: ceremony.startsAt, endsAt: "2027-02-21T18:30:00.000Z" },
  ]) {
    expect(
      (await write(request, "functions", { ...ceremony, ...dates })).status(),
    ).toBe(422);
  }
  const created = await write(request, "functions", {
    ...ceremony,
    startsAt: "2027-02-17T18:30:00.000Z",
    endsAt: "2027-02-21T18:29:59.999Z",
  });
  expect(created.status()).toBe(201);
  const item = (await created.json()).data.function;
  expect(
    (
      await write(
        request,
        "functions/" + item.id,
        { ...ceremony, startsAt: "2027-02-17T18:29:59.999Z", revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(422);
  expect(await database.collection("functions").countDocuments()).toBe(1);
});

test("wedding dates cannot exclude an existing function; archiving permits the change", async ({
  request,
  database,
}) => {
  await onboard(request);
  const item = (await (await write(request, "functions", ceremony)).json()).data
    .function;
  const shrink = { ...profile, startsOn: "2027-02-20", revision: 1 };
  expect((await write(request, "wedding", shrink, "PATCH")).status()).toBe(422);
  expect((await database.collection("weddings").findOne({}))!.startsOn).toBe(
    profile.startsOn,
  );
  expect(
    (
      await write(request, `functions/${item.id}/archive`, { revision: 2 })
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(request, `functions/${item.id}/archive`, { revision: 1 })
    ).status(),
  ).toBe(200);
  expect(
    (
      await write(request, `functions/${item.id}/archive`, { revision: 1 })
    ).status(),
  ).toBe(200);
  expect(
    (await (await scopedGet(request, "/api/v1/functions")).json()).data
      .functions,
  ).toEqual([]);
  expect((await database.collection("functions").findOne({}))!.status).toBe(
    "ARCHIVED",
  );
  expect(
    await database
      .collection("auditEvents")
      .countDocuments({ action: "FUNCTION_ARCHIVED" }),
  ).toBe(1);
  expect(
    (
      await write(
        request,
        "functions/" + item.id,
        { ...ceremony, revision: 2 },
        "PATCH",
      )
    ).status(),
  ).toBe(404);
  expect((await write(request, "wedding", shrink, "PATCH")).status()).toBe(200);
});

test("archive cannot cross weddings and requires CSRF", async ({
  request,
  playwright,
  database,
}) => {
  await onboard(request);
  const item = (await (await write(request, "functions", ceremony)).json()).data
    .function;
  expect(
    (
      await request.post(`/api/v1/functions/${item.id}/archive`, {
        data: { revision: 1 },
      })
    ).status(),
  ).toBe(403);
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    await onboard(other, "other-range@example.invalid");
    expect(
      (
        await write(other, `functions/${item.id}/archive`, { revision: 1 })
      ).status(),
    ).toBe(404);
    expect((await database.collection("functions").findOne({}))!.status).toBe(
      "ACTIVE",
    );
  } finally {
    await other.dispose();
  }
});

test("time-zone changes cannot move a function outside the wedding day", async ({
  request,
  database,
}) => {
  await onboard(request);
  const day = {
    ...profile,
    startsOn: "2027-02-19",
    endsOn: "2027-02-19",
    revision: 1,
  };
  expect((await write(request, "wedding", day, "PATCH")).status()).toBe(200);
  expect((await write(request, "functions", ceremony)).status()).toBe(201);
  expect(
    (
      await write(
        request,
        "wedding",
        { ...day, revision: 2, timeZone: "Pacific/Honolulu" },
        "PATCH",
      )
    ).status(),
  ).toBe(422);
  expect((await database.collection("weddings").findOne({}))!.timeZone).toBe(
    "Asia/Kolkata",
  );
});

test("concurrent wedding shrink and function creation cannot violate the date range", async ({
  request,
  database,
}) => {
  await onboard(request);
  const results = await Promise.all([
    write(request, "functions", ceremony),
    write(
      request,
      "wedding",
      { ...profile, startsOn: "2027-02-20", revision: 1 },
      "PATCH",
    ),
  ]);
  expect(results.some((result) => [409, 422].includes(result.status()))).toBe(
    true,
  );
  const wedding = await database.collection("weddings").findOne({});
  const functions = await database
    .collection("functions")
    .find({ status: "ACTIVE" })
    .toArray();
  for (const item of functions) {
    expect(item.startsAt.valueOf()).toBeGreaterThanOrEqual(
      wedding!.startsAt.valueOf(),
    );
    expect(item.endsAt.valueOf()).toBeLessThanOrEqual(
      wedding!.endsAt.valueOf(),
    );
  }
});
