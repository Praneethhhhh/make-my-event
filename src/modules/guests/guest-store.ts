import mongoose from "mongoose";
import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  database,
  OperationsError,
  oid,
  type Row,
  type Session,
} from "@/modules/operations/operations-store";
import { codeSecret } from "@/modules/team/invitation-code";
export { database, OperationsError, oid };
let indexed: Promise<void> | undefined;
export async function guestDatabase() {
  const db = await database();
  await (indexed ??= (async () => {
    await db
      .collection("guests")
      .createIndex({ weddingId: 1, displayName: 1, _id: 1 });
    await db
      .collection("functionInvitations")
      .createIndex(
        { weddingId: 1, guestId: 1, functionId: 1 },
        { unique: true },
      );
    await db.collection("functionInvitations").createIndex({
      weddingId: 1,
      functionId: 1,
      eligibilityStatus: 1,
      status: 1,
    });
    await db
      .collection("accessLinks")
      .createIndex({ tokenHash: 1 }, { unique: true });
    await db.collection("accessLinks").createIndex(
      { weddingId: 1, guestId: 1, status: 1 },
      {
        unique: true,
        name: "one_active_guest_link",
        partialFilterExpression: { subjectType: "GUEST", status: "ACTIVE" },
      },
    );
    await db.collection("portalSessions").createIndex(
      { sessionTokenHash: 1 },
      {
        unique: true,
        name: "guest_session_token",
        partialFilterExpression: {
          subjectType: "GUEST",
          sessionTokenHash: { $type: "string" },
        },
      },
    );
    await db
      .collection("portalSessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db
      .collection("portalSessions")
      .createIndex({ weddingId: 1, linkId: 1 });
  })().catch((e) => {
    indexed = undefined;
    throw e;
  }));
  return db;
}
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
const key = () =>
  createHmac("sha256", codeSecret())
    .update("guest-link-encryption:v1")
    .digest();
export function encrypt(value: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), nonce);
  return {
    encryptedSecret: Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]).toString("base64"),
    secretNonce: nonce.toString("base64"),
    secretAuthTag: cipher.getAuthTag().toString("base64"),
    secretKeyVersion: 1,
  };
}
export function decrypt(row: Row) {
  if (row.secretKeyVersion !== 1) throw new Error("Guest link key unavailable");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(row.secretNonce, "base64"),
  );
  cipher.setAuthTag(Buffer.from(row.secretAuthTag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(row.encryptedSecret, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export const clearedSecret = {
  encryptedSecret: "",
  secretNonce: "",
  secretAuthTag: "",
};
export function unavailableGuest(): never {
  throw new OperationsError(
    404,
    "INVITATION_UNAVAILABLE",
    "This invitation is no longer available. Please contact your hosts for a new link.",
  );
}
export async function event(
  db: mongoose.mongo.Db,
  session: Session,
  weddingId: mongoose.Types.ObjectId,
  guestId: mongoose.Types.ObjectId,
  action: string,
  actorUserId: string | null,
  details: mongoose.mongo.Document = {},
) {
  await db.collection("auditEvents").insertOne(
    {
      weddingId,
      guestId,
      action,
      ...(actorUserId
        ? { actorUserId: oid(actorUserId) }
        : { actorType: "GUEST" }),
      details,
      createdAt: new Date(),
    },
    { session },
  );
}
export async function limit(keyValue: string, max: number) {
  const db = await guestDatabase(),
    windowStart = new Date(Math.floor(Date.now() / 600000) * 600000),
    keyHash = digest("guest:" + keyValue),
    filter = { keyHash, windowStart };
  let row;
  try {
    row = await db.collection("rateLimitWindows").findOneAndUpdate(
      filter,
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(+windowStart + 600000) },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (e) {
    if (!(e instanceof mongoose.mongo.MongoServerError) || e.code !== 11000)
      throw e;
    row = await db
      .collection("rateLimitWindows")
      .findOneAndUpdate(
        filter,
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );
  }
  if (!row || row.count > max)
    throw new OperationsError(
      429,
      "RATE_LIMITED",
      "Too many requests. Please try again shortly.",
    );
}
