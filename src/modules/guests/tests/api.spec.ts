import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { test, expect } from "../../auth/tests/fixtures";
import {
  setup,
  recipient,
  invite,
  reveal,
  open,
  readGuest,
  rsvp,
  write,
  scopedGet,
} from "./fixtures";

test("both manager roles create recipient/function/link atomically with retry safety and safe DTOs", async ({
  page,
  database,
}) => {
  const { wedding, fn, second } = await setup(page.request);
  const payload = recipient([fn, second]);
  const results = await Promise.all([
    write(page.request, "guests", payload),
    write(page.request, "guests", payload),
  ]);
  expect(results.map((r) => r.status())).toEqual([201, 201]);
  expect(await database.collection("guests").countDocuments({})).toBe(1);
  expect(
    await database.collection("functionInvitations").countDocuments({}),
  ).toBe(2);
  expect(
    await database
      .collection("accessLinks")
      .countDocuments({ subjectType: "GUEST", status: "ACTIVE" }),
  ).toBe(1);
  const id = (await results[0]!.json()).data.id;
  const safe = JSON.stringify(
    (await (await scopedGet(page.request, `/api/v1/guests/${id}`)).json()).data,
  );
  expect(safe).not.toMatch(
    /tokenHash|encryptedSecret|secretNonce|sessionToken/,
  );
  expect(
    (
      await write(page.request, "guests", {
        ...payload,
        creationKey: randomUUID(),
        displayName: "   ",
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await write(page.request, "guests", {
        ...payload,
        creationKey: randomUUID(),
        functions: [
          {
            functionId: String(new mongoose.Types.ObjectId()),
            maxAttendees: 4,
          },
        ],
      })
    ).status(),
  ).toBe(422);
  expect(await database.collection("guests").countDocuments({})).toBe(1);
  await database
    .collection("weddingMemberships")
    .updateMany(
      { weddingId: new mongoose.Types.ObjectId(wedding.id) },
      { $set: { role: "ORGANIZER" } },
    );
  expect(
    (
      await write(page.request, "guests", {
        ...recipient([fn]),
        displayName: "Ananya",
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await write(
        page.request,
        `guests/${id}`,
        {
          ...payload,
          revision: 1,
          creationKey: randomUUID(),
          displayName: "Updated family",
        },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
});

test("private links reuse across devices; rotation and revoke block existing sessions without touching management", async ({
  page,
  database,
  browser,
}) => {
  const { fn } = await setup(page.request),
    guest = await invite(page.request, [fn]),
    url = await reveal(page.request, guest);
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    expect((await open(page.request, url)).status()).toBe(200);
    expect((await open(other.request, url)).status()).toBe(200);
    const data = (await (await readGuest(other.request, guest.id)).json()).data;
    expect(data.functions).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(
      /maxAttendees|deadlineOverrideAt|tokenHash|encryptedSecret|secretNonce|email/,
    );
    expect(data.displayName).toBe(guest.displayName);
    const rotate = { revision: guest.revision, creationKey: randomUUID() };
    expect(
      (
        await write(page.request, `guests/${guest.id}/links/rotate`, rotate)
      ).status(),
    ).toBe(200);
    expect(
      (
        await write(page.request, `guests/${guest.id}/links/rotate`, rotate)
      ).status(),
    ).toBe(200);
    expect((await readGuest(other.request, guest.id)).status()).toBe(404);
    expect((await open(other.request, url)).status()).toBe(404);
    const fresh = (
      await (await scopedGet(page.request, `/api/v1/guests/${guest.id}`)).json()
    ).data;
    const newUrl = await reveal(page.request, fresh);
    expect(newUrl).not.toBe(url);
    expect((await open(other.request, newUrl)).status()).toBe(200);
    expect(
      (
        await write(
          page.request,
          `guests/${guest.id}/links`,
          { revision: fresh.revision, creationKey: randomUUID() },
          "DELETE",
        )
      ).status(),
    ).toBe(200);
    expect((await readGuest(other.request, guest.id)).status()).toBe(404);
    expect((await scopedGet(page.request, "/api/v1/wedding")).status()).toBe(
      200,
    );
    expect(
      await database
        .collection("portalSessions")
        .countDocuments({ revokedAt: null }),
    ).toBe(0);
  } finally {
    await other.close();
  }
});

test("RSVP validation, concurrency, unchanged retries, deadlines and reasoned host corrections", async ({
  page,
  database,
}) => {
  const { fn } = await setup(page.request),
    guest = await invite(page.request, [fn]);
  await open(page.request, await reveal(page.request, guest));
  const id = guest.functions[0].invitationId;
  for (const count of [0, -1, 1.5, 5])
    expect((await rsvp(page.request, guest.id, id, 1, count)).status()).toBe(
      422,
    );
  const key = randomUUID();
  expect(
    (await rsvp(page.request, guest.id, id, 1, 3, "ACCEPTED", key)).status(),
  ).toBe(200);
  expect(
    (await rsvp(page.request, guest.id, id, 1, 3, "ACCEPTED", key)).status(),
  ).toBe(200);
  const racing = await Promise.all([
    rsvp(page.request, guest.id, id, 2, 2),
    rsvp(page.request, guest.id, id, 2, 4),
  ]);
  expect(racing.map((r) => r.status()).sort()).toEqual([200, 409]);
  await database
    .collection("functionInvitations")
    .updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { deadlineOverrideAt: new Date(Date.now() - 1000) } },
    );
  expect((await rsvp(page.request, guest.id, id, 3, 1)).status()).toBe(409);
  expect(
    (
      await write(
        page.request,
        `function-invitations/${id}/rsvp`,
        {
          status: "DECLINED",
          attendeeCount: 0,
          revision: 3,
          reason: "Family contacted host",
          creationKey: randomUUID(),
        },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  const view = (await (await readGuest(page.request, guest.id)).json()).data;
  expect(view.functions[0].status).toBe("DECLINED");
  expect(view.functions[0].attendeeCount).toBe(0);
  expect(view.functions).toHaveLength(1);
  expect(
    await database.collection("auditEvents").countDocuments({
      action: "GUEST_RSVP_CORRECTED",
      "details.reason": "Family contacted host",
    }),
  ).toBe(1);
});

test("limit edits cannot truncate accepted people; uninvite and reinvite preserve history and reset responses", async ({
  page,
  database,
}) => {
  const { fn, second } = await setup(page.request),
    guest = await invite(page.request, [fn, second]);
  await open(page.request, await reveal(page.request, guest));
  const id = guest.functions[0].invitationId;
  await rsvp(page.request, guest.id, id, 1, 3);
  const payload = recipient([fn, second]);
  expect(
    (
      await write(
        page.request,
        `guests/${guest.id}`,
        {
          ...payload,
          revision: 1,
          functions: [
            {
              functionId: fn.id,
              maxAttendees: 2,
              deadlineOverrideAt: null,
              revision: 2,
            },
            {
              functionId: second.id,
              maxAttendees: 4,
              deadlineOverrideAt: null,
              revision: 1,
            },
          ],
        },
        "PATCH",
      )
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(
        page.request,
        `guests/${guest.id}`,
        { ...recipient([second]), revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  expect(
    (await (await readGuest(page.request, guest.id)).json()).data.functions.map(
      (f: { id: string }) => f.id,
    ),
  ).toEqual([second.id]);
  expect(
    (await database
      .collection("functionInvitations")
      .findOne({ _id: new mongoose.Types.ObjectId(id) }))!.attendeeCount,
  ).toBe(3);
  expect(
    (
      await write(
        page.request,
        `guests/${guest.id}`,
        { ...payload, revision: 2 },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  const restored = (
    await (await readGuest(page.request, guest.id)).json()
  ).data.functions.find((f: { id: string }) => f.id === fn.id);
  expect(restored.status).toBe("PENDING");
  expect(restored.attendeeCount).toBe(0);
  expect(
    await database.collection("auditEvents").countDocuments({
      action: "GUEST_FUNCTION_REINVITED",
      "details.previousCount": 3,
    }),
  ).toBe(1);
});

test("summary uses all active records and function headcounts, and excludes revoked links and archived functions", async ({
  page,
  database,
}) => {
  const { fn, second } = await setup(page.request);
  const guests = [];
  for (let i = 0; i < 27; i++)
    guests.push(await invite(page.request, [fn, second]));
  const guest = guests[0];
  await open(page.request, await reveal(page.request, guest));
  await rsvp(page.request, guest.id, guest.functions[0].invitationId, 1, 3);
  const summary = async () =>
    (await (await scopedGet(page.request, "/api/v1/guests/summary")).json())
      .data;
  expect((await summary()).functions[0]).toMatchObject({
    invited: 27,
    accepted: 1,
    pending: 26,
    declined: 0,
    people: 3,
  });
  const first = (await (await scopedGet(page.request, "/api/v1/guests")).json())
    .data;
  expect(first.items).toHaveLength(25);
  expect(first.total).toBe(27);
  const next = (
    await (
      await scopedGet(page.request, `/api/v1/guests?cursor=${first.nextCursor}`)
    ).json()
  ).data;
  expect(next.items).toHaveLength(2);
  await write(
    page.request,
    `guests/${guest.id}/links`,
    { revision: 1, creationKey: randomUUID() },
    "DELETE",
  );
  expect((await summary()).functions[0]).toMatchObject({
    invited: 26,
    accepted: 0,
    pending: 26,
    people: 0,
  });
  expect(
    (
      await write(page.request, `functions/${second.id}/archive`, {
        revision: second.revision,
      })
    ).status(),
  ).toBe(200);
  expect((await summary()).functions).toHaveLength(1);
  expect(
    (
      await (
        await scopedGet(page.request, "/api/v1/operations?view=dashboard")
      ).json()
    ).data.guestResponses.functions[0].invited,
  ).toBe(26);
  void database;
});

test("guest capabilities and manager tenant selection reject foreign references, CSRF and revoked members", async ({
  page,
  database,
  browser,
}) => {
  const { wedding, fn } = await setup(page.request),
    guest = await invite(page.request, [fn]);
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const { fn: foreign } = await setup(
        other.request,
        "other-guest@example.invalid",
      ),
      second = await invite(other.request, [foreign]);
    await open(page.request, await reveal(page.request, guest));
    expect(
      (
        await rsvp(page.request, guest.id, second.functions[0].invitationId, 1)
      ).status(),
    ).toBe(404);
    expect(
      (await write(page.request, "guests", recipient([foreign]))).status(),
    ).toBe(422);
    expect(
      (
        await page.request.get(`/api/v1/guests/${second.id}`, {
          headers: { "X-Wedding-Id": wedding.id },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.put(
          `/api/v1/guest/function-invitations/${guest.functions[0].invitationId}/rsvp`,
          { headers: { "X-Guest-Id": guest.id }, data: {} },
        )
      ).status(),
    ).toBe(403);
    await database
      .collection("weddingMemberships")
      .updateMany(
        { weddingId: new mongoose.Types.ObjectId(wedding.id) },
        { $set: { status: "REMOVED" } },
      );
    expect(
      (
        await write(page.request, `guests/${guest.id}/links/reveal`, {
          revision: 1,
          creationKey: randomUUID(),
        })
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
});

test("RSVP races with link revocation cannot restore access or active totals", async ({
  page,
  database,
}) => {
  const { fn } = await setup(page.request),
    guest = await invite(page.request, [fn]);
  await open(page.request, await reveal(page.request, guest));
  const result = await Promise.all([
    rsvp(page.request, guest.id, guest.functions[0].invitationId, 1, 3),
    write(
      page.request,
      `guests/${guest.id}/links`,
      { revision: 1, creationKey: randomUUID() },
      "DELETE",
    ),
  ]);
  expect([200, 404]).toContain(result[0]!.status());
  expect(result[1]!.status()).toBe(200);
  expect((await readGuest(page.request, guest.id)).status()).toBe(404);
  expect(
    (await (await scopedGet(page.request, "/api/v1/guests/summary")).json())
      .data.functions[0],
  ).toMatchObject({ invited: 0, people: 0 });
  void database;
});

test("guest session expiry and populated wedding deletion preserve unrelated account and wedding", async ({
  page,
  database,
  browser,
}) => {
  const { wedding, fn } = await setup(page.request),
    guest = await invite(page.request, [fn]),
    url = await reveal(page.request, guest);
  await open(page.request, url);
  await database
    .collection("portalSessions")
    .updateMany(
      { guestId: new mongoose.Types.ObjectId(guest.id) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
  expect((await readGuest(page.request, guest.id)).status()).toBe(404);
  await open(page.request, url);
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const foreign = await setup(other.request, "delete-other@example.invalid"),
      untouched = await invite(other.request, [foreign.fn]);
    expect(
      (
        await write(
          page.request,
          "wedding",
          { revision: 1, confirmationTitle: wedding.title },
          "DELETE",
        )
      ).status(),
    ).toBe(204);
    for (const name of [
      "guests",
      "functionInvitations",
      "accessLinks",
      "portalSessions",
    ])
      expect(
        await database.collection(name).countDocuments({
          weddingId: new mongoose.Types.ObjectId(wedding.id),
        }),
      ).toBe(0);
    expect((await readGuest(page.request, guest.id)).status()).toBe(404);
    expect(
      (
        await scopedGet(other.request, `/api/v1/guests/${untouched.id}`)
      ).status(),
    ).toBe(200);
    expect((await page.request.get("/api/v1/auth/me")).status()).toBe(200);
  } finally {
    await other.close();
  }
});

test("a concurrent limit edit and guest reply always preserve the current maximum", async ({
  page,
  database,
}) => {
  const { fn } = await setup(page.request),
    guest = await invite(page.request, [fn]);
  await open(page.request, await reveal(page.request, guest));
  const id = guest.functions[0].invitationId;
  const results = await Promise.all([
    rsvp(page.request, guest.id, id, 1, 3),
    write(
      page.request,
      `guests/${guest.id}`,
      {
        ...recipient([fn]),
        revision: 1,
        functions: [
          {
            functionId: fn.id,
            maxAttendees: 2,
            deadlineOverrideAt: null,
            revision: 1,
          },
        ],
      },
      "PATCH",
    ),
  ]);
  expect([
    [200, 409],
    [422, 200],
  ]).toContainEqual(results.map((r) => r.status()));
  const row = await database
    .collection("functionInvitations")
    .findOne({ _id: new mongoose.Types.ObjectId(id) });
  expect(row!.attendeeCount).toBeLessThanOrEqual(row!.maxAttendees);
});

test("separate invitation cookies do not retarget tabs and a name edit preserves a newer guest response", async ({
  page,
  database,
}) => {
  const { fn } = await setup(page.request),
    first = await invite(page.request, [fn]),
    second = await invite(page.request, [fn]);
  await open(page.request, await reveal(page.request, first));
  await open(page.request, await reveal(page.request, second));
  expect(
    (await (await readGuest(page.request, first.id)).json()).data.guestId,
  ).toBe(first.id);
  expect(
    (await (await readGuest(page.request, second.id)).json()).data.guestId,
  ).toBe(second.id);
  await rsvp(page.request, first.id, first.functions[0].invitationId, 1, 3);
  expect(
    (
      await write(
        page.request,
        `guests/${first.id}`,
        {
          ...recipient([fn]),
          displayName: "Updated recipient",
          revision: 1,
          functions: [
            {
              functionId: fn.id,
              maxAttendees: 4,
              deadlineOverrideAt: null,
              revision: 1,
            },
          ],
        },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  const view = (await (await readGuest(page.request, first.id)).json()).data;
  expect(view.displayName).toBe("Updated recipient");
  expect(view.functions[0].attendeeCount).toBe(3);
  void database;
});

test("expired guest links reject exchange and can be safely replaced without losing responses", async ({
  page,
  database,
}) => {
  const { fn } = await setup(page.request),
    guest = await invite(page.request, [fn]),
    url = await reveal(page.request, guest);
  expect((await open(page.request, url)).status()).toBe(200);
  const first = (await (await readGuest(page.request, guest.id)).json()).data
    .functions[0];
  expect(
    (
      await rsvp(page.request, guest.id, first.invitationId, first.revision, 2)
    ).status(),
  ).toBe(200);
  await database
    .collection("accessLinks")
    .updateOne(
      { guestId: new mongoose.Types.ObjectId(guest.id), status: "ACTIVE" },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
  expect((await open(page.request, url)).status()).toBe(404);
  expect((await readGuest(page.request, guest.id)).status()).toBe(404);
  expect(
    (
      await write(page.request, `guests/${guest.id}/links/rotate`, {
        revision: guest.revision,
        creationKey: randomUUID(),
      })
    ).status(),
  ).toBe(200);
  const current = (
    await (await scopedGet(page.request, `/api/v1/guests/${guest.id}`)).json()
  ).data;
  const replacement = await reveal(page.request, current);
  expect((await open(page.request, replacement)).status()).toBe(200);
  const response = (await (await readGuest(page.request, guest.id)).json()).data
    .functions[0];
  expect(response.status).toBe("ACCEPTED");
  expect(response.attendeeCount).toBe(2);
  expect(
    await database.collection("accessLinks").countDocuments({
      guestId: new mongoose.Types.ObjectId(guest.id),
      status: "ACTIVE",
    }),
  ).toBe(1);
  const retired = await database.collection("accessLinks").findOne({
    guestId: new mongoose.Types.ObjectId(guest.id),
    status: "REVOKED",
  });
  expect(retired?.encryptedSecret).toBe("");
});
