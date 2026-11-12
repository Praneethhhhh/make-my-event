import mongoose from "mongoose";
import { z } from "zod";
import { weddingInput } from "./wedding-validation";
import { endOfDayInZone, startOfDayInZone } from "./zoned-date";
import { WeddingScheduleError } from "./schedule-error";

async function connect() {
  if (!process.env.MONGODB_URI) throw new Error("Database unavailable");
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const db = mongoose.connection.db!;
  const weddings = db.collection("weddings");
  const memberships = db.collection("weddingMemberships");
  await Promise.all([
    memberships.createIndex(
      { userId: 1 },
      {
        unique: true,
        partialFilterExpression: { status: "ACTIVE" },
        name: "one_active_wedding_per_user",
      },
    ),
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

export async function membershipForUser(userId: string) {
  const { memberships } = await collections();
  const membership = await memberships.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    status: "ACTIVE",
  });
  return membership
    ? {
        weddingId: membership.weddingId.toHexString(),
        role: membership.role as "ADMIN" | "ORGANIZER",
      }
    : null;
}

export async function createWedding(
  userId: string,
  input: z.infer<typeof weddingInput>,
) {
  const { weddings, memberships } = await collections();
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const weddingId = new mongoose.Types.ObjectId();
  const now = new Date();
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
      const existing = await memberships.findOne(
        { userId: userObjectId, status: "ACTIVE" },
        { session },
      );
      if (existing) throw new Error("MEMBERSHIP_LIMIT");
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
      (error instanceof Error && error.message === "MEMBERSHIP_LIMIT") ||
      (error instanceof mongoose.mongo.MongoServerError && error.code === 11000)
    )
      return { status: "membership-limit" } as const;
    throw error;
  }
  return { status: "created", wedding: dto(document) } as const;
}

export async function updateWedding(
  weddingId: string,
  input: z.infer<typeof weddingInput>,
  revision: number,
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

export async function currentWedding(userId: string) {
  const { weddings, memberships } = await collections();
  const membership = await memberships.findOne({
    userId: new mongoose.Types.ObjectId(userId),
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
      }
    : null;
}
