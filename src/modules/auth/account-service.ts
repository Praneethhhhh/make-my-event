import mongoose from "mongoose";
import { hash, verify } from "@node-rs/argon2";
import { digest, lifetime, secret } from "./registration-service";
import { passwordProblem, passwordPersonalInputs } from "./account-validation";
import type { AccountProfile } from "./profile-validation";

export class AccountError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}
function revisionFilter(revision: number) {
  return revision === 1
    ? { $or: [{ profileRevision: 1 }, { profileRevision: { $exists: false } }] }
    : { profileRevision: revision };
}
export async function getAccount(userId: string): Promise<AccountProfile> {
  const user = await mongoose.connection
    .db!.collection("users")
    .findOne({ _id: new mongoose.Types.ObjectId(userId), status: "ACTIVE" });
  if (!user)
    throw new AccountError(401, "AUTH_REQUIRED", "Please sign in again.");
  return {
    id: user._id.toHexString(),
    displayName: user.displayName,
    email: user.emailNormalized,
    revision: user.profileRevision ?? 1,
  };
}
export async function accountLimit(
  userId: string,
  operation: "profile" | "password",
) {
  const db = mongoose.connection.db!;
  const now = Date.now();
  const span = 15 * 60 * 1000;
  const windowStart = new Date(Math.floor(now / span) * span);
  const filter = {
    keyHash: digest(`account:${operation}:${userId}`),
    windowStart,
  };
  let row;
  try {
    row = await db.collection("rateLimitWindows").findOneAndUpdate(
      filter,
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(+windowStart + span) },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (
      !(error instanceof mongoose.mongo.MongoServerError) ||
      error.code !== 11000
    )
      throw error;
    row = await db
      .collection("rateLimitWindows")
      .findOneAndUpdate(
        filter,
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );
  }
  return !row || row.count > (operation === "password" ? 5 : 20)
    ? Math.max(1, Math.ceil((+windowStart + span - now) / 1000))
    : 0;
}
async function lockSession(
  session: mongoose.mongo.ClientSession,
  userId: string,
  token: string,
) {
  const row = await mongoose.connection
    .db!.collection("authSessions")
    .findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        tokenHash: digest(token),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { lastSeenAt: new Date() } },
      { session, returnDocument: "after" },
    );
  if (!row)
    throw new AccountError(401, "AUTH_REQUIRED", "Please sign in again.");
}
export async function updateName(
  userId: string,
  token: string,
  displayName: string,
  revision: number,
) {
  await mongoose.connection.transaction(async (session) => {
    await lockSession(session, userId, token);
    const user = await mongoose.connection
      .db!.collection("users")
      .findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(userId),
          status: "ACTIVE",
          ...revisionFilter(revision),
        },
        {
          $set: {
            displayName,
            updatedAt: new Date(),
            profileRevision: revision + 1,
          },
        },
        { session, returnDocument: "after" },
      );
    if (!user)
      throw new AccountError(
        409,
        "STALE_REVISION",
        "Your account changed. Reload before saving again.",
      );
  });
  return getAccount(userId);
}
export async function changePassword(
  userId: string,
  token: string,
  input: { currentPassword: string; newPassword: string; revision: number },
) {
  const db = mongoose.connection.db!;
  const id = new mongoose.Types.ObjectId(userId);
  const user = await db
    .collection("users")
    .findOne({ _id: id, status: "ACTIVE" });
  if (!user)
    throw new AccountError(401, "AUTH_REQUIRED", "Please sign in again.");
  const problem = passwordProblem(
    input.newPassword,
    passwordPersonalInputs(user.displayName, user.emailNormalized),
  );
  if (problem)
    throw new AccountError(422, "VALIDATION_ERROR", problem, "newPassword");
  if (!(await verify(user.passwordHash, input.currentPassword)))
    throw new AccountError(
      422,
      "CURRENT_PASSWORD_INVALID",
      "Current password is incorrect.",
      "currentPassword",
    );
  const passwordHash = await hash(input.newPassword, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const nextToken = secret();
  await mongoose.connection.transaction(async (session) => {
    await lockSession(session, userId, token);
    const now = new Date();
    const updated = await db.collection("users").findOneAndUpdate(
      {
        _id: id,
        status: "ACTIVE",
        passwordHash: user.passwordHash,
        ...revisionFilter(input.revision),
      },
      {
        $set: {
          passwordHash,
          passwordChangedAt: now,
          updatedAt: now,
          profileRevision: input.revision + 1,
        },
      },
      { session, returnDocument: "after" },
    );
    if (!updated)
      throw new AccountError(
        409,
        "STALE_REVISION",
        "Your account changed. Reload before changing the password.",
      );
    await db
      .collection("authSessions")
      .updateMany(
        { userId: id, revokedAt: null },
        { $set: { revokedAt: now } },
        { session },
      );
    await db.collection("authSessions").insertOne(
      {
        userId: id,
        tokenHash: digest(nextToken),
        expiresAt: new Date(+now + lifetime * 1000),
        revokedAt: null,
        createdAt: now,
        lastSeenAt: now,
      },
      { session },
    );
  });
  return { user: await getAccount(userId), token: nextToken };
}
