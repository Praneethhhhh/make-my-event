import mongoose from "mongoose";
import { cookieValue, cookie } from "@/modules/auth/auth-http";
import {
  idempotent,
  type Session,
  type Row,
} from "@/modules/operations/operations-store";
import {
  guestDatabase,
  oid,
  secret,
  digest,
  unavailableGuest,
  limit,
} from "./guest-store";
import { functionView, saveResponse } from "./guest-service";
import type { Invitation } from "./guest-types";
import type { GuestResponse } from "./guest-validation";
export const guestCookie = (id: string) =>
  (process.env.NODE_ENV === "production" ? "__Host-" : "") + "mme_guest_" + id;
function active(link: Row | null) {
  return (
    !!link &&
    link.status === "ACTIVE" &&
    (!link.expiresAt || +new Date(link.expiresAt) > Date.now())
  );
}
export async function exchange(token: string) {
  const db = await guestDatabase(),
    tokenHash = digest(token);
  await limit("token:" + tokenHash, 30);
  const candidate = await db
    .collection("accessLinks")
    .findOne({ tokenHash, subjectType: "GUEST" });
  if (!active(candidate)) unavailableGuest();
  return mongoose.connection.transaction(async (session) => {
    const wedding = await db
      .collection("weddings")
      .findOneAndUpdate(
        { _id: candidate!.weddingId, status: "ACTIVE" },
        { $inc: { coordinationVersion: 1 } },
        { session, returnDocument: "after" },
      );
    if (!wedding) unavailableGuest();
    const link = await db.collection("accessLinks").findOne(
      {
        _id: candidate!._id,
        weddingId: wedding!._id,
        tokenHash,
        subjectType: "GUEST",
      },
      { session },
    );
    if (!active(link)) unavailableGuest();
    const guest = await db
      .collection("guests")
      .findOne(
        { _id: link!.guestId, weddingId: wedding!._id, status: "ACTIVE" },
        { session },
      );
    if (!guest) unavailableGuest();
    const sessionToken = secret(),
      expiresAt = new Date(Date.now() + 86400000);
    await db.collection("portalSessions").insertOne(
      {
        weddingId: wedding!._id,
        guestId: guest!._id,
        linkId: link!._id,
        linkVersion: link!.revision,
        subjectType: "GUEST",
        sessionTokenHash: digest(sessionToken),
        createdAt: new Date(),
        expiresAt,
        revokedAt: null,
      },
      { session },
    );
    return {
      guestId: String(guest!._id),
      setCookie: cookie(guestCookie(String(guest!._id)), sessionToken, 86400),
    };
  });
}
async function authorize(
  db: mongoose.mongo.Db,
  guestId: string,
  token: string,
  session?: Session,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) unavailableGuest();
  const options = session ? { session } : {},
    portal = await db.collection("portalSessions").findOne(
      {
        guestId: oid(guestId),
        subjectType: "GUEST",
        sessionTokenHash: digest(token),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      options,
    );
  if (!portal) unavailableGuest();
  const link = await db.collection("accessLinks").findOne(
    {
      _id: portal!.linkId,
      weddingId: portal!.weddingId,
      guestId: portal!.guestId,
      subjectType: "GUEST",
      revision: portal!.linkVersion,
    },
    options,
  );
  if (!active(link)) unavailableGuest();
  const guest = await db.collection("guests").findOne(
      {
        _id: portal!.guestId,
        weddingId: portal!.weddingId,
        status: "ACTIVE",
      },
      options,
    ),
    wedding = await db
      .collection("weddings")
      .findOne({ _id: portal!.weddingId, status: "ACTIVE" }, options);
  if (!guest || !wedding) unavailableGuest();
  return { guest: guest!, wedding: wedding!, portal: portal! };
}
export function guestCredential(request: Request, id: string) {
  return cookieValue(request, guestCookie(id));
}
export async function publicInvitation(
  id: string,
  token: string,
): Promise<Invitation> {
  const db = await guestDatabase(),
    { guest, wedding } = await authorize(db, id, token);
  const invitations = await db
      .collection("functionInvitations")
      .find({
        weddingId: wedding._id,
        guestId: guest._id,
        eligibilityStatus: "ACTIVE",
      })
      .toArray(),
    functions = await db
      .collection("functions")
      .find({
        weddingId: wedding._id,
        _id: { $in: invitations.map((i) => i.functionId) },
        status: "ACTIVE",
      })
      .sort({ startsAt: 1 })
      .toArray();
  return {
    guestId: id,
    displayName: guest.displayName,
    personalMessage: guest.personalMessage ?? "",
    title: wedding.title,
    coupleNames: {
      first: wedding.coupleNames.first,
      second: wedding.coupleNames.second,
    },
    timeZone: wedding.timeZone,
    startsOn: wedding.startsOn,
    endsOn: wedding.endsOn,
    serverTime: new Date().toISOString(),
    functions: functions.map((fn) =>
      functionView(
        fn,
        invitations.find((i) => String(i.functionId) === String(fn._id)),
      ),
    ),
  };
}
export async function guestRsvp(
  id: string,
  token: string,
  invitationId: string,
  input: GuestResponse,
) {
  const db = await guestDatabase(),
    initial = await authorize(db, id, token);
  await limit("rsvp:" + digest(token), 60);
  return mongoose.connection.transaction(async (session) => {
    const wedding = await db
      .collection("weddings")
      .findOneAndUpdate(
        { _id: initial.wedding._id, status: "ACTIVE" },
        { $inc: { coordinationVersion: 1 } },
        { session, returnDocument: "after" },
      );
    if (!wedding) unavailableGuest();
    const current = await authorize(db, id, token, session);
    const target = await db.collection("functionInvitations").findOne(
      {
        _id: oid(invitationId),
        weddingId: wedding!._id,
        guestId: current.guest._id,
        eligibilityStatus: "ACTIVE",
      },
      { session },
    );
    if (
      !target ||
      !(await db
        .collection("functions")
        .findOne(
          { _id: target.functionId, weddingId: wedding!._id, status: "ACTIVE" },
          { session },
        ))
    )
      unavailableGuest();
    return idempotent(
      db,
      session,
      wedding!._id,
      "guest:" + id,
      "GUEST_RSVP",
      input.creationKey,
      { invitationId, ...input },
      () =>
        saveResponse(
          db,
          session,
          current.wedding,
          current.guest._id,
          invitationId,
          input,
          null,
        ),
    );
  });
}
