import mongoose from "mongoose";
import type { z } from "zod";
import {
  database,
  transaction,
  idempotent,
  oid,
  dto,
  reference,
  audit,
  OperationsError,
  missing,
  stale,
  type Session,
} from "./operations-store";
import type {
  costInput,
  settlementInput,
  correctionInput,
  paidCostInput,
} from "./finance-validation";
type Doc = mongoose.mongo.Document;

function expensePipeline(weddingId: string): Doc[] {
  const wedding = oid(weddingId);
  return [
    { $match: { weddingId: wedding, migratedTo: { $exists: false } } },
    {
      $set: {
        source: { $literal: "expenses" },
        legacySettled: { $ne: ["$modelVersion", 2] },
        active: {
          $cond: [
            { $eq: ["$modelVersion", 2] },
            { $eq: ["$status", "ACTIVE"] },
            { $eq: ["$status", "POSTED"] },
          ],
        },
      },
    },
    {
      $unionWith: {
        coll: "vendorCharges",
        pipeline: [
          { $match: { weddingId: wedding, migratedTo: { $exists: false } } },
          {
            $set: {
              source: { $literal: "vendorCharges" },
              legacySettled: false,
              active: { $eq: ["$status", "ACTIVE"] },
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "expensePayments",
        let: { expense: "$_id", source: "$source" },
        pipeline: [
          {
            $match: {
              weddingId: wedding,
              status: "POSTED",
              $expr: {
                $and: [
                  { $eq: ["$expenseId", "$$expense"] },
                  { $eq: ["$expenseSource", "$$source"] },
                ],
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$amountPaise" } } },
        ],
        as: "newPaid",
      },
    },
    {
      $lookup: {
        from: "vendorPayments",
        let: { expense: "$_id", source: "$source" },
        pipeline: [
          {
            $match: {
              weddingId: wedding,
              status: "POSTED",
              migratedTo: { $exists: false },
              $expr: {
                $and: [
                  { $eq: ["$chargeId", "$$expense"] },
                  { $eq: ["$$source", "vendorCharges"] },
                ],
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$amountPaise" } } },
        ],
        as: "oldPaid",
      },
    },
    {
      $set: {
        paidPaise: {
          $cond: [
            "$legacySettled",
            { $cond: ["$active", "$amountPaise", 0] },
            {
              $add: [
                { $ifNull: [{ $first: "$newPaid.total" }, 0] },
                { $ifNull: [{ $first: "$oldPaid.total" }, 0] },
              ],
            },
          ],
        },
        key: { $concat: ["$source", ":", { $toString: "$_id" }] },
      },
    },
    {
      $set: {
        outstandingPaise: {
          $cond: ["$active", { $subtract: ["$amountPaise", "$paidPaise"] }, 0],
        },
      },
    },
  ];
}
function paymentPipeline(weddingId: string): Doc[] {
  const wedding = oid(weddingId);
  return [
    { $match: { weddingId: wedding } },
    { $set: { source: { $literal: "expensePayments" } } },
    {
      $unionWith: {
        coll: "vendorPayments",
        pipeline: [
          { $match: { weddingId: wedding, migratedTo: { $exists: false } } },
          {
            $set: {
              source: { $literal: "vendorPayments" },
              expenseId: "$chargeId",
              expenseSource: { $literal: "vendorCharges" },
            },
          },
        ],
      },
    },
    {
      $unionWith: {
        coll: "expenses",
        pipeline: [
          {
            $match: {
              weddingId: wedding,
              modelVersion: { $ne: 2 },
              migratedTo: { $exists: false },
            },
          },
          {
            $set: {
              source: { $literal: "legacyExpenses" },
              expenseId: "$_id",
              expenseSource: { $literal: "expenses" },
              paymentMethod: { $literal: "OTHER" },
            },
          },
        ],
      },
    },
    { $set: { key: { $concat: ["$source", ":", { $toString: "$_id" }] } } },
    {
      $lookup: {
        from: "expenses",
        localField: "expenseId",
        foreignField: "_id",
        as: "cost",
      },
    },
    {
      $lookup: {
        from: "vendorCharges",
        localField: "expenseId",
        foreignField: "_id",
        as: "charge",
      },
    },
    {
      $set: {
        linked: {
          $cond: [
            { $eq: ["$expenseSource", "expenses"] },
            { $first: "$cost" },
            { $first: "$charge" },
          ],
        },
      },
    },
    {
      $set: {
        description: {
          $cond: [
            { $eq: ["$linked.weddingId", wedding] },
            "$linked.description",
            "Unavailable expense",
          ],
        },
        vendorId: {
          $cond: [
            { $eq: ["$linked.weddingId", wedding] },
            "$linked.vendorId",
            null,
          ],
        },
      },
    },
  ];
}
const safeProjection = {
  id: { $toString: "$_id" },
  _id: 0,
  key: 1,
  source: 1,
  revision: { $ifNull: ["$revision", 1] },
  description: 1,
  category: 1,
  amountPaise: 1,
  vendorId: { $convert: { input: "$vendorId", to: "string", onNull: null } },
  vendorName: 1,
  active: 1,
  status: 1,
  legacySettled: 1,
  paidPaise: 1,
  outstandingPaise: 1,
  paidAt: 1,
  paymentMethod: 1,
  notes: 1,
  voidReason: 1,
  createdAt: 1,
  expenseId: { $convert: { input: "$expenseId", to: "string", onNull: null } },
  expenseSource: 1,
};
export async function financeList(
  weddingId: string,
  kind: "expenses" | "payments",
  url: URL,
) {
  const db = await database();
  const pipeline =
    kind === "expenses"
      ? expensePipeline(weddingId)
      : paymentPipeline(weddingId);
  const expenseId = url.searchParams.get("expenseId");
  const expenseSource = url.searchParams.get("expenseSource");
  if (kind === "expenses" && (expenseId || expenseSource)) {
    if (
      !expenseId ||
      !/^[a-f0-9]{24}$/.test(expenseId) ||
      !["expenses", "vendorCharges"].includes(expenseSource ?? "")
    )
      throw new OperationsError(
        400,
        "VALIDATION_ERROR",
        "Choose a valid expense.",
      );
    pipeline.push({ $match: { _id: oid(expenseId), source: expenseSource } });
  }
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > 100)
    throw new OperationsError(400, "VALIDATION_ERROR", "Search is too long.");
  if (q)
    pipeline.push({
      $match: {
        description: {
          $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      },
    });
  if (url.searchParams.get("open") === "true" && kind === "expenses")
    pipeline.push({
      $match: {
        active: true,
        outstandingPaise: { $gt: 0 },
        legacySettled: false,
      },
    });
  const cursor = url.searchParams.get("cursor");
  if (
    cursor &&
    !/^(expenses|vendorCharges|expensePayments|vendorPayments|legacyExpenses):[a-f0-9]{24}$/.test(
      cursor,
    )
  )
    throw new OperationsError(400, "VALIDATION_ERROR", "Invalid page.");
  const page: Doc[] = [
    ...(cursor ? [{ $match: { key: { $gt: cursor } } }] : []),
    { $sort: { key: 1 } },
    { $limit: 51 },
    {
      $lookup: {
        from: "vendors",
        let: { vendor: "$vendorId" },
        pipeline: [
          {
            $match: {
              weddingId: oid(weddingId),
              $expr: { $eq: ["$_id", "$$vendor"] },
            },
          },
          { $project: { name: 1 } },
        ],
        as: "vendor",
      },
    },
    { $set: { vendorName: { $ifNull: [{ $first: "$vendor.name" }, null] } } },
    { $project: safeProjection },
  ];
  const result = await db
    .collection(kind === "expenses" ? "expenses" : "expensePayments")
    .aggregate([
      ...pipeline,
      { $facet: { items: page, count: [{ $count: "total" }] } },
    ])
    .toArray();
  const items = result[0]?.items ?? [];
  const more = items.length > 50;
  items.splice(50);
  return {
    items,
    nextCursor: more ? items.at(-1).key : null,
    total: result[0]?.count[0]?.total ?? 0,
  };
}
export async function financeSummary(weddingId: string) {
  const db = await database();
  const [costs, payments] = await Promise.all([
    db
      .collection("expenses")
      .aggregate([
        ...expensePipeline(weddingId),
        { $group: { _id: null, outstanding: { $sum: "$outstandingPaise" } } },
      ])
      .toArray(),
    db
      .collection("expensePayments")
      .aggregate([
        ...paymentPipeline(weddingId),
        { $match: { status: "POSTED" } },
        { $group: { _id: null, paid: { $sum: "$amountPaise" } } },
      ])
      .toArray(),
  ]);
  return {
    actualPaid: Number(payments[0]?.paid ?? 0),
    outstanding: Number(costs[0]?.outstanding ?? 0),
  };
}
export async function vendorBalances(weddingId: string, url: URL) {
  const db = await database();
  const cursor = url.searchParams.get("cursor");
  if (cursor && !/^[a-f0-9]{24}$/.test(cursor))
    throw new OperationsError(400, "VALIDATION_ERROR", "Invalid page.");
  const pipeline = expensePipeline(weddingId);
  const result = await db
    .collection("expenses")
    .aggregate([
      ...pipeline,
      {
        $match: {
          vendorId: { $ne: null },
          ...(cursor ? { vendorId: { $gt: oid(cursor) } } : {}),
        },
      },
      {
        $group: {
          _id: "$vendorId",
          paidPaise: { $sum: "$paidPaise" },
          outstandingPaise: { $sum: "$outstandingPaise" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 51 },
      {
        $lookup: {
          from: "vendors",
          let: { vendor: "$_id" },
          pipeline: [
            {
              $match: {
                weddingId: oid(weddingId),
                $expr: { $eq: ["$_id", "$$vendor"] },
              },
            },
          ],
          as: "vendor",
        },
      },
      {
        $project: {
          _id: 0,
          id: { $toString: "$_id" },
          name: { $ifNull: [{ $first: "$vendor.name" }, "Former vendor"] },
          paidPaise: 1,
          outstandingPaise: 1,
        },
      },
    ])
    .toArray();
  const more = result.length > 50;
  result.splice(50);
  return { items: result, nextCursor: more ? result.at(-1)!.id : null };
}
export async function paidAgainst(
  db: mongoose.mongo.Db,
  session: Session,
  wedding: mongoose.Types.ObjectId,
  expenseId: string,
  expenseSource: string,
) {
  let paid = 0;
  for (const [collection, filter] of [
    ["expensePayments", { expenseId: oid(expenseId), expenseSource }],
    ["vendorPayments", { chargeId: oid(expenseId) }],
  ] as const) {
    if (collection === "vendorPayments" && expenseSource !== "vendorCharges")
      continue;
    const sums = await db
      .collection(collection)
      .aggregate(
        [
          { $match: { weddingId: wedding, status: "POSTED", ...filter } },
          { $group: { _id: null, total: { $sum: "$amountPaise" } } },
        ],
        { session },
      )
      .toArray();
    paid += Number(sums[0]?.total ?? 0);
  }
  return paid;
}
export async function addCost(
  weddingId: string,
  userId: string,
  input: z.infer<typeof costInput>,
) {
  return transaction(weddingId, userId, async (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      "COST_CREATE",
      input.creationKey,
      input,
      async () => {
        await reference(db, session, wedding._id, "vendors", input.vendorId, {
          status: "ACTIVE",
        });
        const { creationKey: _, ...fields } = input;
        void _;
        const row = {
          _id: new mongoose.Types.ObjectId(),
          ...fields,
          vendorId: input.vendorId ? oid(input.vendorId) : null,
          weddingId: wedding._id,
          modelVersion: 2,
          status: "ACTIVE",
          revision: 1,
          createdByUserId: oid(userId),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("expenses").insertOne(row, { session });
        await audit(
          db,
          session,
          wedding._id,
          userId,
          "EXPENSE_CREATED",
          row._id,
        );
        return dto(row);
      },
    ),
  );
}
export async function addSettlement(
  weddingId: string,
  userId: string,
  input: z.infer<typeof settlementInput>,
) {
  return transaction(weddingId, userId, async (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      "COST_PAYMENT",
      input.creationKey,
      input,
      async () => {
        if (input.weddingTimeZone !== wedding.timeZone)
          throw new OperationsError(
            409,
            "STALE_WEDDING_SCHEDULE",
            "The wedding time zone changed. Reload before recording this payment date.",
          );

        const cost = await db.collection(input.expenseSource).findOne(
          {
            _id: oid(input.expenseId),
            weddingId: wedding._id,
            status: "ACTIVE",
            migratedTo: { $exists: false },
            ...(input.expenseSource === "expenses" ? { modelVersion: 2 } : {}),
          },
          { session },
        );
        if (!cost)
          throw new OperationsError(
            422,
            "INVALID_EXPENSE",
            "Choose an active expense from this wedding.",
          );
        const paid = await paidAgainst(
          db,
          session,
          wedding._id,
          input.expenseId,
          input.expenseSource,
        );
        if (paid + input.amountPaise > cost.amountPaise)
          throw new OperationsError(
            409,
            "OVERPAYMENT",
            "This payment exceeds the current remaining balance. Refresh the expense and try again.",
          );
        const { creationKey: _, ...fields } = input;
        void _;
        const row = {
          _id: new mongoose.Types.ObjectId(),
          ...fields,
          expenseId: oid(input.expenseId),
          vendorId: cost.vendorId ?? null,
          weddingId: wedding._id,
          paidAt: new Date(input.paidAt),
          status: "POSTED",
          revision: 1,
          createdByUserId: oid(userId),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("expensePayments").insertOne(row, { session });
        await audit(
          db,
          session,
          wedding._id,
          userId,
          "PAYMENT_RECORDED",
          row._id,
        );
        return dto(row);
      },
    ),
  );
}
export async function correctFinancial(
  weddingId: string,
  userId: string,
  kind: "expenses" | "payments",
  recordId: string,
  input: z.infer<typeof correctionInput>,
) {
  return transaction(weddingId, userId, async (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      "FINANCE_CORRECT",
      input.creationKey,
      { kind, recordId, ...input },
      async () => {
        if (
          !(
            kind === "expenses"
              ? ["expenses", "vendorCharges"]
              : ["expensePayments", "vendorPayments", "legacyExpenses"]
          ).includes(input.source)
        )
          throw new OperationsError(
            422,
            "VALIDATION_ERROR",
            "Choose the matching record type.",
          );
        const collection =
          input.source === "legacyExpenses" ? "expenses" : input.source;
        const row = await db.collection(collection).findOne(
          {
            _id: oid(recordId),
            weddingId: wedding._id,
            migratedTo: { $exists: false },
          },
          { session },
        );
        if (!row) missing();
        if ((row!.revision ?? 1) !== input.revision) stale();
        if (input.source === "legacyExpenses" && row!.modelVersion === 2)
          missing();
        if (
          kind === "expenses" &&
          !(collection === "expenses" && row!.modelVersion !== 2) &&
          (await paidAgainst(db, session, wedding._id, recordId, collection)) >
            0
        )
          throw new OperationsError(
            409,
            "EXPENSE_HAS_PAYMENTS",
            "Remove the recorded payments before removing this expense.",
          );
        if (row!.status === "VOID") return dto(row!);
        const result = await db.collection(collection).findOneAndUpdate(
          { _id: row!._id, weddingId: wedding._id },
          {
            $set: {
              status: "VOID",
              voidReason: input.reason,
              voidedByUserId: oid(userId),
              updatedAt: new Date(),
            },
            $inc: { revision: 1 },
          },
          { session, returnDocument: "after" },
        );
        await audit(
          db,
          session,
          wedding._id,
          userId,
          "FINANCE_CORRECTED",
          row!._id,
        );
        return dto(result!);
      },
    ),
  );
}

/** One idempotent transaction for an unexpected purchase already paid in full. */
export async function addPaidCost(
  weddingId: string,
  userId: string,
  input: z.infer<typeof paidCostInput>,
) {
  return transaction(weddingId, userId, async (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      "PAID_COST_CREATE",
      input.creationKey,
      input,
      async () => {
        if (input.weddingTimeZone !== wedding.timeZone)
          throw new OperationsError(
            409,
            "STALE_WEDDING_SCHEDULE",
            "The wedding time zone changed. Reload before recording this payment date.",
          );
        await reference(db, session, wedding._id, "vendors", input.vendorId, {
          status: "ACTIVE",
        });
        const now = new Date();
        const vendorId = input.vendorId ? oid(input.vendorId) : null;
        const expense = {
          _id: new mongoose.Types.ObjectId(),
          weddingId: wedding._id,
          modelVersion: 2,
          description: input.description,
          category: input.category,
          notes: input.notes,
          vendorId,
          amountPaise: input.amountPaise,
          currency: "INR",
          status: "ACTIVE",
          revision: 1,
          createdByUserId: oid(userId),
          createdAt: now,
          updatedAt: now,
        };
        const payment = {
          _id: new mongoose.Types.ObjectId(),
          weddingId: wedding._id,
          expenseId: expense._id,
          expenseSource: "expenses",
          vendorId,
          amountPaise: input.amountPaise,
          currency: "INR",
          paidAt: new Date(input.paidAt),
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          status: "POSTED",
          revision: 1,
          createdByUserId: oid(userId),
          createdAt: now,
          updatedAt: now,
        };
        await db.collection("expenses").insertOne(expense, { session });
        await db.collection("expensePayments").insertOne(payment, { session });
        await audit(
          db,
          session,
          wedding._id,
          userId,
          "EXPENSE_CREATED",
          expense._id,
        );
        await audit(
          db,
          session,
          wedding._id,
          userId,
          "PAYMENT_RECORDED",
          payment._id,
        );
        return { expense: dto(expense), payment: dto(payment) };
      },
    ),
  );
}
