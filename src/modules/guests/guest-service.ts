import { privateGuestUrl } from "./guest-link";
import mongoose from "mongoose";
import {
  transaction,
  idempotent,
  stale,
  missing,
  type Row,
  type Session,
} from "@/modules/operations/operations-store";
import {
  guestDatabase,
  oid,
  OperationsError,
  secret,
  digest,
  encrypt,
  decrypt,
  clearedSecret,
  event,
} from "./guest-store";
import type { GuestInput, GuestEdit, GuestResponse } from "./guest-validation";
import type {
  GuestFunction,
  Guest,
  Invitation,
  GuestSummary,
} from "./guest-types";
export function deadline(row: Row, fn: Row) {
  return new Date(
    Math.min(
      +new Date(row.deadlineOverrideAt ?? fn.rsvpDeadlineAt ?? fn.startsAt),
      +new Date(fn.startsAt),
    ),
  );
}
export function functionView(
  fn: Row,
  row?: Row,
  management = false,
): GuestFunction {
  return {
    id: String(fn._id),
    name: String(fn.name),
    color: fn.color ?? "FOREST",
    startsAt: new Date(fn.startsAt).toISOString(),
    endsAt: fn.endsAt ? new Date(fn.endsAt).toISOString() : null,
    venue: {
      name: fn.venue?.name ?? "",
      address: fn.venue?.address ?? "",
      city: fn.venue?.city ?? "",
      state: fn.venue?.state ?? "",
      mapUrl: fn.venue?.mapUrl ?? "",
      latitude: fn.venue?.latitude ?? null,
      longitude: fn.venue?.longitude ?? null,
    },
    ...(row ? { invitationId: String(row._id) } : {}),
    status: row?.status ?? "PENDING",
    attendeeCount: row?.attendeeCount ?? 0,
    respondedAt: row?.respondedAt
      ? new Date(row.respondedAt).toISOString()
      : null,
    revision: row?.revision ?? 1,
    deadlineAt: deadline(row ?? fn, fn).toISOString(),
    ...(management
      ? {
          deadlineOverrideAt: row?.deadlineOverrideAt
            ? new Date(row.deadlineOverrideAt).toISOString()
            : null,
          maxAttendees: row?.maxAttendees ?? 4,
          eligibilityStatus:
            fn.status !== "ACTIVE"
              ? "ARCHIVED"
              : (row?.eligibilityStatus ?? "ACTIVE"),
        }
      : {}),
  };
}
const liveLink = () => ({
  subjectType: "GUEST",
  status: "ACTIVE",
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});
export async function guestDetails(
  weddingId: string,
  id: string,
): Promise<Guest> {
  const db = await guestDatabase(),
    wedding = oid(weddingId),
    guest = await db
      .collection("guests")
      .findOne({ _id: oid(id), weddingId: wedding });
  if (!guest) missing();
  const rows = await db
      .collection("functionInvitations")
      .find({ weddingId: wedding, guestId: guest!._id })
      .toArray(),
    functions = await db
      .collection("functions")
      .find({ weddingId: wedding, _id: { $in: rows.map((r) => r.functionId) } })
      .sort({ startsAt: 1 })
      .toArray();
  return {
    id,
    displayName: guest!.displayName,
    personalMessage: guest!.personalMessage ?? "",
    revision: guest!.revision,
    status: guest!.status,
    linkActive: !!(await db
      .collection("accessLinks")
      .findOne({ weddingId: wedding, guestId: guest!._id, ...liveLink() })),
    functions: functions.map((fn) =>
      functionView(
        fn,
        rows.find((r) => String(r.functionId) === String(fn._id)),
        true,
      ),
    ),
  };
}
export async function guestContext(weddingId: string, userId: string) {
  const db = await guestDatabase(),
    w = await db
      .collection("weddings")
      .findOne({ _id: oid(weddingId), status: "ACTIVE" }),
    user = await db
      .collection("users")
      .findOne({ _id: oid(userId) }, { projection: { displayName: 1 } });
  if (!w) missing();
  const functions = await db
    .collection("functions")
    .find({ weddingId: w!._id, status: "ACTIVE" })
    .sort({ startsAt: 1 })
    .toArray();
  return {
    displayName: user?.displayName ?? "",
    title: w!.title,
    timeZone: w!.timeZone,
    coupleNames: w!.coupleNames,
    startsOn: w!.startsOn,
    endsOn: w!.endsOn,
    functions: functions.map((fn) => functionView(fn, undefined, true)),
  };
}
export async function listGuests(weddingId: string, url: URL) {
  const db = await guestDatabase(),
    wedding = oid(weddingId),
    filter: mongoose.mongo.Document = {
      weddingId: wedding,
      status:
        url.searchParams.get("state") === "removed" ? "DISABLED" : "ACTIVE",
    };
  const q = url.searchParams.get("q") ?? "";
  if (q.length > 160)
    throw new OperationsError(400, "VALIDATION_ERROR", "Search is too long.");
  if (q)
    filter.displayName = {
      $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  const fid = url.searchParams.get("function"),
    status = url.searchParams.get("response");
  if (status && !fid)
    throw new OperationsError(
      422,
      "VALIDATION_ERROR",
      "Choose a function before filtering responses.",
    );
  if (fid) {
    if (
      !/^[a-f0-9]{24}$/.test(fid) ||
      (status && !["ACCEPTED", "DECLINED", "PENDING"].includes(status))
    )
      throw new OperationsError(400, "VALIDATION_ERROR", "Invalid filter.");
    const invited = await db
      .collection("functionInvitations")
      .distinct("guestId", {
        weddingId: wedding,
        functionId: oid(fid),
        eligibilityStatus: "ACTIVE",
        ...(status ? { status } : {}),
      });
    filter._id = { $in: invited };
  }
  const total = await db.collection("guests").countDocuments(filter);
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    if (!/^[a-f0-9]{24}$/.test(cursor))
      throw new OperationsError(400, "VALIDATION_ERROR", "Invalid page.");
    filter._id = { ...(filter._id ?? {}), $lt: oid(cursor) };
  }
  const rows = await db
      .collection("guests")
      .find(filter)
      .sort({ _id: -1 })
      .limit(26)
      .toArray(),
    more = rows.length > 25;
  rows.splice(25);
  const ids = rows.map((r) => r._id);
  const [invitations, functions, links] = await Promise.all([
    db
      .collection("functionInvitations")
      .find({ weddingId: wedding, guestId: { $in: ids } })
      .toArray(),
    db
      .collection("functions")
      .find({ weddingId: wedding })
      .sort({ startsAt: 1 })
      .toArray(),
    db
      .collection("accessLinks")
      .find(
        { weddingId: wedding, guestId: { $in: ids }, ...liveLink() },
        { projection: { guestId: 1 } },
      )
      .toArray(),
  ]);
  return {
    items: rows.map((row) => {
      const own = invitations.filter(
        (i) => String(i.guestId) === String(row._id),
      );
      return {
        id: String(row._id),
        displayName: row.displayName,
        personalMessage: row.personalMessage ?? "",
        revision: row.revision,
        status: row.status,
        linkActive: links.some((l) => String(l.guestId) === String(row._id)),
        functions: functions
          .filter((f) =>
            own.some((i) => String(i.functionId) === String(f._id)),
          )
          .map((f) =>
            functionView(
              f,
              own.find((i) => String(i.functionId) === String(f._id)),
              true,
            ),
          ),
      };
    }),
    total,
    nextCursor: more ? String(rows.at(-1)!._id) : null,
  };
}
async function newLink(
  db: mongoose.mongo.Db,
  session: Session,
  weddingId: mongoose.Types.ObjectId,
  guestId: mongoose.Types.ObjectId,
  userId: string,
) {
  const token = secret();
  await db.collection("accessLinks").insertOne(
    {
      weddingId,
      guestId,
      subjectType: "GUEST",
      status: "ACTIVE",
      tokenHash: digest(token),
      ...encrypt(token),
      revision: 1,
      createdByUserId: oid(userId),
      createdAt: new Date(),
    },
    { session },
  );
}
export async function saveGuest(
  weddingId: string,
  userId: string,
  input: GuestInput | GuestEdit,
  id?: string,
) {
  await guestDatabase();
  return transaction(weddingId, userId, (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      id ? "GUEST_EDIT" : "GUEST_CREATE",
      input.creationKey,
      input,
      async () => {
        const guestId = id ? oid(id) : new mongoose.Types.ObjectId(),
          now = new Date(),
          old = id
            ? await db
                .collection("guests")
                .findOne(
                  { _id: guestId, weddingId: wedding._id, status: "ACTIVE" },
                  { session },
                )
            : null;
        if (id && !old) missing();
        if (old && old.revision !== (input as GuestEdit).revision) stale();
        const existing = await db
          .collection("functionInvitations")
          .find({ weddingId: wedding._id, guestId }, { session })
          .toArray();
        for (const selected of input.functions) {
          const fn = await db.collection("functions").findOne(
            {
              _id: oid(selected.functionId),
              weddingId: wedding._id,
              status: "ACTIVE",
            },
            { session },
          );
          if (!fn)
            throw new OperationsError(
              422,
              "INVALID_REFERENCE",
              "Choose active functions from this wedding.",
            );
          if (
            selected.deadlineOverrideAt &&
            +new Date(selected.deadlineOverrideAt) > +new Date(fn.startsAt)
          )
            throw new OperationsError(
              422,
              "INVALID_DEADLINE",
              "The response deadline must be no later than the function start.",
            );
          const prior = existing.find(
            (r) => String(r.functionId) === selected.functionId,
          );
          if (prior?.eligibilityStatus === "ACTIVE") {
            const changed =
              prior.maxAttendees !== selected.maxAttendees ||
              String(
                prior.deadlineOverrideAt
                  ? new Date(prior.deadlineOverrideAt).toISOString()
                  : null,
              ) !== String(selected.deadlineOverrideAt);
            if (changed) {
              if (selected.revision !== prior.revision) stale();
              if (
                prior.status === "ACCEPTED" &&
                selected.maxAttendees < prior.attendeeCount
              )
                throw new OperationsError(
                  409,
                  "LIMIT_BELOW_RESPONSE",
                  "This family has already accepted more people. Correct their response before reducing the limit.",
                );
              await db.collection("functionInvitations").updateOne(
                { _id: prior._id, weddingId: wedding._id },
                {
                  $set: {
                    maxAttendees: selected.maxAttendees,
                    deadlineOverrideAt: selected.deadlineOverrideAt
                      ? new Date(selected.deadlineOverrideAt)
                      : null,
                    updatedAt: now,
                  },
                  $inc: { revision: 1 },
                },
                { session },
              );
            }
          } else {
            if (prior)
              await event(
                db,
                session,
                wedding._id,
                guestId,
                "GUEST_FUNCTION_REINVITED",
                userId,
                {
                  functionId: prior.functionId,
                  previousStatus: prior.status,
                  previousCount: prior.attendeeCount,
                },
              );
            await db.collection("functionInvitations").updateOne(
              { weddingId: wedding._id, guestId, functionId: fn._id },
              {
                $set: {
                  eligibilityStatus: "ACTIVE",
                  status: "PENDING",
                  attendeeCount: 0,
                  maxAttendees: selected.maxAttendees,
                  deadlineOverrideAt: selected.deadlineOverrideAt
                    ? new Date(selected.deadlineOverrideAt)
                    : null,
                  updatedAt: now,
                  respondedAt: null,
                },
                $inc: { revision: 1 },
                $setOnInsert: { createdAt: now },
              },
              { upsert: true, session },
            );
          }
        }
        const removed = existing.filter(
          (r) =>
            r.eligibilityStatus === "ACTIVE" &&
            !input.functions.some((f) => f.functionId === String(r.functionId)),
        );
        for (const row of removed) {
          await db.collection("functionInvitations").updateOne(
            { _id: row._id, weddingId: wedding._id },
            {
              $set: { eligibilityStatus: "REVOKED", revokedAt: now },
              $inc: { revision: 1 },
            },
            { session },
          );
          await event(
            db,
            session,
            wedding._id,
            guestId,
            "GUEST_FUNCTION_REVOKED",
            userId,
            {
              functionId: row.functionId,
              status: row.status,
              attendeeCount: row.attendeeCount,
            },
          );
        }
        if (old)
          await db.collection("guests").updateOne(
            { _id: guestId, weddingId: wedding._id },
            {
              $set: {
                displayName: input.displayName,
                personalMessage: input.personalMessage,
                updatedAt: now,
              },
              $inc: { revision: 1 },
            },
            { session },
          );
        else {
          await db.collection("guests").insertOne(
            {
              _id: guestId,
              weddingId: wedding._id,
              displayName: input.displayName,
              personalMessage: input.personalMessage,
              status: "ACTIVE",
              revision: 1,
              createdByUserId: oid(userId),
              createdAt: now,
              updatedAt: now,
            },
            { session },
          );
          await newLink(db, session, wedding._id, guestId, userId);
        }
        await event(
          db,
          session,
          wedding._id,
          guestId,
          old ? "GUEST_EDITED" : "GUEST_CREATED",
          userId,
        );
        return { id: String(guestId) };
      },
    ),
  );
}
export async function linkAction(
  weddingId: string,
  userId: string,
  id: string,
  action: "reveal" | "rotate" | "disable" | "revoke",
  input: { revision: number; creationKey: string },
) {
  await guestDatabase();
  return transaction(weddingId, userId, async (db, session, wedding) => {
    const work = async () => {
      const guest = await db
        .collection("guests")
        .findOne(
          { _id: oid(id), weddingId: wedding._id, status: "ACTIVE" },
          { session },
        );
      if (!guest) missing();
      if (guest!.revision !== input.revision) stale();
      const link = await db.collection("accessLinks").findOne(
        {
          weddingId: wedding._id,
          guestId: guest!._id,
          ...(action === "reveal"
            ? liveLink()
            : { subjectType: "GUEST", status: "ACTIVE" }),
        },
        { session },
      );
      if (action === "reveal") {
        if (!link)
          throw new OperationsError(
            409,
            "LINK_UNAVAILABLE",
            "This link is no longer active. Replace it to share a new invitation.",
          );
        await event(
          db,
          session,
          wedding._id,
          guest!._id,
          "GUEST_LINK_REVEALED",
          userId,
        );
        return {
          url: privateGuestUrl(decrypt(link)),
        };
      }
      if (link) {
        await db.collection("accessLinks").updateOne(
          { _id: link._id, weddingId: wedding._id },
          {
            $set: {
              status: "REVOKED",
              revokedAt: new Date(),
              ...clearedSecret,
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        await db
          .collection("portalSessions")
          .updateMany(
            { weddingId: wedding._id, linkId: link._id },
            { $set: { revokedAt: new Date() } },
            { session },
          );
      }
      if (action === "rotate")
        await newLink(db, session, wedding._id, guest!._id, userId);
      if (action === "disable")
        await db.collection("functionInvitations").updateMany(
          {
            weddingId: wedding._id,
            guestId: guest!._id,
            eligibilityStatus: "ACTIVE",
          },
          {
            $set: { eligibilityStatus: "REVOKED", revokedAt: new Date() },
            $inc: { revision: 1 },
          },
          { session },
        );
      await db.collection("guests").updateOne(
        { _id: guest!._id, weddingId: wedding._id },
        {
          $inc: { revision: 1 },
          ...(action === "disable"
            ? { $set: { status: "DISABLED", updatedAt: new Date() } }
            : {}),
        },
        { session },
      );
      await event(
        db,
        session,
        wedding._id,
        guest!._id,
        "GUEST_LINK_" + action.toUpperCase(),
        userId,
      );
      return { id };
    };
    return action === "reveal"
      ? work()
      : idempotent(
          db,
          session,
          wedding._id,
          userId,
          "GUEST_LINK_" + action,
          input.creationKey,
          { id, ...input },
          work,
        );
  });
}
export async function guestSummary(weddingId: string): Promise<GuestSummary> {
  const db = await guestDatabase(),
    w = oid(weddingId),
    functions = await db
      .collection("functions")
      .find({ weddingId: w, status: "ACTIVE" })
      .sort({ startsAt: 1 })
      .toArray();
  const activeGuests = await db
      .collection("guests")
      .distinct("_id", { weddingId: w, status: "ACTIVE" }),
    linked = await db.collection("accessLinks").distinct("guestId", {
      weddingId: w,
      guestId: { $in: activeGuests },
      ...liveLink(),
    });
  const groups = await db
    .collection("functionInvitations")
    .aggregate([
      {
        $match: {
          weddingId: w,
          guestId: { $in: linked },
          functionId: { $in: functions.map((f) => f._id) },
          eligibilityStatus: "ACTIVE",
        },
      },
      {
        $group: {
          _id: { functionId: "$functionId", status: "$status" },
          count: { $sum: 1 },
          people: {
            $sum: {
              $cond: [{ $eq: ["$status", "ACCEPTED"] }, "$attendeeCount", 0],
            },
          },
        },
      },
    ])
    .toArray();
  return {
    totalRecipients: activeGuests.length,
    functions: functions.map((fn) => {
      const rows = groups.filter(
          (g) => String(g._id.functionId) === String(fn._id),
        ),
        count = (status: string) =>
          rows.find((r) => r._id.status === status)?.count ?? 0;
      return {
        id: String(fn._id),
        name: fn.name,
        color: fn.color ?? "FOREST",
        invited: rows.reduce((sum, r) => sum + r.count, 0),
        accepted: count("ACCEPTED"),
        declined: count("DECLINED"),
        pending: count("PENDING"),
        people: rows.reduce((sum, r) => sum + r.people, 0),
      };
    }),
  };
}
export async function managerPreview(
  weddingId: string,
  id?: string,
): Promise<Invitation> {
  const context = await guestContext(weddingId, "000000000000000000000000"),
    guest = id ? await guestDetails(weddingId, id) : null;
  if (guest && guest.status !== "ACTIVE") missing();
  return {
    guestId: guest?.id ?? null,
    displayName: guest?.displayName ?? "Our family and friends",
    personalMessage:
      guest?.personalMessage ?? "We would love to celebrate with you.",
    coupleNames: context.coupleNames,
    title: context.title,
    timeZone: context.timeZone,
    startsOn: context.startsOn,
    endsOn: context.endsOn,
    serverTime: new Date().toISOString(),
    functions: guest
      ? guest.functions
          .filter((f) => f.eligibilityStatus === "ACTIVE")
          .map(
            ({
              maxAttendees: _,
              eligibilityStatus: __,
              deadlineOverrideAt: ___,
              ...f
            }) => {
              void _;
              void __;
              void ___;
              return f;
            },
          )
      : context.functions.map(
          ({
            maxAttendees: _,
            eligibilityStatus: __,
            deadlineOverrideAt: ___,
            ...f
          }) => {
            void _;
            void __;
            void ___;
            return f;
          },
        ),
  };
}
export async function saveResponse(
  db: mongoose.mongo.Db,
  session: Session,
  wedding: Row,
  guestId: mongoose.Types.ObjectId,
  invitationId: string,
  input: GuestResponse,
  actor: string | null,
  reason?: string,
) {
  const row = await db.collection("functionInvitations").findOne(
    {
      _id: oid(invitationId),
      weddingId: wedding._id,
      guestId,
      eligibilityStatus: "ACTIVE",
    },
    { session },
  );
  if (!row) missing();
  const fn = await db
    .collection("functions")
    .findOne(
      { _id: row!.functionId, weddingId: wedding._id, status: "ACTIVE" },
      { session },
    );
  if (!fn) missing();
  if (row!.revision !== input.revision) stale();
  if (!actor && Date.now() >= +deadline(row!, fn!))
    throw new OperationsError(
      409,
      "RSVP_DEADLINE_PASSED",
      "The response deadline has passed. Please contact your hosts for a change.",
    );
  if (input.status === "ACCEPTED" && input.attendeeCount > row!.maxAttendees)
    throw new OperationsError(
      422,
      "ATTENDANCE_LIMIT_EXCEEDED",
      "Please choose fewer people or contact your hosts.",
    );
  await db.collection("functionInvitations").updateOne(
    { _id: row!._id, weddingId: wedding._id },
    {
      $set: {
        status: input.status,
        attendeeCount: input.attendeeCount,
        respondedAt: new Date(),
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    },
    { session },
  );
  await event(
    db,
    session,
    wedding._id,
    guestId,
    actor ? "GUEST_RSVP_CORRECTED" : "GUEST_RSVP_SAVED",
    actor,
    {
      invitationId: row!._id,
      previousStatus: row!.status,
      previousCount: row!.attendeeCount,
      status: input.status,
      attendeeCount: input.attendeeCount,
      ...(reason ? { reason } : {}),
    },
  );
  return {
    id: invitationId,
    status: input.status,
    attendeeCount: input.attendeeCount,
    revision: row!.revision + 1,
    respondedAt: new Date().toISOString(),
  };
}
export async function correctResponse(
  weddingId: string,
  userId: string,
  invitationId: string,
  input: GuestResponse & { reason: string },
) {
  await guestDatabase();
  return transaction(weddingId, userId, (db, session, wedding) =>
    idempotent(
      db,
      session,
      wedding._id,
      userId,
      "GUEST_RSVP_CORRECT",
      input.creationKey,
      { invitationId, ...input },
      async () => {
        const row = await db.collection("functionInvitations").findOne(
          {
            _id: oid(invitationId),
            weddingId: wedding._id,
            eligibilityStatus: "ACTIVE",
          },
          { session },
        );
        if (!row) missing();
        const guest = await db
          .collection("guests")
          .findOne(
            { _id: row!.guestId, weddingId: wedding._id, status: "ACTIVE" },
            { session },
          );
        if (!guest) missing();
        return saveResponse(
          db,
          session,
          wedding,
          guest!._id,
          invitationId,
          input,
          userId,
          input.reason,
        );
      },
    ),
  );
}
