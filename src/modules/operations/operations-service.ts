import mongoose from "mongoose";
import { financeSummary, paidAgainst } from "./finance-service";
import {
  OperationsError,
  oid,
  database,
  dto,
  transaction,
  missing,
  stale,
  reference,
  audit,
  idempotent,
  type Row,
} from "./operations-store";
export { OperationsError } from "./operations-store";
import type {
  OperationsRecord,
  TaskInput,
  VendorInput,
} from "./operations-validation";
export async function saveTask(
  weddingId: string,
  userId: string,
  input: TaskInput,
  recordId?: string,
  revision?: number,
) {
  return transaction(weddingId, userId, async (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      "TASK_SAVE",
      input.creationKey,
      { input, recordId, revision },
      async () => {
        if (input.weddingTimeZone !== wedding.timeZone)
          throw new OperationsError(
            409,
            "STALE_WEDDING_SCHEDULE",
            "The wedding time zone changed. Reload before saving this deadline.",
          );
        let old: Row | null = null;
        if (recordId) {
          old = await db
            .collection("tasks")
            .findOne(
              { _id: oid(recordId), weddingId: wedding._id, deletedAt: null },
              { session },
            );
          if (!old) missing();
          if (old!.revision !== revision) stale();
        }
        await reference(
          db,
          session,
          wedding._id,
          "functions",
          input.functionId,
          {
            status:
              old?.functionId?.toHexString() === input.functionId
                ? { $in: ["ACTIVE", "ARCHIVED"] }
                : "ACTIVE",
          },
        );
        if (
          input.assigneeUserId &&
          !(await db.collection("weddingMemberships").findOne(
            {
              weddingId: wedding._id,
              userId: oid(input.assigneeUserId),
              status: "ACTIVE",
            },
            { session },
          ))
        )
          throw new OperationsError(
            422,
            "INVALID_ASSIGNEE",
            "Choose an active team member.",
          );
        await reference(
          db,
          session,
          wedding._id,
          "vendors",
          input.vendorId,
          String(old?.vendorId ?? old?.assigneeVendorId ?? "") ===
            input.vendorId
            ? {}
            : { status: "ACTIVE" },
        );
        for (const person of new Set(
          input.mentions.map((mention) => mention.userId),
        )) {
          if (
            !(await db.collection("weddingMemberships").findOne(
              {
                weddingId: wedding._id,
                userId: oid(person),
                status: "ACTIVE",
              },
              { session },
            ))
          )
            throw new OperationsError(
              422,
              "INVALID_MENTION",
              "Mention active members of this wedding only.",
            );
        }
        for (const mention of input.mentions) {
          const label = input[mention.field].slice(mention.start, mention.end);
          const prior = (old?.mentions ?? []).some(
            (item: {
              userId: string;
              field: "title" | "description";
              start: number;
              end: number;
            }) =>
              item.userId === mention.userId &&
              item.field === mention.field &&
              String(old?.[item.field] ?? "").slice(item.start, item.end) ===
                label,
          );
          if (!prior) {
            const person = await db
              .collection("users")
              .findOne(
                { _id: oid(mention.userId) },
                { projection: { displayName: 1 }, session },
              );
            if (label !== `@${person?.displayName}`)
              throw new OperationsError(
                422,
                "INVALID_MENTION",
                "Choose the mentioned people again before saving.",
              );
          }
        }
        const now = new Date();
        const { weddingTimeZone: _, creationKey: _key, ...taskFields } = input;
        void _key;
        void _;
        const fields = {
          ...taskFields,
          functionId: input.functionId ? oid(input.functionId) : null,
          assigneeUserId: input.assigneeUserId
            ? oid(input.assigneeUserId)
            : null,
          assigneeVendorId: null,
          vendorId: input.vendorId ? oid(input.vendorId) : null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          completedAt:
            input.status === "COMPLETED" ? (old?.completedAt ?? now) : null,
          updatedAt: now,
        };
        const row = recordId
          ? await db
              .collection("tasks")
              .findOneAndUpdate(
                { _id: oid(recordId), weddingId: wedding._id, revision },
                { $set: fields, $inc: { revision: 1 } },
                { session, returnDocument: "after" },
              )
          : {
              _id: new mongoose.Types.ObjectId(),
              ...fields,
              weddingId: wedding._id,
              createdAt: now,
              createdByUserId: oid(userId),
              revision: 1,
              deletedAt: null,
            };
        if (!recordId)
          await db.collection("tasks").insertOne(row!, { session });
        await audit(
          db,
          session,
          wedding._id,
          userId,
          recordId ? "TASK_UPDATED" : "TASK_CREATED",
          row!._id,
        );
        const oldMentions = new Set(
          (old?.mentions ?? []).map((mention: { userId: string }) =>
            String(mention.userId),
          ),
        );
        const tagged = new Set(
          input.mentions
            .map((mention) => mention.userId)
            .filter((person) => !oldMentions.has(person)),
        );
        const assigned =
          !old || String(old.assigneeUserId ?? "") !== input.assigneeUserId;
        const recipients = new Set([
          ...tagged,
          ...(assigned ? [input.assigneeUserId] : []),
        ]);
        const eventKey = `task:${row!._id}:${row!.revision}`;
        for (const person of recipients)
          await db.collection("notifications").insertOne(
            {
              weddingId: wedding._id,
              recipientUserId: oid(person),
              actorUserId: oid(userId),
              taskId: row!._id,
              commentId: null,
              eventKey,
              targetType: "TASK",
              kind:
                assigned && person === input.assigneeUserId
                  ? tagged.has(person)
                    ? "ASSIGNED_MENTION"
                    : "ASSIGNED"
                  : "TASK_MENTION",
              createdAt: now,
              readAt: null,
              revision: 1,
            },
            { session },
          );
        return dto(row!);
      },
    ),
  );
}
export async function removeTask(
  weddingId: string,
  userId: string,
  recordId: string,
  revision: number,
) {
  return transaction(weddingId, userId, async (db, session, wedding) => {
    const filter = {
      _id: oid(recordId),
      weddingId: wedding._id,
      deletedAt: null,
    };
    const old = await db.collection("tasks").findOne(filter, { session });
    if (!old) missing();
    if (old!.revision !== revision) stale();
    await db
      .collection("tasks")
      .updateOne(
        filter,
        { $set: { deletedAt: new Date() }, $inc: { revision: 1 } },
        { session },
      );
    await audit(
      db,
      session,
      wedding._id,
      userId,
      "TASK_DELETED",
      oid(recordId),
    );
  });
}
export async function saveVendor(
  weddingId: string,
  userId: string,
  input: VendorInput,
  recordId?: string,
  revision?: number,
) {
  return transaction(weddingId, userId, async (db, session, wedding) => {
    const now = new Date();
    if (recordId) {
      const old = await db
        .collection("vendors")
        .findOne({ _id: oid(recordId), weddingId: wedding._id }, { session });
      if (!old) missing();
      if (old!.revision !== revision) stale();
      const row = await db
        .collection("vendors")
        .findOneAndUpdate(
          { _id: oid(recordId), weddingId: wedding._id, revision },
          { $set: { ...input, updatedAt: now }, $inc: { revision: 1 } },
          { session, returnDocument: "after" },
        );
      return dto(row!);
    }
    const row = {
      _id: new mongoose.Types.ObjectId(),
      ...input,
      weddingId: wedding._id,
      createdAt: now,
      updatedAt: now,
      createdByUserId: oid(userId),
      revision: 1,
    };
    await db.collection("vendors").insertOne(row, { session });
    return dto(row);
  });
}
function validateCommentRanges(
  body: string,
  recipients: string[],
  ranges: { userId: string; start: number; end: number }[],
) {
  let end = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (
      range.start < end ||
      range.end > body.length ||
      range.end <= range.start ||
      !recipients.includes(range.userId) ||
      !/^@[^\r\n]{1,120}$/.test(body.slice(range.start, range.end))
    )
      throw new OperationsError(
        422,
        "INVALID_MENTION",
        "Choose the mentioned people again before saving.",
      );
    end = range.end;
  }
}
export async function addComment(
  weddingId: string,
  userId: string,
  taskId: string,
  input: {
    body: string;
    mentionedUserIds: string[];
    creationKey: string;
    mentionRanges?: { userId: string; start: number; end: number }[];
  },
) {
  return transaction(weddingId, userId, async (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      "TASK_COMMENT",
      input.creationKey,
      input,
      async () => {
        await reference(db, session, wedding._id, "tasks", taskId, {
          deletedAt: null,
        });
        const recipients = [...new Set(input.mentionedUserIds)];
        validateCommentRanges(
          input.body,
          recipients,
          input.mentionRanges ?? [],
        );
        for (const recipient of recipients) {
          if (
            !(await db.collection("weddingMemberships").findOne(
              {
                weddingId: wedding._id,
                userId: oid(recipient),
                status: "ACTIVE",
              },
              { session },
            ))
          )
            throw new OperationsError(
              422,
              "INVALID_MENTION",
              "Mention active members of this wedding only.",
            );
        }
        const row = {
          _id: new mongoose.Types.ObjectId(),
          weddingId: wedding._id,
          taskId: oid(taskId),
          authorUserId: oid(userId),
          body: input.body,
          mentionedUserIds: recipients.map(oid),
          mentionRanges: input.mentionRanges ?? [],
          createdAt: new Date(),
          updatedAt: new Date(),
          revision: 1,
        };
        await db.collection("taskComments").insertOne(row, { session });
        for (const recipient of recipients.filter((id) => id !== userId))
          await db.collection("notifications").insertOne(
            {
              weddingId: wedding._id,
              recipientUserId: oid(recipient),
              actorUserId: oid(userId),
              taskId: oid(taskId),
              commentId: row._id,
              createdAt: row.createdAt,
              readAt: null,
              revision: 1,
            },
            { session },
          );
        return dto(row);
      },
    ),
  );
}
export async function changeComment(
  weddingId: string,
  userId: string,
  taskId: string,
  commentId: string,
  revision: number,
  fields: {
    body: string;
    mentionedUserIds: string[];
    mentionRanges?: { userId: string; start: number; end: number }[];
  } | null,
) {
  return transaction(weddingId, userId, async (db, session, wedding) => {
    await reference(db, session, wedding._id, "tasks", taskId, {
      deletedAt: null,
    });
    const old = await db.collection("taskComments").findOne(
      {
        _id: oid(commentId),
        weddingId: wedding._id,
        taskId: oid(taskId),
        deletedAt: null,
      },
      { session },
    );
    if (!old) missing();
    if (old!.revision !== revision) stale();
    const member = await db
      .collection("weddingMemberships")
      .findOne(
        { weddingId: wedding._id, userId: oid(userId), status: "ACTIVE" },
        { session },
      );
    if (
      !old!.authorUserId.equals(oid(userId)) &&
      (fields || member?.role !== "ADMIN")
    )
      throw new OperationsError(
        403,
        "COMMENT_FORBIDDEN",
        "Only the author can edit this comment. Administrators may remove it.",
      );
    if (!fields) {
      await db.collection("taskComments").updateOne(
        { _id: old!._id },
        {
          $set: { deletedAt: new Date(), updatedAt: new Date() },
          $inc: { revision: 1 },
        },
        { session },
      );
      return { deleted: true };
    }
    const mentioned = [...new Set(fields.mentionedUserIds)];
    validateCommentRanges(fields.body, mentioned, fields.mentionRanges ?? []);
    for (const person of mentioned)
      if (
        !(await db
          .collection("weddingMemberships")
          .findOne(
            { weddingId: wedding._id, userId: oid(person), status: "ACTIVE" },
            { session },
          ))
      )
        throw new OperationsError(
          422,
          "INVALID_MENTION",
          "Mention active members of this wedding only.",
        );
    const result = await db.collection("taskComments").findOneAndUpdate(
      { _id: old!._id },
      {
        $set: {
          body: fields.body,
          mentionedUserIds: mentioned.map(oid),
          mentionRanges: fields.mentionRanges ?? [],
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { session, returnDocument: "after" },
    );
    for (const person of mentioned.filter((p) => p !== userId))
      await db.collection("notifications").updateOne(
        {
          weddingId: wedding._id,
          commentId: old!._id,
          recipientUserId: oid(person),
        },
        {
          $setOnInsert: {
            actorUserId: oid(userId),
            taskId: oid(taskId),
            createdAt: new Date(),
            readAt: null,
            revision: 1,
          },
        },
        { session, upsert: true },
      );
    return dto(result!);
  });
}
export async function postFinancial(
  weddingId: string,
  userId: string,
  kind: "expenses" | "vendorCharges" | "vendorPayments",
  input: Record<string, unknown> & { creationKey: string; amountPaise: number },
) {
  return transaction(weddingId, userId, async (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      kind,
      input.creationKey,
      input,
      async () => {
        await reference(
          db,
          session,
          wedding._id,
          "functions",
          input.functionId as string | null,
          { status: "ACTIVE" },
        );
        await reference(
          db,
          session,
          wedding._id,
          "vendors",
          input.vendorId as string | null,
          { status: "ACTIVE" },
        );
        if (kind === "vendorPayments") {
          const charge = await db.collection("vendorCharges").findOne(
            {
              _id: oid(input.chargeId as string),
              weddingId: wedding._id,
              vendorId: oid(input.vendorId as string),
              status: "ACTIVE",
              migratedTo: { $exists: false },
            },
            { session },
          );
          if (!charge)
            throw new OperationsError(
              422,
              "INVALID_CHARGE",
              "Choose an active charge for this vendor.",
            );
          const paid = await paidAgainst(
            db,
            session,
            wedding._id,
            String(charge._id),
            "vendorCharges",
          );
          if (paid + input.amountPaise > charge.amountPaise)
            throw new OperationsError(
              409,
              "PAYMENT_EXCEEDS_CHARGE",
              "Payment exceeds the remaining charge balance.",
            );
        }
        const { creationKey: _, ...values } = input;
        void _;
        const row: Row = {
          _id: new mongoose.Types.ObjectId(),
          ...values,
          weddingId: wedding._id,
          createdByUserId: oid(userId),
          createdAt: new Date(),
          updatedAt: new Date(),
          revision: 1,
          status: kind === "vendorCharges" ? "ACTIVE" : "POSTED",
        };
        for (const key of ["functionId", "vendorId", "chargeId"])
          if (typeof row[key] === "string") row[key] = oid(row[key]);
        if (typeof row.paidAt === "string") row.paidAt = new Date(row.paidAt);
        await db.collection(kind).insertOne(row, { session });
        await audit(
          db,
          session,
          wedding._id,
          userId,
          "FINANCE_POSTED",
          row._id,
        );
        return dto(row);
      },
    ),
  );
}
export async function voidFinancial(
  weddingId: string,
  userId: string,
  kind: string,
  recordId: string,
  revision: number,
  reason: string,
) {
  return transaction(weddingId, userId, async (db, session, wedding) => {
    const filter = {
      _id: oid(recordId),
      weddingId: wedding._id,
      migratedTo: { $exists: false },
    };
    const old = await db.collection(kind).findOne(filter, { session });
    if (!old) missing();
    if (old!.revision !== revision) stale();
    if (old!.status === "VOID") return dto(old!);
    if (
      (kind === "vendorCharges" ||
        (kind === "expenses" && old!.modelVersion === 2)) &&
      (await paidAgainst(db, session, wedding._id, recordId, kind)) > 0
    )
      throw new OperationsError(
        409,
        "EXPENSE_HAS_PAYMENTS",
        "Correct the posted payments before correcting this expense.",
      );
    const row = await db.collection(kind).findOneAndUpdate(
      { ...filter, revision },
      {
        $set: {
          status: "VOID",
          voidReason: reason,
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
      "FINANCE_VOIDED",
      oid(recordId),
    );
    return dto(row!);
  });
}
export async function notificationsRead(
  weddingId: string,
  userId: string,
  read: boolean,
  recordId?: string,
) {
  return transaction(weddingId, userId, async (db, session, wedding) => {
    const filter = {
      weddingId: wedding._id,
      recipientUserId: oid(userId),
      ...(recordId ? { _id: oid(recordId) } : { readAt: null }),
    };
    if (
      recordId &&
      !(await db.collection("notifications").findOne(filter, { session }))
    )
      missing();
    await db
      .collection("notifications")
      .updateMany(
        filter,
        { $set: { readAt: read ? new Date() : null } },
        { session },
      );
    return { saved: true };
  });
}
export const resourceCollections = {
  tasks: "tasks",
  vendors: "vendors",
  charges: "vendorCharges",
  payments: "vendorPayments",
  expenses: "expenses",
  notifications: "notifications",
} as const;
export async function resourceDetail(
  weddingId: string,
  userId: string,
  kind: keyof typeof resourceCollections,
  recordId: string,
) {
  const db = await database();
  const row = await db.collection(resourceCollections[kind]).findOne({
    _id: oid(recordId),
    weddingId: oid(weddingId),
    ...(kind === "notifications" ? { recipientUserId: oid(userId) } : {}),
  });
  if (!row) missing();
  return dto(row!);
}
async function taskDto(db: mongoose.mongo.Db, row: Row) {
  const weddingId = row.weddingId;
  const vendorId = row.vendorId ?? row.assigneeVendorId ?? null;
  const [owner, activeOwner, linkedFunction, vendor] = await Promise.all([
    row.assigneeUserId
      ? db
          .collection("users")
          .findOne(
            { _id: row.assigneeUserId },
            { projection: { displayName: 1 } },
          )
      : null,
    row.assigneeUserId
      ? db
          .collection("weddingMemberships")
          .findOne(
            { weddingId, userId: row.assigneeUserId, status: "ACTIVE" },
            { projection: { _id: 1 } },
          )
      : null,
    row.functionId
      ? db
          .collection("functions")
          .findOne(
            { _id: row.functionId, weddingId },
            { projection: { name: 1, status: 1 } },
          )
      : null,
    vendorId
      ? db
          .collection("vendors")
          .findOne({ _id: vendorId, weddingId }, { projection: { name: 1 } })
      : null,
  ]);
  return {
    ...dto(row),
    vendorId: vendorId ? String(vendorId) : null,
    ownerName: activeOwner
      ? (owner?.displayName ?? "Team member")
      : "Needs an owner",
    ownerActive: !!activeOwner,
    functionName: linkedFunction
      ? `${linkedFunction.name}${linkedFunction.status === "ARCHIVED" ? " (archived)" : ""}`
      : row.functionId
        ? "Archived function"
        : "Wedding-wide",
    vendorName: vendor?.name ?? null,
  };
}
export async function listResource(
  weddingId: string,
  userId: string,
  kind: keyof typeof resourceCollections,
  url: URL,
) {
  const db = await database();
  const wedding = oid(weddingId);
  const filter: mongoose.mongo.Document = { weddingId: wedding };
  if (kind === "tasks") {
    filter.deletedAt = null;
    const scope = url.searchParams.get("scope");
    if (scope && !["open", "overdue", "mine"].includes(scope))
      throw new OperationsError(
        400,
        "VALIDATION_ERROR",
        "Choose a valid task view.",
      );
    if (scope) filter.status = { $in: ["TODO", "IN_PROGRESS"] };
    if (scope === "mine" || url.searchParams.get("mine") === "true")
      filter.assigneeUserId = oid(userId);
    if (scope === "overdue") filter.dueAt = { $ne: null, $lt: new Date() };
  }
  if (kind === "notifications") {
    filter.recipientUserId = oid(userId);
    if (url.searchParams.get("view") !== "all") filter.readAt = null;
  }
  if (kind === "tasks" || kind === "vendors") {
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length > 100)
      throw new OperationsError(400, "VALIDATION_ERROR", "Search is too long.");
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = (
        kind === "tasks" ? ["title", "description"] : ["name", "category"]
      ).map((field) => ({ [field]: { $regex: escaped, $options: "i" } }));
    }
    for (const [query, field] of [
      ["owner", "assigneeUserId"],
      ["function", "functionId"],
    ] as const) {
      const value = url.searchParams.get(query);
      if (kind === "tasks" && value) {
        if (!/^[a-f0-9]{24}$/.test(value))
          throw new OperationsError(
            400,
            "VALIDATION_ERROR",
            "Choose a valid filter.",
          );
        if (filter[field])
          filter.$and = [...(filter.$and ?? []), { [field]: oid(value) }];
        else filter[field] = oid(value);
      }
    }
    for (const [query, values] of [
      ["priority", ["LOW", "NORMAL", "HIGH"]],
      [
        "status",
        kind === "tasks"
          ? ["TODO", "IN_PROGRESS", "COMPLETED"]
          : ["ACTIVE", "INACTIVE"],
      ],
    ] as const) {
      const value = url.searchParams.get(query);
      if (value) {
        if (!(values as readonly string[]).includes(value))
          throw new OperationsError(
            400,
            "VALIDATION_ERROR",
            "Choose a valid filter.",
          );
        if (query === "status" && filter.status)
          filter.$and = [...(filter.$and ?? []), { status: value }];
        else filter[query] = value;
      }
    }
  }
  const total = await db
    .collection(resourceCollections[kind])
    .countDocuments(filter);
  const statusCounts =
    kind === "tasks"
      ? await db
          .collection("tasks")
          .aggregate([
            { $match: filter },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ])
          .toArray()
      : [];
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    if (!/^[a-f0-9]{24}$/.test(cursor))
      throw new OperationsError(400, "VALIDATION_ERROR", "Invalid page.");
    filter._id = { $lt: oid(cursor) };
  }
  const rows = await db
    .collection(resourceCollections[kind])
    .find(filter)
    .sort({ _id: -1 })
    .limit(51)
    .toArray();
  const hasMore = rows.length > 50;
  rows.splice(50);
  const items: OperationsRecord[] =
    kind === "tasks"
      ? await Promise.all(rows.map((row) => taskDto(db, row)))
      : rows.map(dto);
  if (kind === "notifications")
    for (let i = 0; i < rows.length; i++) {
      const actor = await db
        .collection("users")
        .findOne(
          { _id: rows[i]!.actorUserId },
          { projection: { displayName: 1 } },
        );
      const task = await db
        .collection("tasks")
        .findOne(
          { _id: rows[i]!.taskId, weddingId: wedding, deletedAt: null },
          { projection: { title: 1 } },
        );
      items[i]!.actorName = actor?.displayName ?? "Former team member";
      items[i]!.taskTitle = task?.title ?? "Unavailable task";
      if (rows[i]!.targetType === "TASK") {
        items[i]!.commentId = null;
        items[i]!.available = !!task;
        items[i]!.excerpt = "";
        continue;
      }
      const comment = await db.collection("taskComments").findOne(
        {
          _id: rows[i]!.commentId,
          weddingId: wedding,
          taskId: rows[i]!.taskId,
          deletedAt: null,
        },
        { projection: { _id: 1, body: 1 } },
      );
      items[i]!.available = !!task && !!comment;
      items[i]!.excerpt =
        task && comment ? String(comment.body ?? "").slice(0, 240) : "";
    }
  return {
    items,
    total,
    statusCounts: Object.fromEntries(
      statusCounts.map((row) => [String(row._id), row.count]),
    ),
    nextCursor: hasMore ? rows.at(-1)!._id.toHexString() : null,
    ...(kind === "notifications"
      ? {
          unreadCount: await db.collection("notifications").countDocuments({
            weddingId: wedding,
            recipientUserId: oid(userId),
            readAt: null,
          }),
        }
      : {}),
  };
}
export async function taskDetail(weddingId: string, taskId: string, url: URL) {
  const db = await database();
  const wedding = oid(weddingId);
  const row = await db
    .collection("tasks")
    .findOne({ _id: oid(taskId), weddingId: wedding, deletedAt: null });
  if (!row) missing();
  const filter: mongoose.mongo.Document = {
    weddingId: wedding,
    taskId: oid(taskId),
    deletedAt: null,
  };
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    if (!/^[a-f0-9]{24}$/.test(cursor))
      throw new OperationsError(400, "VALIDATION_ERROR", "Invalid page.");
    filter._id = { $lt: oid(cursor) };
  }
  const comments = await db
    .collection("taskComments")
    .find(filter)
    .sort({ _id: -1 })
    .limit(51)
    .toArray();
  const more = comments.length > 50;
  comments.splice(50);
  const nextCommentCursor = more ? comments.at(-1)!._id.toHexString() : null;
  const highlighted = url.searchParams.get("commentId");
  if (highlighted) {
    if (!/^[a-f0-9]{24}$/.test(highlighted))
      throw new OperationsError(400, "VALIDATION_ERROR", "Invalid comment.");
    if (!comments.some((c) => c._id.toHexString() === highlighted)) {
      const target = await db.collection("taskComments").findOne({
        _id: oid(highlighted),
        weddingId: wedding,
        taskId: oid(taskId),
        deletedAt: null,
      });
      if (target) comments.push(target);
    }
  }
  const items = await Promise.all(
    comments.map(async (comment) => ({
      ...dto(comment),
      mentionNames: await Promise.all(
        (comment.mentionedUserIds ?? []).map(
          async (person: mongoose.Types.ObjectId) => {
            const belongs = await db
              .collection("weddingMemberships")
              .findOne(
                { weddingId: wedding, userId: person },
                { projection: { _id: 1 } },
              );
            return belongs
              ? ((
                  await db
                    .collection("users")
                    .findOne(
                      { _id: person },
                      { projection: { displayName: 1 } },
                    )
                )?.displayName ?? "Former member")
              : "Former member";
          },
        ),
      ),
      authorName:
        (
          await db
            .collection("users")
            .findOne(
              { _id: comment.authorUserId },
              { projection: { displayName: 1 } },
            )
        )?.displayName ?? "Former team member",
    })),
  );
  return {
    task: await taskDto(db, row!),
    comments: items,
    nextCursor: nextCommentCursor,
  };
}
/** Count/aggregate-only dashboard; no directory or ledger downloads. */
export async function workspaceDashboard(weddingId: string, userId: string) {
  const db = await database();
  const wedding = oid(weddingId);
  const open = {
    weddingId: wedding,
    deletedAt: null,
    status: { $in: ["TODO", "IN_PROGRESS"] },
  };
  const [profile, user, pending, overdue, mine, activeVendors, finance] =
    await Promise.all([
      db
        .collection("weddings")
        .findOne(
          { _id: wedding, status: "ACTIVE" },
          { projection: { title: 1, timeZone: 1 } },
        ),
      db
        .collection("users")
        .findOne({ _id: oid(userId) }, { projection: { displayName: 1 } }),
      db.collection("tasks").countDocuments(open),
      db
        .collection("tasks")
        .countDocuments({ ...open, dueAt: { $ne: null, $lt: new Date() } }),
      db
        .collection("tasks")
        .countDocuments({ ...open, assigneeUserId: oid(userId) }),
      db
        .collection("vendors")
        .countDocuments({ weddingId: wedding, status: "ACTIVE" }),
      financeSummary(weddingId),
    ]);
  if (!profile) missing();
  return {
    title: String(profile!.title),
    timeZone: String(profile!.timeZone),
    displayName: String(user?.displayName ?? ""),
    summary: {
      open: pending,
      overdue,
      mine,
      activeVendors,
      actualPaid: finance.actualPaid,
      outstanding: finance.outstanding,
    },
  };
}

export async function operationsChoices(weddingId: string, url: URL) {
  const db = await database();
  const wedding = oid(weddingId);
  const type = url.searchParams.get("type");
  if (!["people", "vendors", "functions"].includes(type ?? ""))
    throw new OperationsError(400, "VALIDATION_ERROR", "Choose a valid list.");
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > 100)
    throw new OperationsError(400, "VALIDATION_ERROR", "Search is too long.");
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cursor = url.searchParams.get("cursor");
  if (cursor && !/^[a-f0-9]{24}$/.test(cursor))
    throw new OperationsError(400, "VALIDATION_ERROR", "Invalid page.");
  const filter = {
    weddingId: wedding,
    status: "ACTIVE",
    ...(cursor ? { _id: { $gt: oid(cursor) } } : {}),
  };
  let rows;
  if (type === "people")
    rows = await db
      .collection("weddingMemberships")
      .aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "person",
          },
        },
        { $unwind: "$person" },
        ...(q
          ? [
              {
                $match: {
                  "person.displayName": { $regex: escaped, $options: "i" },
                },
              },
            ]
          : []),
        { $sort: { _id: 1 } },
        { $limit: 51 },
        { $project: { _id: 1, value: "$userId", name: "$person.displayName" } },
      ])
      .toArray();
  else
    rows = await db
      .collection(type!)
      .find(
        {
          ...filter,
          ...(q ? { name: { $regex: escaped, $options: "i" } } : {}),
        },
        { projection: { name: 1 } },
      )
      .sort({ _id: 1 })
      .limit(51)
      .toArray();
  const more = rows.length > 50;
  rows.splice(50);
  return {
    items: rows.map((row) => ({
      id: String(row.value ?? row._id),
      name: String(row.name),
    })),
    nextCursor: more ? String(rows.at(-1)!._id) : null,
  };
}
export async function operationsContext(weddingId: string, userId: string) {
  const db = await database();
  const wedding = oid(weddingId);
  const [profile, user, member] = await Promise.all([
    db
      .collection("weddings")
      .findOne(
        { _id: wedding, status: "ACTIVE" },
        { projection: { title: 1, timeZone: 1 } },
      ),
    db
      .collection("users")
      .findOne({ _id: oid(userId) }, { projection: { displayName: 1 } }),
    db
      .collection("weddingMemberships")
      .findOne(
        { weddingId: wedding, userId: oid(userId), status: "ACTIVE" },
        { projection: { role: 1 } },
      ),
  ]);
  if (!profile || !member) missing();
  return {
    userId,
    role: member!.role,
    title: profile!.title,
    timeZone: profile!.timeZone,
    displayName: user?.displayName ?? "",
  };
}

export async function notificationCount(weddingId: string, userId: string) {
  const db = await database();
  return {
    unreadCount: await db.collection("notifications").countDocuments({
      weddingId: oid(weddingId),
      recipientUserId: oid(userId),
      readAt: null,
    }),
  };
}
