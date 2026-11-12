import mongoose from "mongoose";
import { z } from "zod";
import { weddingInput } from "./wedding-validation";
import { endOfDayInZone, startOfDayInZone } from "./zoned-date";
import { WeddingScheduleError } from "./schedule-error";
import { createHash } from "node:crypto";
import { verifyMembership } from "./wedding-access";

async function connect() {
  if (!process.env.MONGODB_URI) throw new Error("Database unavailable");
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const db = mongoose.connection.db!;
  const weddings = db.collection("weddings");
  const memberships = db.collection("weddingMemberships");
  await Promise.all([
    memberships.createIndex({ userId: 1, status: 1, weddingId: 1 }),
    memberships.createIndex(
      { weddingId: 1, userId: 1 },
      { unique: true, name: "one_membership_per_wedding_user" },
    ),
    memberships.createIndex({ weddingId: 1, status: 1, role: 1 }),
  ]);
  return { weddings, memberships };
}

let ready: ReturnType<typeof connect> | undefined;
function collections() {
  return (ready ??= connect().catch((error) => {
    ready = undefined;
    throw error;
  }));
}

interface WeddingDocument {
  _id: mongoose.Types.ObjectId;
  title: string;
  coupleNames: { first: string; second: string };
  tradition: string | null;
  startsOn: string;
  endsOn: string;
  timeZone: string;
  description: string | null;
  revision?: number;
}

function dto(wedding: WeddingDocument) {
  return {
    id: wedding._id.toHexString(),
    title: wedding.title,
    coupleNames: wedding.coupleNames,
    tradition: wedding.tradition ?? null,
    startsOn: wedding.startsOn,
    endsOn: wedding.endsOn,
    timeZone: wedding.timeZone,
    description: wedding.description ?? null,
    status: "ACTIVE" as const,
    revision: wedding.revision ?? 1,
  };
}

export async function membershipForUser(userId: string, weddingId: string) {
  const { memberships, weddings } = await collections();
  if (!/^[a-f0-9]{24}$/.test(weddingId)) return null;
  if (
    !(await weddings.findOne({
      _id: new mongoose.Types.ObjectId(weddingId),
      status: "ACTIVE",
    }))
  )
    return null;
  const membership = await memberships.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    weddingId: new mongoose.Types.ObjectId(weddingId),
    status: "ACTIVE",
  });
  return membership
    ? {
        weddingId: membership.weddingId.toHexString(),
        role: membership.role as "ADMIN" | "ORGANIZER",
        membershipId: membership._id.toHexString(),
        membershipRevision: membership.revision ?? 1,
      }
    : null;
}

export async function createWedding(
  userId: string,
  input: z.infer<typeof weddingInput>,
  creationKey: string,
) {
  const { weddings, memberships } = await collections();
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const weddingId = new mongoose.Types.ObjectId();
  const now = new Date();
  const keyHash = createHash("sha256")
    .update(`create-wedding:${userId}:${creationKey}`)
    .digest("hex");
  const requestHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const attempts = mongoose.connection.db!.collection<{
    _id: string;
    userId: mongoose.Types.ObjectId;
    operation: string;
    requestHash: string;
    weddingId: mongoose.Types.ObjectId;
    createdAt: Date;
  }>("idempotencyRecords");
  const replay = async () => {
    const attempt = await attempts.findOne({ _id: keyHash });
    if (!attempt) return null;
    if (attempt.requestHash !== requestHash)
      return { status: "idempotency-conflict" } as const;
    const existing = await weddings.findOne({
      _id: attempt.weddingId,
      status: "ACTIVE",
    });
    if (
      !existing ||
      !(await membershipForUser(userId, attempt.weddingId.toHexString()))
    )
      return { status: "idempotency-conflict" } as const;
    return {
      status: "created",
      wedding: dto(existing as unknown as WeddingDocument),
    } as const;
  };
  const previous = await replay();
  if (previous) return previous;
  const windowMs = 15 * 60 * 1000;
  const windowStart = new Date(Math.floor(+now / windowMs) * windowMs);
  const limiter = mongoose.connection.db!.collection("rateLimitWindows");
  const limitFilter = {
    keyHash: createHash("sha256")
      .update(`create-wedding:${userId}`)
      .digest("hex"),
    windowStart,
  };
  let usage;
  try {
    usage = await limiter.findOneAndUpdate(
      limitFilter,
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(+windowStart + windowMs) },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (
      !(error instanceof mongoose.mongo.MongoServerError) ||
      error.code !== 11000
    )
      throw error;
    usage = await limiter.findOneAndUpdate(
      limitFilter,
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
  }
  if (!usage || usage.count > 10)
    return {
      status: "limited",
      retryAfter: Math.max(
        1,
        Math.ceil((+windowStart + windowMs - Date.now()) / 1000),
      ),
    } as const;
  const document = {
    _id: weddingId,
    title: input.title,
    coupleNames: input.coupleNames,
    tradition: input.tradition ?? null,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    startsAt: startOfDayInZone(input.startsOn, input.timeZone),
    endsAt: endOfDayInZone(input.endsOn, input.timeZone),
    timeZone: input.timeZone,
    description: input.description || null,
    invitationDesign: {},
    reminderSettings: { enabled: false },
    emailSettings: {},
    photoSettings: {},
    status: "ACTIVE",
    createdByUserId: userObjectId,
    adminCount: 1,
    membershipVersion: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await mongoose.connection.transaction(async (session) => {
      await attempts.insertOne(
        {
          _id: keyHash,
          userId: userObjectId,
          operation: "CREATE_WEDDING",
          requestHash,
          weddingId,
          createdAt: now,
        },
        { session },
      );
      await weddings.insertOne(document, { session });
      await memberships.insertOne(
        {
          weddingId,
          userId: userObjectId,
          role: "ADMIN",
          status: "ACTIVE",
          joinedAt: now,
          removedAt: null,
        },
        { session },
      );
    });
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      const previous = await replay();
      if (previous) return previous;
    }
    throw error;
  }
  return { status: "created", wedding: dto(document) } as const;
}

export async function updateWedding(
  weddingId: string,
  input: z.infer<typeof weddingInput>,
  revision: number,
  userId: string,
) {
  const { weddings } = await collections();
  return mongoose.connection.transaction(async (session) => {
    const wedding = await weddings.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(weddingId),
        status: "ACTIVE",
        ...(revision === 1
          ? { $or: [{ revision: 1 }, { revision: { $exists: false } }] }
          : { revision }),
      },
      {
        $set: {
          ...input,
          tradition: input.tradition ?? null,
          description: input.description || null,
          startsAt: startOfDayInZone(input.startsOn, input.timeZone),
          endsAt: endOfDayInZone(input.endsOn, input.timeZone),
          revision: revision + 1,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after", session },
    );
    await verifyMembership(mongoose.connection.db!, session, weddingId, userId);
    if (wedding) {
      const conflict = await mongoose.connection
        .db!.collection("functions")
        .findOne(
          {
            weddingId: wedding._id,
            status: "ACTIVE",
            $or: [
              { startsAt: { $lt: wedding.startsAt } },
              { startsAt: { $gt: wedding.endsAt } },
              { endsAt: { $lt: wedding.startsAt, $ne: null } },
              { endsAt: { $gt: wedding.endsAt } },
            ],
          },
          { session },
        );
      if (conflict)
        throw new WeddingScheduleError(
          "These wedding dates or time zone would exclude an existing function. Move or remove that function first.",
          {
            startsOn:
              "Keep all scheduled functions within the wedding date range.",
            endsOn:
              "Keep all scheduled functions within the wedding date range.",
          },
        );
    }
    return wedding ? dto(wedding as unknown as WeddingDocument) : null;
  });
}

export async function currentWedding(userId: string, weddingId: string) {
  const { weddings, memberships } = await collections();
  const membership = await memberships.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    weddingId: new mongoose.Types.ObjectId(weddingId),
    status: "ACTIVE",
  });
  if (!membership) return null;
  const wedding = await weddings.findOne({
    _id: membership.weddingId,
    status: "ACTIVE",
  });
  return wedding
    ? {
        wedding: dto(wedding as unknown as WeddingDocument),
        role: membership.role as "ADMIN" | "ORGANIZER",
        membership: {
          id: membership._id.toHexString(),
          role: membership.role,
          revision: membership.revision ?? 1,
        },
      }
    : null;
}

export async function listWeddings(
  userId: string,
  search = "",
  after = "",
  limit = 20,
) {
  const { memberships } = await collections();
  const rows = await memberships
    .aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          status: "ACTIVE",
        },
      },
      {
        $lookup: {
          from: "weddings",
          localField: "weddingId",
          foreignField: "_id",
          as: "wedding",
        },
      },
      { $unwind: "$wedding" },
      { $match: { "wedding.status": "ACTIVE" } },
      ...(after
        ? [
            {
              $match: {
                "wedding._id": { $gt: new mongoose.Types.ObjectId(after) },
              },
            },
          ]
        : []),
      ...(search
        ? [
            {
              $match: {
                $or: ["title", "coupleNames.first", "coupleNames.second"].map(
                  (field) => ({
                    [`wedding.${field}`]: {
                      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                      $options: "i",
                    },
                  }),
                ),
              },
            },
          ]
        : []),
      { $sort: { "wedding._id": 1 } },
      { $limit: limit + 1 },
    ])
    .toArray();
  const more = rows.length > limit;
  const data = rows.slice(0, limit).map((row) => ({
    ...dto(row.wedding),
    role: row.role as "ADMIN" | "ORGANIZER",
    membershipId: row._id.toHexString(),
    membershipRevision: row.revision ?? 1,
  }));
  return { data, page: { nextCursor: more ? data.at(-1)!.id : null, limit } };
}
export async function weddingCount(userId: string) {
  const { memberships } = await collections();
  const rows = await memberships
    .aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          status: "ACTIVE",
        },
      },
      {
        $lookup: {
          from: "weddings",
          localField: "weddingId",
          foreignField: "_id",
          as: "wedding",
        },
      },
      { $unwind: "$wedding" },
      { $match: { "wedding.status": "ACTIVE" } },
      { $count: "count" },
    ])
    .toArray();
  return rows[0]?.count ?? 0;
}
