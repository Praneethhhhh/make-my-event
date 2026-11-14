import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  account,
  mutation,
  scopedGet,
  origin,
} from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";
import { write } from "./fixtures";
const draft = {
  title: "Confirm flowers",
  description: "",
  assigneeType: "USER",
  assigneeUserId: null,
  assigneeVendorId: null,
  vendorId: null,
  functionId: null,
  weddingTimeZone: "Asia/Kolkata",
  status: "TODO",
  priority: "NORMAL",
  dueAt: null,
};
const expense = {
  description: "Venue permit",
  category: "Venue",
  amountPaise: 100000,
  currency: "INR",
  vendorId: null,
  notes: "",
};
const payment = (id: string, amountPaise = 25000) => ({
  expenseId: id,
  expenseSource: "expenses",
  amountPaise,
  currency: "INR",
  paidAt: "2026-11-14T10:00:00.000Z",
  paymentMethod: "UPI",
  weddingTimeZone: "Asia/Kolkata",
  notes: "",
  creationKey: randomUUID(),
});

test("required human ownership, combined assignment/mentions and retry-safe notification events", async ({
  page,
  database,
  browser,
}) => {
  const wedding = await onboard(page.request);
  const weddingId = new mongoose.Types.ObjectId(wedding.id);
  const me = (await (await page.request.get("/api/v1/auth/me")).json()).data
    .user;
  const other = await browser.newContext({ baseURL: origin });
  try {
    await mutation(
      other.request,
      "register",
      {
        ...account,
        email: "helper@example.invalid",
        displayName: "Family Helper",
      },
      "helper",
    );
    const helper = await database
      .collection("users")
      .findOne({ emailNormalized: "helper@example.invalid" });
    const helperId = String(helper!._id);
    await database.collection("weddingMemberships").insertOne({
      weddingId,
      userId: helper!._id,
      status: "ACTIVE",
      role: "ORGANIZER",
      revision: 1,
    });
    const payload = {
      ...draft,
      assigneeUserId: helperId,
      title: "Ask @Family Helper",
      mentions: [{ userId: helperId, field: "title", start: 4, end: 18 }],
      creationKey: randomUUID(),
    };
    const saved = await write(page.request, "tasks", payload);
    expect(saved.status()).toBe(201);
    const row = (await saved.json()).data;
    expect((await write(page.request, "tasks", payload)).status()).toBe(201);
    expect(
      await database.collection("tasks").countDocuments({ weddingId }),
    ).toBe(1);
    const notices = await database
      .collection("notifications")
      .find({ weddingId })
      .toArray();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.kind).toBe("ASSIGNED_MENTION");
    const helperNotices = (
      await (
        await other.request.get("/api/v1/notifications", {
          headers: { "X-Wedding-Id": wedding.id },
        })
      ).json()
    ).data.items;
    expect(helperNotices[0].commentId).toBeNull();
    expect(helperNotices[0].available).toBe(true);
    expect(
      (
        await write(
          page.request,
          `tasks/${row.id}`,
          {
            ...payload,
            revision: 1,
            priority: "HIGH",
            creationKey: randomUUID(),
          },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    expect(
      await database.collection("notifications").countDocuments({ weddingId }),
    ).toBe(1);
    expect(
      (
        await write(
          page.request,
          `tasks/${row.id}`,
          {
            ...payload,
            assigneeUserId: me.id,
            revision: 2,
            creationKey: randomUUID(),
          },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    expect(
      await database.collection("notifications").countDocuments({
        weddingId,
        recipientUserId: new mongoose.Types.ObjectId(me.id),
        kind: "ASSIGNED",
      }),
    ).toBe(1);
    const { assigneeUserId: _, ...missingOwner } = draft;
    void _;
    expect(
      (
        await write(page.request, "tasks", {
          ...missingOwner,
          creationKey: randomUUID(),
          assigneeUserId: "",
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await write(page.request, "tasks", {
          ...draft,
          assigneeType: "VENDOR",
          assigneeVendorId: helperId,
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await write(page.request, "tasks", {
          ...draft,
          title: "Ask @Someone Else",
          mentions: payload.mentions,
        })
      ).status(),
    ).toBe(422);
    await database
      .collection("weddingMemberships")
      .updateOne(
        { weddingId, userId: helper!._id },
        { $set: { status: "REMOVED" } },
      );
    expect(
      (
        await write(page.request, "tasks", {
          ...draft,
          assigneeUserId: helperId,
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await write(page.request, "tasks", { ...draft, status: "COMPLETED" })
      ).status(),
    ).toBe(201);
    const mineAll = (
      await (await scopedGet(page.request, "/api/v1/tasks?mine=true")).json()
    ).data.items;
    expect(
      mineAll.some((row: { status: string }) => row.status === "COMPLETED"),
    ).toBe(true);
    const mineOpen = (
      await (await scopedGet(page.request, "/api/v1/tasks?scope=mine")).json()
    ).data.items;
    expect(
      mineOpen.every((row: { status: string }) => row.status !== "COMPLETED"),
    ).toBe(true);
    expect(
      (
        await (
          await scopedGet(
            page.request,
            `/api/v1/tasks?mine=true&owner=${helperId}&status=TODO`,
          )
        ).json()
      ).data.items,
    ).toEqual([]);
  } finally {
    await other.close();
  }
});

test("searched choices are paginated and can find members beyond 500 without crossing weddings", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  const weddingId = new mongoose.Types.ObjectId(wedding.id);
  const people = Array.from({ length: 510 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    displayName: `Organizer ${String(index).padStart(3, "0")}`,
    emailNormalized: `picker-${index}@example.invalid`,
    status: "ACTIVE",
  }));
  await database.collection("users").insertMany(people);
  await database.collection("weddingMemberships").insertMany(
    people.map((person) => ({
      weddingId,
      userId: person._id,
      status: "ACTIVE",
      role: "ORGANIZER",
    })),
  );
  const first = (
    await (
      await scopedGet(
        page.request,
        "/api/v1/operations?view=choices&type=people",
      )
    ).json()
  ).data;
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).toBeTruthy();
  const found = (
    await (
      await scopedGet(
        page.request,
        "/api/v1/operations?view=choices&type=people&q=Organizer%20509",
      )
    ).json()
  ).data;
  expect(found.items).toEqual([
    { id: String(people[509]!._id), name: "Organizer 509" },
  ]);
  const literal = (
    await (
      await scopedGet(
        page.request,
        "/api/v1/operations?view=choices&type=people&q=%5B",
      )
    ).json()
  ).data;
  expect(literal.items).toEqual([]);
  const page2 = (
    await (
      await scopedGet(
        page.request,
        `/api/v1/operations?view=choices&type=people&cursor=${first.nextCursor}`,
      )
    ).json()
  ).data;
  expect(
    new Set(
      [...first.items, ...page2.items].map((item: { id: string }) => item.id),
    ).size,
  ).toBe(100);
});

test("non-vendor expenses support partial payments, replay and correction history", async ({
  page,
  database,
}) => {
  await onboard(page.request);
  const payload = { ...expense, creationKey: randomUUID() };
  const response = await write(page.request, "finance/expenses", payload);
  expect(response.status()).toBe(201);
  const cost = (await response.json()).data;
  expect(
    (await write(page.request, "finance/expenses", payload)).status(),
  ).toBe(201);
  expect(await database.collection("expenses").countDocuments({})).toBe(1);
  expect(
    (
      await scopedGet(
        page.request,
        "/api/v1/finance/expenses?expenseId=bad&expenseSource=expenses",
      )
    ).status(),
  ).toBe(400);
  const posted = payment(cost.id);
  const paid = await write(page.request, "finance/payments", posted);
  expect(paid.status()).toBe(201);
  const receipt = (await paid.json()).data;
  expect((await write(page.request, "finance/payments", posted)).status()).toBe(
    201,
  );
  expect(await database.collection("expensePayments").countDocuments({})).toBe(
    1,
  );
  expect(
    (
      await (
        await scopedGet(
          page.request,
          `/api/v1/finance/expenses?expenseId=${cost.id}&expenseSource=expenses`,
        )
      ).json()
    ).data.items[0].outstandingPaise,
  ).toBe(75000);
  expect(
    (await (await scopedGet(page.request, "/api/v1/finance/summary")).json())
      .data,
  ).toEqual({ actualPaid: 25000, outstanding: 75000 });
  expect(
    (
      await write(page.request, "finance/payments", payment(cost.id, 75001))
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(page.request, "finance/payments", {
        ...payment(cost.id),
        weddingTimeZone: "UTC",
      })
    ).status(),
  ).toBe(409);
  const correct = (source: string) => ({
    source,
    revision: 1,
    reason: "Duplicate receipt",
    creationKey: randomUUID(),
  });
  expect(
    (
      await write(
        page.request,
        `finance/expenses/${cost.id}/correct`,
        correct("expenses"),
      )
    ).status(),
  ).toBe(409);
  const correction = correct("expensePayments");
  expect(
    (
      await write(
        page.request,
        `finance/payments/${receipt.id}/correct`,
        correction,
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await write(
        page.request,
        `finance/payments/${receipt.id}/correct`,
        correction,
      )
    ).status(),
  ).toBe(200);
  expect(
    (await (await scopedGet(page.request, "/api/v1/finance/summary")).json())
      .data,
  ).toEqual({ actualPaid: 0, outstanding: 100000 });
  expect(
    (
      await write(
        page.request,
        `finance/expenses/${cost.id}/correct`,
        correct("expenses"),
      )
    ).status(),
  ).toBe(200);
  const history = (
    await (await scopedGet(page.request, "/api/v1/finance/payments")).json()
  ).data.items;
  expect(history[0].voidReason).toBe("Duplicate receipt");
  expect(history[0].status).toBe("VOID");
});

test("legacy finance adapters reconcile and old/new payment writers cannot jointly overpay", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  const weddingId = new mongoose.Types.ObjectId(wedding.id);
  const vendor = await database
    .collection("vendors")
    .insertOne({ weddingId, name: "Family florist", status: "ACTIVE" });
  const legacy = await database.collection("expenses").insertOne({
    weddingId,
    description: "Already paid",
    amountPaise: 12345,
    status: "POSTED",
    revision: 1,
    paidAt: new Date(),
    createdAt: new Date(),
  });
  const charge = await database.collection("vendorCharges").insertOne({
    weddingId,
    vendorId: vendor.insertedId,
    description: "Flowers",
    amountPaise: 100000,
    status: "ACTIVE",
    revision: 1,
    createdAt: new Date(),
  });
  await database.collection("vendorPayments").insertOne({
    weddingId,
    vendorId: vendor.insertedId,
    chargeId: charge.insertedId,
    amountPaise: 25000,
    status: "POSTED",
    revision: 1,
    paidAt: new Date(),
    createdAt: new Date(),
  });
  const summary = async () =>
    (await (await scopedGet(page.request, "/api/v1/finance/summary")).json())
      .data;
  expect(await summary()).toEqual({ actualPaid: 37345, outstanding: 75000 });
  const costs = (
    await (await scopedGet(page.request, "/api/v1/finance/expenses")).json()
  ).data.items;
  expect(
    costs.find((row: { id: string }) => row.id === String(legacy.insertedId))
      .outstandingPaise,
  ).toBe(0);
  const outcomes = await Promise.all([
    write(page.request, "finance/payments", {
      ...payment(String(charge.insertedId), 50000),
      expenseSource: "vendorCharges",
    }),
    write(page.request, "vendor-payments", {
      vendorId: String(vendor.insertedId),
      chargeId: String(charge.insertedId),
      amountPaise: 50000,
      currency: "INR",
      paidAt: new Date().toISOString(),
      paymentMethod: "CASH",
      notes: "",
      creationKey: randomUUID(),
    }),
  ]);
  expect(outcomes.map((response) => response.status()).sort()).toEqual([
    201, 409,
  ]);
  expect(await summary()).toEqual({ actualPaid: 87345, outstanding: 25000 });
  expect(
    (
      await write(page.request, `vendor-charges/${charge.insertedId}/void`, {
        revision: 1,
        reason: "Should block",
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(
        page.request,
        "finance/payments",
        payment(String(legacy.insertedId)),
      )
    ).status(),
  ).toBe(422);
  const balances = (
    await (
      await scopedGet(page.request, "/api/v1/finance/vendor-balances")
    ).json()
  ).data.items;
  expect(balances[0].paidPaise).toBe(75000);
  expect(balances[0].outstandingPaise).toBe(25000);
});

test("finance mutations reject foreign references, stale corrections and revoked management access", async ({
  page,
  database,
  browser,
}) => {
  const wedding = await onboard(page.request);
  const other = await browser.newContext({ baseURL: origin });
  try {
    await onboard(other.request, "other-finance@example.invalid");
    const otherCost = (
      await (
        await write(other.request, "finance/expenses", {
          ...expense,
          creationKey: randomUUID(),
        })
      ).json()
    ).data;
    expect(
      (
        await write(page.request, "finance/payments", payment(otherCost.id))
      ).status(),
    ).toBe(422);
    const cost = (
      await (
        await write(page.request, "finance/expenses", {
          ...expense,
          creationKey: randomUUID(),
        })
      ).json()
    ).data;
    expect(
      (
        await write(page.request, `finance/expenses/${cost.id}/correct`, {
          source: "expenses",
          revision: 2,
          reason: "Stale",
          creationKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.post("/api/v1/finance/expenses", {
          headers: { "X-Wedding-Id": wedding.id },
          data: { ...expense, creationKey: randomUUID() },
        })
      ).status(),
    ).toBe(403);
    await database
      .collection("weddingMemberships")
      .updateMany(
        { weddingId: new mongoose.Types.ObjectId(wedding.id) },
        { $set: { status: "REMOVED" } },
      );
    expect(
      (await scopedGet(page.request, "/api/v1/finance/summary")).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
});
