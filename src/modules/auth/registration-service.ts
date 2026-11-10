import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { z } from "zod";

import { registration, loginInput } from "./account-validation";
export { registration, loginInput } from "./account-validation";
export const lifetime = 7 * 24 * 3600;
const rateWindowMs = 15 * 60 * 1000;
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("hex");

async function connect() {
  if (!process.env.MONGODB_URI) throw new Error("Database unavailable");
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const db = mongoose.connection.db!;
  const users = db.collection("users");
  const sessions = db.collection("authSessions");
  const limits = db.collection("rateLimitWindows");
  await Promise.all([
    users.createIndex({ emailNormalized: 1 }, { unique: true }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ userId: 1, revokedAt: 1 }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    limits.createIndex({ keyHash: 1, windowStart: 1 }, { unique: true }),
    limits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return { users, sessions, limits };
}
let ready: ReturnType<typeof connect> | undefined;
function collections() {
  return (ready ??= connect().catch((error) => {
    ready = undefined;
    throw error;
  }));
}

async function incrementLimit(
  limits: mongoose.mongo.Collection,
  operation: "register" | "login",
  key: string,
  now: Date,
) {
  const windowStart = new Date(Math.floor(+now / rateWindowMs) * rateWindowMs);
  const window = await limits.findOneAndUpdate(
    { keyHash: digest(operation + ":" + key), windowStart },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(+windowStart + rateWindowMs) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return window && window.count > 10
    ? Math.max(1, Math.ceil((+windowStart + rateWindowMs - +now) / 1000))
    : 0;
}

export async function registrationSourceLimit(source: string) {
  const { limits } = await collections();
  const retryAfter = await incrementLimit(
    limits,
    "register",
    "source:" + source,
    new Date(),
  );
  return retryAfter
    ? ({ status: "limited", retryAfter } as const)
    : ({ status: "allowed" } as const);
}

export async function register(input: z.infer<typeof registration>) {
  const { users, sessions, limits } = await collections();
  const now = new Date();
  const retryAfter = await incrementLimit(
    limits,
    "register",
    "email:" + input.email,
    now,
  );
  if (retryAfter) return { status: "limited", retryAfter } as const;
  const passwordHash = await hash(input.password, {
    // The library defaults to Argon2id.
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const token = secret();
  const id = new mongoose.Types.ObjectId();
  try {
    await mongoose.connection.transaction(async (session) => {
      await users.insertOne(
        {
          _id: id,
          displayName: input.displayName,
          emailNormalized: input.email,
          passwordHash,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        },
        { session },
      );
      await sessions.insertOne(
        {
          userId: id,
          tokenHash: digest(token),
          expiresAt: new Date(+now + lifetime * 1000),
          revokedAt: null,
          createdAt: now,
          lastSeenAt: now,
        },
        { session },
      );
    });
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000 &&
      error.keyPattern?.emailNormalized
    )
      return { status: "duplicate" } as const;
    throw error;
  }
  return {
    status: "created",
    token,
    user: {
      id: id.toHexString(),
      displayName: input.displayName,
      email: input.email,
    },
  } as const;
}

export async function currentUser(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { users, sessions } = await collections();
  const session = await sessions.findOne({
    tokenHash: digest(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await users.findOne(
    { _id: session.userId, status: "ACTIVE" },
    { projection: { displayName: 1, emailNormalized: 1 } },
  );
  return user
    ? {
        id: user._id.toHexString(),
        displayName: user.displayName,
        email: user.emailNormalized,
      }
    : null;
}
import { verify } from "@node-rs/argon2";
let dummy: Promise<string> | undefined;
export async function login(
  input: z.infer<typeof loginInput>,
  source: string,
  previous: string,
) {
  const { users, sessions, limits } = await collections();
  const now = new Date();
  for (const key of ["source:" + source, "email:" + input.email]) {
    const retryAfter = await incrementLimit(limits, "login", key, now);
    if (retryAfter) return { status: "limited", retryAfter } as const;
  }
  const user = await users.findOne({ emailNormalized: input.email });
  dummy ??= hash(secret(), { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const valid = await verify(
    user?.passwordHash ?? (await dummy),
    input.password,
  );
  if (!valid || !user || user.status !== "ACTIVE")
    return { status: "invalid" } as const;
  const token = secret();
  await mongoose.connection.transaction(async (session) => {
    await sessions.insertOne(
      {
        userId: user._id,
        tokenHash: digest(token),
        expiresAt: new Date(+now + lifetime * 1000),
        revokedAt: null,
        createdAt: now,
        lastSeenAt: now,
      },
      { session },
    );
    if (previous)
      await sessions.updateOne(
        { tokenHash: digest(previous), revokedAt: null },
        { $set: { revokedAt: now } },
        { session },
      );
  });
  return {
    status: "created",
    token,
    user: {
      id: user._id.toHexString(),
      displayName: user.displayName,
      email: user.emailNormalized,
    },
  } as const;
}
export async function logout(token: string) {
  if (!token) return;
  const { sessions } = await collections();
  await sessions.updateOne(
    { tokenHash: digest(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
