import {
  account,
  expect,
  mutation,
  origin,
  test,
} from "../../auth/tests/fixtures";
import type { APIRequestContext } from "@playwright/test";

const wedding = {
  title: "Pavithra & Manish’s Wedding",
  coupleNames: { first: "Pavithra", second: "Manish" },
  tradition: "HINDU",
  startsOn: "2027-02-18",
  endsOn: "2027-02-21",
  timeZone: "Asia/Kolkata",
  description: "A four-day celebration with family and friends.",
};

async function create(api: APIRequestContext, data: unknown = wedding) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.post("/api/v1/weddings", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
    },
    data,
  });
}

test("creates one wedding and its first administrator atomically", async ({
  request,
  database,
}) => {
  expect((await mutation(request, "register", account)).status()).toBe(201);
  const response = await create(request);
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.data.wedding).toMatchObject({
    title: wedding.title,
    coupleNames: wedding.coupleNames,
    tradition: "HINDU",
    startsOn: wedding.startsOn,
    endsOn: wedding.endsOn,
    status: "ACTIVE",
  });
  expect(Object.keys(body.data.wedding).sort()).toEqual([
    "coupleNames",
    "description",
    "endsOn",
    "id",
    "revision",
    "startsOn",
    "status",
    "timeZone",
    "title",
    "tradition",
  ]);
  const storedWedding = await database.collection("weddings").findOne({});
  const membership = await database
    .collection("weddingMemberships")
    .findOne({});
  expect(storedWedding).toMatchObject({ status: "ACTIVE", adminCount: 1 });
  expect(storedWedding!.startsAt.toISOString()).toBe(
    "2027-02-17T18:30:00.000Z",
  );
  expect(storedWedding!.endsAt.toISOString()).toBe("2027-02-21T18:29:59.999Z");
  expect(membership).toMatchObject({
    weddingId: storedWedding!._id,
    role: "ADMIN",
    status: "ACTIVE",
  });
  const me = await (await request.get("/api/v1/auth/me")).json();
  expect(me.data.membership).toEqual({
    weddingId: storedWedding!._id.toHexString(),
    role: "ADMIN",
  });
  const current = await request.get("/api/v1/wedding");
  expect(current.status()).toBe(200);
  expect((await current.json()).data.role).toBe("ADMIN");
});

test("derives UTC boundaries using the wedding zone across daylight saving", async ({
  request,
  database,
}) => {
  await mutation(request, "register", account);
  const response = await create(request, {
    ...wedding,
    startsOn: "2027-03-14",
    endsOn: "2027-03-14",
    timeZone: "America/New_York",
  });
  expect(response.status()).toBe(201);
  const stored = await database.collection("weddings").findOne({});
  expect(stored!.startsAt.toISOString()).toBe("2027-03-14T05:00:00.000Z");
  expect(stored!.endsAt.toISOString()).toBe("2027-03-15T03:59:59.999Z");
});

test("rejects invalid or unauthenticated wedding creation without writes", async ({
  request,
  playwright,
  database,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await create(anonymous)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  await mutation(request, "register", account);
  const invalid = await create(request, {
    ...wedding,
    userId: "000000000000000000000001",
    startsOn: "2027-02-31",
    endsOn: "2027-02-01",
    timeZone: "Not/AZone",
  });
  expect(invalid.status()).toBe(422);
  const fields = (await invalid.json()).error.details.fields;
  expect(fields.startsOn).toBeTruthy();
  expect(fields.timeZone).toBeTruthy();
  expect(await database.collection("weddings").countDocuments()).toBe(0);
  expect(await database.collection("weddingMemberships").countDocuments()).toBe(
    0,
  );
});

test("wedding creation and editing persist correct midnight-gap boundaries", async ({
  request,
  database,
}) => {
  await mutation(request, "register", account);
  const response = await create(request, {
    ...wedding,
    startsOn: "2018-11-04",
    endsOn: "2018-11-04",
    timeZone: "America/Sao_Paulo",
  });
  expect(response.status()).toBe(201);
  let stored = await database.collection("weddings").findOne({});
  expect(stored!.startsAt.toISOString()).toBe("2018-11-04T03:00:00.000Z");
  expect(stored!.endsAt.toISOString()).toBe("2018-11-05T01:59:59.999Z");
  const csrf = await request.get("/api/v1/auth/csrf");
  const edited = await request.patch("/api/v1/wedding", {
    headers: { Origin: origin, "X-CSRF-Token": (await csrf.json()).data.token },
    data: {
      ...wedding,
      startsOn: "2018-11-03",
      endsOn: "2018-11-03",
      timeZone: "America/Sao_Paulo",
      revision: 1,
    },
  });
  expect(edited.status()).toBe(200);
  stored = await database.collection("weddings").findOne({});
  expect(stored!.endsAt.toISOString()).toBe("2018-11-04T02:59:59.999Z");
});

test("concurrent submissions cannot create duplicate memberships or orphan weddings", async ({
  request,
  database,
}) => {
  await mutation(request, "register", account);
  const responses = await Promise.all([create(request), create(request)]);
  expect(responses.map((response) => response.status()).sort()).toEqual([
    201, 409,
  ]);
  expect(await database.collection("weddings").countDocuments()).toBe(1);
  expect(await database.collection("weddingMemberships").countDocuments()).toBe(
    1,
  );
});
