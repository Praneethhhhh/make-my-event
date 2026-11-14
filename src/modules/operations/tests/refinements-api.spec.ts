import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { test, expect, scopedGet } from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";
import { write } from "./fixtures";

test("one-step paid entries are atomic, replay-safe and retain removal history", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  const payload = {
    description: "Unexpected flowers",
    category: "Flowers",
    amountPaise: 12345,
    currency: "INR",
    vendorId: null,
    notes: "Receipt",
    creationKey: randomUUID(),
    weddingTimeZone: "Asia/Kolkata",
    paidAt: "2026-11-14T10:00:00.000Z",
    paymentMethod: "UPI",
  };
  const outcomes = await Promise.all([
    write(page.request, "finance/paid-expenses", payload),
    write(page.request, "finance/paid-expenses", payload),
  ]);
  expect(outcomes.map((r) => r.status())).toEqual([201, 201]);
  const first = (await outcomes[0]!.json()).data;
  expect((await outcomes[1]!.json()).data).toEqual(first);
  expect(await database.collection("expenses").countDocuments({})).toBe(1);
  expect(await database.collection("expensePayments").countDocuments({})).toBe(
    1,
  );
  const summary = async () =>
    (await (await scopedGet(page.request, "/api/v1/finance/summary")).json())
      .data;
  expect(await summary()).toEqual({ actualPaid: 12345, outstanding: 0 });
  expect(
    (
      await write(page.request, "finance/paid-expenses", {
        ...payload,
        creationKey: randomUUID(),
        weddingTimeZone: "UTC",
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(page.request, "finance/paid-expenses", {
        ...payload,
        creationKey: randomUUID(),
        vendorId: String(new mongoose.Types.ObjectId()),
      })
    ).status(),
  ).toBe(422);
  expect(await database.collection("expenses").countDocuments({})).toBe(1);
  const removal = {
    source: "expensePayments",
    revision: 1,
    reason: "Duplicate purchase",
    creationKey: randomUUID(),
  };
  expect(
    (
      await write(
        page.request,
        `finance/payments/${first.payment.id}/remove`,
        removal,
      )
    ).status(),
  ).toBe(200);
  expect(await summary()).toEqual({ actualPaid: 0, outstanding: 12345 });
  const history = (
    await (await scopedGet(page.request, "/api/v1/finance/payments")).json()
  ).data.items;
  expect(history[0].voidReason).toBe("Duplicate purchase");
  expect(history[0].status).toBe("VOID");
  expect(
    (
      await write(page.request, `finance/expenses/${first.expense.id}/remove`, {
        ...removal,
        source: "expenses",
        creationKey: randomUUID(),
      })
    ).status(),
  ).toBe(200);
  expect(await summary()).toEqual({ actualPaid: 0, outstanding: 0 });
  expect(
    await database
      .collection("expenses")
      .countDocuments({ weddingId: new mongoose.Types.ObjectId(wedding.id) }),
  ).toBe(1);
});

test("notification badge returns only the selected wedding recipient count", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  const me = (await (await page.request.get("/api/v1/auth/me")).json()).data
    .user;
  const weddingId = new mongoose.Types.ObjectId(wedding.id),
    userId = new mongoose.Types.ObjectId(me.id);
  await database.collection("notifications").insertMany([
    { weddingId, recipientUserId: userId, readAt: null },
    { weddingId, recipientUserId: userId, readAt: new Date() },
    { weddingId, recipientUserId: new mongoose.Types.ObjectId(), readAt: null },
    {
      weddingId: new mongoose.Types.ObjectId(),
      recipientUserId: userId,
      readAt: null,
    },
  ]);
  const result = await scopedGet(
    page.request,
    "/api/v1/notifications?view=count",
  );
  expect(result.status()).toBe(200);
  expect((await result.json()).data).toEqual({ unreadCount: 1 });
});
