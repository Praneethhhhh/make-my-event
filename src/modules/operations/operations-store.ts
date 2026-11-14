import mongoose from "mongoose";
import { createHash } from "node:crypto";
import {
  WeddingAccessError,
  verifyMembership,
} from "@/modules/weddings/wedding-access";
import type { OperationsRecord } from "./operations-validation";
export type Row = mongoose.mongo.WithId<mongoose.mongo.Document>;
export type Session = mongoose.mongo.ClientSession;
export class OperationsError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const oid = (value: string) => new mongoose.Types.ObjectId(value);
async function connect() {
  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 5000,
  });
  const db = mongoose.connection.db!;
  for (const name of [
    "tasks",
    "vendors",
    "vendorCharges",
    "vendorPayments",
    "expenses",
    "expensePayments",
    "taskComments",
    "notifications",
  ]) {
    await db.collection(name).createIndex({ weddingId: 1, _id: -1 });
  }
  await db.collection("notifications").createIndex({
    weddingId: 1,
    recipientUserId: 1,
    readAt: 1,
    _id: -1,
  });
  await db
    .collection("notifications")
    .createIndex({ weddingId: 1, recipientUserId: 1, _id: -1 });
  await db
    .collection("taskComments")
    .createIndex({ weddingId: 1, taskId: 1, _id: -1 });
  // Establish the replacement comment constraint before retiring the old
  // all-row constraint, which treated missing comment IDs as one shared value.
  const notices = db.collection("notifications");
  const commentKeys = {
    weddingId: 1,
    commentId: 1,
    recipientUserId: 1,
  } as const;
  await notices.createIndex(commentKeys, {
    name: "notification_comment_recipient",
    unique: true,
    partialFilterExpression: { commentId: { $type: "objectId" } },
  });
  await notices.createIndex(
    { weddingId: 1, eventKey: 1, recipientUserId: 1 },
    {
      name: "notification_event_recipient",
      unique: true,
      partialFilterExpression: { eventKey: { $type: "string" } },
    },
  );
  for (const index of await notices.listIndexes().toArray())
    if (
      index.unique &&
      !index.partialFilterExpression &&
      JSON.stringify(index.key) === JSON.stringify(commentKeys)
    ) {
      try {
        await notices.dropIndex(index.name!);
      } catch (error) {
        if (
          !(error instanceof mongoose.mongo.MongoServerError) ||
          error.code !== 27
        )
          throw error;
      }
    }
  await db
    .collection("vendorAssignments")
    .createIndex(
      { weddingId: 1, vendorId: 1, functionId: 1 },
      { unique: true },
    );
  await db
    .collection("expensePayments")
    .createIndex({ weddingId: 1, expenseSource: 1, expenseId: 1, status: 1 });
  await db
    .collection("vendorPayments")
    .createIndex({ weddingId: 1, chargeId: 1, status: 1 });
  await db.collection("tasks").createIndex({
    weddingId: 1,
    deletedAt: 1,
    status: 1,
    assigneeUserId: 1,
    _id: -1,
  });
  return db;
}
let ready: ReturnType<typeof connect> | undefined;
export function database() {
  return (ready ??= connect().catch((e) => {
    ready = undefined;
    throw e;
  }));
}
function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !["weddingId", "creationKey", "requestHash", "deletedAt"].includes(
              key,
            ),
        )
        .map(([key, v]) => [key === "_id" ? "id" : key, serialize(v)]),
    );
  return value;
}
export const dto = (row: Row) => serialize(row) as OperationsRecord;
export async function transaction<T>(
  weddingId: string,
  userId: string,
  work: (db: mongoose.mongo.Db, session: Session, wedding: Row) => Promise<T>,
) {
  const db = await database();
  return mongoose.connection.transaction(async (session) => {
    const wedding = await db
      .collection("weddings")
      .findOneAndUpdate(
        { _id: oid(weddingId), status: "ACTIVE" },
        { $inc: { coordinationVersion: 1 } },
        { session, returnDocument: "after" },
      );
    if (!wedding)
      throw new WeddingAccessError("This wedding is no longer available.");
    await verifyMembership(db, session, weddingId, userId);
    return work(db, session, wedding);
  });
}
export function missing() {
  throw new OperationsError(
    404,
    "RESOURCE_NOT_FOUND",
    "This record is no longer available.",
  );
}
export function stale() {
  throw new OperationsError(
    409,
    "STALE_REVISION",
    "This record changed. Refresh it before saving again.",
  );
}
export async function reference(
  db: mongoose.mongo.Db,
  session: Session,
  weddingId: mongoose.Types.ObjectId,
  collection: string,
  value: string | null,
  extra: mongoose.mongo.Document = {},
) {
  if (!value) return;
  if (
    !(await db
      .collection(collection)
      .findOne({ _id: oid(value), weddingId, ...extra }, { session }))
  )
    throw new OperationsError(
      422,
      "INVALID_REFERENCE",
      "Choose an active record from this wedding.",
    );
}
export async function audit(
  db: mongoose.mongo.Db,
  session: Session,
  weddingId: mongoose.Types.ObjectId,
  userId: string,
  action: string,
  recordId: mongoose.Types.ObjectId,
) {
  await db.collection("auditEvents").insertOne(
    {
      weddingId,
      actorUserId: oid(userId),
      action,
      recordId,
      createdAt: new Date(),
    },
    { session },
  );
}
export async function idempotent<T>(
  db: mongoose.mongo.Db,
  session: Session,
  weddingId: mongoose.Types.ObjectId,
  userId: string,
  operation: string,
  key: string,
  payload: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const _id = createHash("sha256")
    .update(`${weddingId}:${userId}:${operation}:${key}`)
    .digest("hex");
  const requestHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const records = db.collection<{
    _id: string;
    weddingId: mongoose.Types.ObjectId;
    requestHash: string;
    result: T;
    operation: string;
    createdAt: Date;
  }>("idempotencyRecords");
  const old = await records.findOne({ _id, weddingId }, { session });
  if (old) {
    if (old.requestHash !== requestHash)
      throw new OperationsError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This submission was already used for different details.",
      );
    return old.result;
  }
  const result = await work();
  await records.insertOne(
    { _id, weddingId, requestHash, result, operation, createdAt: new Date() },
    { session },
  );
  return result;
}
