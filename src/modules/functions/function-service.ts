import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import type { FunctionDto, FunctionInput } from "./function-validation";
import {
  startOfDayInZone,
  endOfDayInZone,
} from "@/modules/weddings/zoned-date";
import { WeddingScheduleError } from "@/modules/weddings/schedule-error";
import { StaleWeddingScheduleError } from "@/modules/weddings/stale-schedule-error";
import { functionColor } from "./function-colors";

async function collection() {
  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 5000,
  });
  const functions = mongoose.connection.db!.collection("functions");
  await functions.createIndex({ weddingId: 1, startsAt: 1 });
  return functions;
}
function dto(
  record: mongoose.mongo.WithId<mongoose.mongo.Document>,
): FunctionDto {
  return {
    id: record._id.toHexString(),
    name: record.name,
    color: functionColor(record.color).value,
    description: record.description,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt?.toISOString() ?? null,
    venue: record.venue,
    dressCode: record.dressCode,
    guestInstructions: record.guestInstructions,
    revision: record.revision,
    status: record.status,
  };
}
export async function listFunctions(weddingId: string) {
  return (
    await (
      await collection()
    )
      .find({
        weddingId: new mongoose.Types.ObjectId(weddingId),
        status: "ACTIVE",
      })
      .sort({ startsAt: 1, _id: 1 })
      .toArray()
  ).map(dto);
}
export async function saveFunction(
  weddingId: string,
  userId: string,
  input: FunctionInput,
  weddingRevision: number,
  id?: string,
  revision?: number,
) {
  const functions = await collection();
  return mongoose.connection.transaction(async (session) => {
    const wedding = await mongoose.connection
      .db!.collection("weddings")
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(weddingId), status: "ACTIVE" },
        { $inc: { scheduleVersion: 1 } },
        { session, returnDocument: "after" },
      );
    if (!wedding) return { status: "missing" } as const;
    if (
      id &&
      (!/^[a-f0-9]{24}$/.test(id) ||
        !(await functions.findOne(
          {
            _id: new mongoose.Types.ObjectId(id),
            weddingId: wedding._id,
            status: "ACTIVE",
          },
          { session },
        )))
    )
      return { status: "missing" } as const;
    if ((wedding.revision ?? 1) !== weddingRevision)
      throw new StaleWeddingScheduleError({
        revision: wedding.revision ?? 1,
        startsOn: wedding.startsOn,
        endsOn: wedding.endsOn,
        timeZone: wedding.timeZone,
        title: wedding.title,
      });
    const lower = startOfDayInZone(
      wedding.startsOn,
      wedding.timeZone,
    ).valueOf();
    const upper = endOfDayInZone(wedding.endsOn, wedding.timeZone).valueOf();
    const errors: Record<string, string> = {};
    const message = `Choose a time between ${wedding.startsOn} and ${wedding.endsOn} in ${wedding.timeZone}.`;
    if (
      Date.parse(input.startsAt) < lower ||
      Date.parse(input.startsAt) > upper
    )
      errors.startsAt = message;
    if (
      input.endsAt &&
      (Date.parse(input.endsAt) < lower || Date.parse(input.endsAt) > upper)
    )
      errors.endsAt = message;
    if (Object.keys(errors).length)
      throw new WeddingScheduleError(
        "Function times must stay within the wedding dates.",
        errors,
      );
    const fields = {
      ...input,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      updatedAt: new Date(),
    };
    if (id) {
      if (!/^[a-f0-9]{24}$/.test(id)) return { status: "missing" } as const;
      const filter = {
        _id: new mongoose.Types.ObjectId(id),
        weddingId: new mongoose.Types.ObjectId(weddingId),
        status: "ACTIVE",
      };
      const updated = await functions.findOneAndUpdate(
        { ...filter, revision },
        { $set: fields, $inc: { revision: 1 } },
        { returnDocument: "after", session },
      );
      if (!updated)
        return {
          status: (await functions.findOne(filter, { session }))
            ? "stale"
            : "missing",
        } as const;
      return { status: "saved", function: dto(updated) } as const;
    }
    const record = {
      _id: new mongoose.Types.ObjectId(),
      ...fields,
      weddingId: new mongoose.Types.ObjectId(weddingId),
      createdByUserId: new mongoose.Types.ObjectId(userId),
      createdAt: new Date(),
      revision: 1,
      status: "ACTIVE",
      sortOrder: 0,
      scheduleItems: [],
    };
    await functions.insertOne(record, { session });
    return { status: "saved", function: dto(record) } as const;
  });
}

export async function archiveFunction(
  weddingId: string,
  userId: string,
  id: string,
  revision: number,
) {
  const functions = await collection();
  if (!/^[a-f0-9]{24}$/.test(id)) return "missing";
  const filter = {
    _id: new mongoose.Types.ObjectId(id),
    weddingId: new mongoose.Types.ObjectId(weddingId),
  };
  return mongoose.connection.transaction(async (session) => {
    const record = await functions.findOne(filter, { session });
    if (!record) return "missing";
    if (record.status === "ARCHIVED") return "archived";
    if (record.revision !== revision) return "stale";
    await functions.updateOne(
      { ...filter, revision },
      {
        $set: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: new mongoose.Types.ObjectId(userId),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { session },
    );
    await mongoose.connection.db!.collection("auditEvents").insertOne(
      {
        weddingId: filter.weddingId,
        actorType: "USER",
        actorRef: new mongoose.Types.ObjectId(userId),
        action: "FUNCTION_ARCHIVED",
        entityType: "FUNCTION",
        entityId: filter._id,
        occurredAt: new Date(),
        requestId: randomUUID(),
      },
      { session },
    );
    return "archived";
  });
}
