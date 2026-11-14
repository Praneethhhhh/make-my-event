import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import {
  test,
  expect,
  account,
  mutation,
  scopedGet,
  scopeHeaders,
  origin,
} from "../../auth/tests/fixtures";
import { onboard, ceremony } from "../../functions/tests/fixtures";
import { write } from "./fixtures";
export const task = {
  title: "Confirm flowers",
  description: "Family coordination",
  functionId: null,
  assigneeType: "USER",
  assigneeUserId: null,
  assigneeVendorId: null,
  status: "TODO",
  priority: "HIGH",
  dueAt: "2027-02-17T10:00:00.000Z",
  weddingTimeZone: "Asia/Kolkata",
};
export const vendor = {
  name: "Family florist",
  category: "Flowers",
  phones: ["+91 9876543210"],
  color: "forest",
  internalNotes: "Private organizer note",
  status: "ACTIVE",
};
const expense = {
  description: "Ritual supplies",
  category: "Ceremony",
  amountPaise: 12345,
  currency: "INR",
  functionId: null,
  paidAt: "2026-11-10T12:00:00.000Z",
  notes: "Paid in full",
};
test("task edits preserve an archived function without permitting new archived or foreign references", async ({
  page,
  database,
}) => {
  await onboard(page.request);
  const first = (
    await (await write(page.request, "functions", ceremony)).json()
  ).data.function;
  const second = (
    await (
      await write(page.request, "functions", { ...ceremony, name: "Reception" })
    ).json()
  ).data.function;
  const saved = (
    await (
      await write(page.request, "tasks", { ...task, functionId: first.id })
    ).json()
  ).data;
  for (const record of [first, second])
    expect(
      (
        await write(page.request, `functions/${record.id}/archive`, {
          revision: record.revision,
        })
      ).status(),
    ).toBe(200);
  const changed = await write(
    page.request,
    `tasks/${saved.id}`,
    {
      ...task,
      functionId: first.id,
      status: "IN_PROGRESS",
      description: "Updated after archive",
      revision: 1,
    },
    "PATCH",
  );
  expect(changed.status()).toBe(200);
  expect((await changed.json()).data.functionId).toBe(first.id);
  expect(
    (
      await write(page.request, "tasks", { ...task, functionId: first.id })
    ).status(),
  ).toBe(422);
  expect(
    (
      await write(
        page.request,
        `tasks/${saved.id}`,
        { ...task, functionId: second.id, revision: 2 },
        "PATCH",
      )
    ).status(),
  ).toBe(422);
  const foreign = await database.collection("functions").insertOne({
    weddingId: new mongoose.Types.ObjectId(),
    status: "ARCHIVED",
    name: "Foreign archived",
  });
  expect(
    (
      await write(
        page.request,
        `tasks/${saved.id}`,
        { ...task, functionId: foreign.insertedId.toHexString(), revision: 2 },
        "PATCH",
      )
    ).status(),
  ).toBe(422);
  expect(
    (
      await write(
        page.request,
        `tasks/${saved.id}`,
        { ...task, functionId: null, revision: 2 },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
});
test("older comment targets remain reachable without exposing removed comments", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  const row = (await (await write(page.request, "tasks", task)).json()).data;
  const author = await database
    .collection("users")
    .findOne({ emailNormalized: account.email });
  const comments = Array.from({ length: 60 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    weddingId: new mongoose.Types.ObjectId(wedding.id),
    taskId: new mongoose.Types.ObjectId(row.id),
    authorUserId: author!._id,
    body: `Comment ${i}`,
    mentionedUserIds: [],
    createdAt: new Date(),
    revision: 1,
  }));
  await database.collection("taskComments").insertMany(comments);
  const target = comments[0]!._id.toHexString();
  const first = (
    await (
      await scopedGet(
        page.request,
        `/api/v1/tasks/${row.id}?commentId=${target}`,
      )
    ).json()
  ).data;
  expect(first.comments).toHaveLength(51);
  expect(first.comments.some((c: { id: string }) => c.id === target)).toBe(
    true,
  );
  const second = (
    await (
      await scopedGet(
        page.request,
        `/api/v1/tasks/${row.id}?cursor=${first.nextCursor}`,
      )
    ).json()
  ).data;
  expect(second.comments).toHaveLength(10);
  await database
    .collection("taskComments")
    .updateOne({ _id: comments[0]!._id }, { $set: { deletedAt: new Date() } });
  const deleted = (
    await (
      await scopedGet(
        page.request,
        `/api/v1/tasks/${row.id}?commentId=${target}`,
      )
    ).json()
  ).data;
  expect(deleted.comments.some((c: { id: string }) => c.id === target)).toBe(
    false,
  );
});
test("tasks enforce tenant references, stale edits, deadlines and soft deletion", async ({
  page,
  database,
}) => {
  const wedding = await onboard(page.request);
  expect((await page.request.get("/api/v1/tasks")).status()).toBe(400);
  const saved = await write(page.request, "tasks", task);
  expect(saved.status()).toBe(201);
  const row = (await saved.json()).data;
  expect(row.dueAt).toBe(task.dueAt);
  expect(row).not.toHaveProperty("weddingId");
  expect(
    (
      await write(page.request, "tasks", {
        ...task,
        assigneeType: "USER",
        assigneeUserId: "000000000000000000000001",
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await write(page.request, "tasks", {
        ...task,
        functionId: "000000000000000000000001",
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await write(
        page.request,
        `tasks/${row.id}`,
        { ...task, title: "Changed", revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await write(
        page.request,
        `tasks/${row.id}`,
        { ...task, revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(page.request, "tasks", { ...task, weddingTimeZone: "UTC" })
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(page.request, `tasks/${row.id}`, { revision: 2 }, "DELETE")
    ).status(),
  ).toBe(200);
  expect(
    (await scopedGet(page.request, `/api/v1/tasks/${row.id}`)).status(),
  ).toBe(404);
  expect(
    await database.collection("tasks").countDocuments({
      weddingId: new (await import("mongoose")).default.Types.ObjectId(
        wedding.id,
      ),
      deletedAt: { $ne: null },
    }),
  ).toBe(1);
});
test("comments atomically notify unique active recipients and notifications are private", async ({
  page,
  browser,
  database,
}) => {
  const wedding = await onboard(page.request);
  const recipient = await browser.newContext({ baseURL: origin });
  try {
    await mutation(
      recipient.request,
      "register",
      {
        ...account,
        email: "mentioned@example.invalid",
        displayName: "Mentioned Family",
      },
      "mentioned",
    );
    const user = await database
      .collection("users")
      .findOne({ emailNormalized: "mentioned@example.invalid" });
    const author = await database
      .collection("users")
      .findOne({ emailNormalized: account.email });
    const { default: mongoose } = await import("mongoose");
    const weddingId = new mongoose.Types.ObjectId(wedding.id);
    await database.collection("weddingMemberships").insertOne({
      weddingId,
      userId: user!._id,
      status: "ACTIVE",
      role: "ORGANIZER",
      revision: 1,
      createdAt: new Date(),
    });
    const row = (await (await write(page.request, "tasks", task)).json()).data;
    const payload = {
      body: "Please confirm @family",
      mentionedUserIds: [
        user!._id.toHexString(),
        user!._id.toHexString(),
        author!._id.toHexString(),
      ],
      creationKey: randomUUID(),
    };
    const comment = (
      await (
        await write(page.request, `tasks/${row.id}/comments`, payload)
      ).json()
    ).data;
    expect(
      (await write(page.request, `tasks/${row.id}/comments`, payload)).status(),
    ).toBe(201);
    expect(
      await database
        .collection("notifications")
        .countDocuments({ weddingId, targetType: { $ne: "TASK" } }),
    ).toBe(1);
    expect(
      (await (await scopedGet(page.request, "/api/v1/notifications")).json())
        .data.unreadCount,
    ).toBe(1);
    const list = await recipient.request.get("/api/v1/notifications", {
      headers: { "X-Wedding-Id": wedding.id },
    });
    expect(list.status()).toBe(200);
    const notice = (await list.json()).data.items[0];
    expect(notice.actorName).toBe(account.displayName);
    expect(notice.commentId).toBe(comment.id);
    expect(
      (
        await write(
          page.request,
          `notifications/${notice.id}`,
          { read: true },
          "PATCH",
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await write(
          recipient.request,
          `notifications/${notice.id}`,
          { read: true },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await (
          await scopedGet(recipient.request, "/api/v1/notifications")
        ).json()
      ).data.items,
    ).toHaveLength(0);
    expect(
      (
        await (
          await scopedGet(recipient.request, "/api/v1/notifications?view=all")
        ).json()
      ).data.items,
    ).toHaveLength(1);
    expect(
      (
        await write(
          recipient.request,
          `notifications/${notice.id}`,
          { read: false },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await write(
          recipient.request,
          `tasks/${row.id}/comments/${comment.id}`,
          { body: "Not the author", mentionedUserIds: [], revision: 1 },
          "PATCH",
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await write(
          page.request,
          `tasks/${row.id}/comments/${comment.id}`,
          {
            body: "Updated comment",
            mentionedUserIds: [user!._id.toHexString()],
            revision: 1,
          },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    expect(
      await database
        .collection("notifications")
        .countDocuments({ weddingId, targetType: { $ne: "TASK" } }),
    ).toBe(1);
    expect(
      (
        await write(
          page.request,
          `tasks/${row.id}/comments/${comment.id}`,
          { body: "Stale edit", mentionedUserIds: [], revision: 1 },
          "PATCH",
        )
      ).status(),
    ).toBe(409);
    const before = await database.collection("taskComments").countDocuments({});
    expect(
      (
        await write(page.request, `tasks/${row.id}/comments`, {
          ...payload,
          creationKey: randomUUID(),
          mentionedUserIds: ["000000000000000000000001"],
        })
      ).status(),
    ).toBe(422);
    expect(await database.collection("taskComments").countDocuments({})).toBe(
      before,
    );
    await database
      .collection("weddingMemberships")
      .updateOne(
        { weddingId, userId: user!._id },
        { $set: { status: "REMOVED" } },
      );
    expect(
      (
        await recipient.request.get("/api/v1/notifications", {
          headers: { "X-Wedding-Id": wedding.id },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await recipient.close();
  }
});
test("manual vendors require color, reject function assignment and keep vendor context separate from ownership", async ({
  page,
  database,
}) => {
  await onboard(page.request);
  const created = await write(page.request, "vendors", vendor);
  expect(created.status()).toBe(201);
  const v = (await created.json()).data;
  expect(
    (
      await scopedGet(page.request, `/api/v1/vendors/${v.id}/assignments`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await write(page.request, `vendors/${v.id}/assignments`, {
        functionId: "000000000000000000000001",
        responsibilities: ["Flowers"],
        status: "ACTIVE",
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await write(page.request, "tasks", {
        ...task,
        assigneeType: "VENDOR",
        assigneeVendorId: v.id,
      })
    ).status(),
  ).toBe(422);
  const linked = await write(page.request, "tasks", {
    ...task,
    vendorId: v.id,
  });
  expect(linked.status()).toBe(201);
  expect(
    (
      await write(
        page.request,
        `vendors/${v.id}`,
        { ...vendor, status: "INACTIVE", revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  expect(
    (await write(page.request, "tasks", { ...task, vendorId: v.id })).status(),
  ).toBe(422);
  expect(
    (
      await write(
        page.request,
        `tasks/${(await linked.json()).data.id}`,
        { ...task, vendorId: v.id, revision: 1 },
        "PATCH",
      )
    ).status(),
  ).toBe(200);
  expect(
    await database.collection("vendorAssignments").countDocuments({}),
  ).toBe(0);
  expect(
    (
      await write(page.request, "vendors", { ...vendor, phones: ["-----"] })
    ).status(),
  ).toBe(422);
  const { color: _, ...withoutColor } = vendor;
  void _;
  expect((await write(page.request, "vendors", withoutColor)).status()).toBe(
    422,
  );
});

test("financial totals avoid double counting, retries deduplicate, corrections retain history", async ({
  page,
  database,
}) => {
  await onboard(page.request);
  const v = (await (await write(page.request, "vendors", vendor)).json()).data;
  const c = (
    await (
      await write(page.request, "vendor-charges", {
        description: "Flowers",
        vendorId: v.id,
        functionId: null,
        currency: "INR",
        amountPaise: 100000,
        creationKey: randomUUID(),
      })
    ).json()
  ).data;
  const payment = {
    vendorId: v.id,
    chargeId: c.id,
    currency: "INR",
    amountPaise: 40000,
    paidAt: expense.paidAt,
    paymentMethod: "UPI",
    notes: "Advance",
    creationKey: randomUUID(),
  };
  const first = await write(page.request, "vendor-payments", payment);
  expect(first.status()).toBe(201);
  const p = (await first.json()).data;
  expect((await write(page.request, "vendor-payments", payment)).status()).toBe(
    201,
  );
  expect(
    (
      await write(page.request, "vendor-payments", {
        ...payment,
        amountPaise: 1,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(page.request, "expenses", {
        ...expense,
        creationKey: randomUUID(),
      })
    ).status(),
  ).toBe(201);
  const summary = (
    await (await scopedGet(page.request, "/api/v1/operations")).json()
  ).data.summary;
  expect(summary.actualPaid).toBe(52345);
  expect(summary.outstanding).toBe(60000);
  expect(
    (
      await write(page.request, `vendor-charges/${c.id}/void`, {
        revision: 1,
        reason: "Changed",
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await write(page.request, `vendor-payments/${p.id}/void`, {
        revision: 1,
        reason: "Wrong advance",
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await write(page.request, `vendor-charges/${c.id}/void`, {
        revision: 1,
        reason: "Cancelled",
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await scopedGet(page.request, "/api/v1/operations")).json()).data
      .summary.actualPaid,
  ).toBe(12345);
  expect(
    await database
      .collection("vendorPayments")
      .countDocuments({ status: "VOID" }),
  ).toBe(1);
  expect(
    (
      await write(page.request, "expenses", {
        ...expense,
        amountPaise: 1.2,
        creationKey: randomUUID(),
      })
    ).status(),
  ).toBe(422);
});
test("concurrent vendor payments cannot overpay a charge", async ({ page }) => {
  await onboard(page.request);
  const v = (await (await write(page.request, "vendors", vendor)).json()).data;
  const c = (
    await (
      await write(page.request, "vendor-charges", {
        description: "Flowers",
        vendorId: v.id,
        functionId: null,
        currency: "INR",
        amountPaise: 10000,
        creationKey: randomUUID(),
      })
    ).json()
  ).data;
  const payload = {
    vendorId: v.id,
    chargeId: c.id,
    currency: "INR",
    amountPaise: 7000,
    paidAt: expense.paidAt,
    paymentMethod: "UPI",
    notes: "",
  };
  const responses = await Promise.all([
    write(page.request, "vendor-payments", {
      ...payload,
      creationKey: randomUUID(),
    }),
    write(page.request, "vendor-payments", {
      ...payload,
      creationKey: randomUUID(),
    }),
  ]);
  expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
  expect(
    (await (await scopedGet(page.request, "/api/v1/operations")).json()).data
      .summary.outstanding,
  ).toBe(3000);
});
test("operations reject foreign tenant writes, missing CSRF and revoked membership", async ({
  page,
  browser,
  database,
}) => {
  const a = await onboard(page.request);
  const other = await browser.newContext({ baseURL: origin });
  try {
    await onboard(other.request, "foreign-operations@example.invalid");
    const v = (await (await write(other.request, "vendors", vendor)).json())
      .data;
    expect(
      (
        await write(page.request, "tasks", {
          ...task,
          assigneeType: "VENDOR",
          assigneeVendorId: v.id,
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await page.request.post("/api/v1/tasks", {
          headers: await scopeHeaders(page.request),
          data: task,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.get("/api/v1/vendors", {
          headers: {
            "X-Wedding-Id": a.id.replace(/^./, a.id[0] === "a" ? "b" : "a"),
          },
        })
      ).status(),
    ).toBe(404);
    const { default: mongoose } = await import("mongoose");
    await database
      .collection("weddingMemberships")
      .updateMany(
        { weddingId: new mongoose.Types.ObjectId(a.id) },
        { $set: { status: "REMOVED" } },
      );
    expect((await write(page.request, "tasks", task)).status()).toBe(404);
  } finally {
    await other.close();
  }
});
