import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import {
  codeSecret,
  createInvitationCode,
  invitationVerifier,
  decryptInvitationCode,
} from "./invitation-code";
import type {
  InvitationInput,
  InvitationDto,
  MemberDto,
} from "./team-validation";
import { sendInvitationEmail } from "./invitation-email";
import { lifetime, secret } from "@/modules/auth/registration-service";

export class TeamError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
    public weddingId?: string,
  ) {
    super(message);
  }
}
async function connect() {
  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 5000,
  });
  const db = mongoose.connection.db!;
  await db.collection("membershipInvites").createIndex(
    { codeVerifier: 1 },
    {
      unique: true,
      partialFilterExpression: { codeVerifier: { $type: "string" } },
    },
  );
  // Remove the obsolete link-verifier constraint when upgrading an existing database.
  const legacy = (
    await db.collection("membershipInvites").listIndexes().toArray()
  ).find(
    (index) =>
      index.name === "tokenHash_1" &&
      index.unique &&
      Object.keys(index.key).length === 1 &&
      index.key.tokenHash === 1,
  );
  if (legacy) {
    try {
      await db.collection("membershipInvites").dropIndex("tokenHash_1");
    } catch (error) {
      if (
        !(error instanceof mongoose.mongo.MongoServerError) ||
        error.code !== 27
      )
        throw error;
    }
  }
  await db.collection("membershipInvites").createIndex(
    { weddingId: 1, creationKey: 1 },
    {
      unique: true,
      partialFilterExpression: { creationKey: { $type: "string" } },
    },
  );
  await db
    .collection("membershipInvites")
    .createIndex({ weddingId: 1, createdAt: -1 });
  return db;
}
let ready: ReturnType<typeof connect> | undefined;
function database() {
  return (ready ??= connect().catch((error) => {
    ready = undefined;
    throw error;
  }));
}
const objectId = (id: string) => new mongoose.Types.ObjectId(id);
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function invitationDto(
  record: mongoose.mongo.WithId<mongoose.mongo.Document>,
): InvitationDto {
  return {
    deliveryMethod: record.deliveryMethod ?? "EMAIL",
    id: record._id.toHexString(),
    role: record.role,
    intendedEmail: record.intendedEmailNormalized ?? null,
    emailStatus: record.emailStatus ?? "NOT_SENT",
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    status: record.consumedAt
      ? "ACCEPTED"
      : record.revokedAt
        ? "REVOKED"
        : record.expiresAt <= new Date()
          ? "EXPIRED"
          : "PENDING",
  };
}
export async function listMembers(
  weddingId: string,
  userId: string,
): Promise<MemberDto[]> {
  const db = await database();
  const rows = await db
    .collection("weddingMemberships")
    .aggregate([
      { $match: { weddingId: objectId(weddingId), status: "ACTIVE" } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      { $match: { "user.status": "ACTIVE" } },
      { $sort: { joinedAt: 1, _id: 1 } },
      {
        $project: {
          _id: 1,
          userId: 1,
          role: 1,
          revision: 1,
          displayName: "$user.displayName",
          email: "$user.emailNormalized",
        },
      },
    ])
    .toArray();
  return rows.map((row) => ({
    id: row._id.toHexString(),
    displayName: row.displayName,
    email: row.email,
    role: row.role,
    isYou: row.userId.toHexString() === userId,
    revision: row.revision ?? 1,
  }));
}
export async function listInvitations(weddingId: string) {
  const invites = (await database()).collection("membershipInvites");
  const expired = await invites
    .find({
      weddingId: objectId(weddingId),
      expiresAt: { $lte: new Date() },
      encryptedCode: { $exists: true },
    })
    .project({ _id: 1 })
    .limit(100)
    .toArray();
  if (expired.length)
    await invites.updateMany(
      { _id: { $in: expired.map((row) => row._id) } },
      { $unset: { encryptedCode: "" } },
    );
  const wedding = { weddingId: objectId(weddingId) };
  const now = new Date();
  const [pending, history] = await Promise.all([
    invites
      .find({
        ...wedding,
        revokedAt: null,
        consumedAt: null,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1, _id: -1 })
      .toArray(),
    invites
      .find({
        ...wedding,
        $or: [
          { revokedAt: { $ne: null } },
          { consumedAt: { $ne: null } },
          { expiresAt: { $lte: now } },
        ],
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray(),
  ]);
  return [...pending, ...history].map(invitationDto);
}
async function adminGuard(
  db: mongoose.mongo.Db,
  session: mongoose.mongo.ClientSession,
  weddingId: string,
  userId: string,
) {
  const wedding = await db
    .collection("weddings")
    .findOneAndUpdate(
      { _id: objectId(weddingId), status: "ACTIVE" },
      { $inc: { membershipVersion: 1 } },
      { session },
    );
  const membership = await db.collection("weddingMemberships").findOne(
    {
      weddingId: objectId(weddingId),
      userId: objectId(userId),
      role: "ADMIN",
      status: "ACTIVE",
    },
    { session },
  );
  if (!wedding || !membership)
    throw new TeamError(
      403,
      "PERMISSION_DENIED",
      "Only administrators can manage invitations.",
    );
}
export async function createInvitation(
  weddingId: string,
  userId: string,
  input: InvitationInput,
  creationKey: string,
) {
  if (
    input.deliveryMethod === "EMAIL" &&
    (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
  )
    throw new TeamError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "Email sending is not configured yet. Please finish the email setup before inviting people.",
    );
  try {
    codeSecret();
  } catch {
    throw new TeamError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "Invitation security is not configured. Please finish the email setup.",
    );
  }
  const db = await database();
  const { code, codeVerifier, encryptedCode } = createInvitationCode(
    input.intendedEmail,
  );
  const now = new Date();
  const record = {
    _id: new mongoose.Types.ObjectId(),
    weddingId: objectId(weddingId),
    role: input.role,
    intendedEmailNormalized: input.intendedEmail ?? null,
    invitedByUserId: objectId(userId),
    codeVerifier,
    encryptedCode,
    deliveryMethod: input.deliveryMethod,
    creationKey,
    requestHash: digest(JSON.stringify(input)),
    createdAt: now,
    expiresAt: new Date(+now + input.expiresInHours * 3600000),
    consumedAt: null,
    revokedAt: null,
    emailStatus: input.deliveryMethod === "MANUAL" ? "NOT_SENT" : "SENDING",
  };
  await mongoose.connection.transaction(async (session) => {
    await adminGuard(db, session, weddingId, userId);
    const existing = await db
      .collection("membershipInvites")
      .findOne({ weddingId: record.weddingId, creationKey }, { session });
    if (existing)
      throw new TeamError(
        409,
        "INVITATION_ALREADY_CREATED",
        "An invitation was already created for this attempt. Refresh invitations to review its email status before trying again.",
      );
    const recipient = await db
      .collection("users")
      .findOne({ emailNormalized: input.intendedEmail }, { session });
    if (
      recipient &&
      (await db.collection("weddingMemberships").findOne(
        {
          weddingId: record.weddingId,
          userId: recipient._id,
          status: "ACTIVE",
        },
        { session },
      ))
    )
      throw new TeamError(
        409,
        "ALREADY_A_MEMBER",
        "This person already has access to this wedding.",
      );
    await db.collection("membershipInvites").updateMany(
      {
        weddingId: record.weddingId,
        intendedEmailNormalized: input.intendedEmail,
        consumedAt: null,
        revokedAt: null,
      },
      {
        $set: { revokedAt: now, revocationReason: "REISSUED" },
        $unset: { encryptedCode: "", encryptedDeliveryCode: "" },
      },
      { session },
    );
    await db.collection("membershipInvites").insertOne(record, { session });
    if (input.deliveryMethod === "EMAIL") {
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const usage = await db.collection("rateLimitWindows").findOneAndUpdate(
        {
          keyHash: digest("organizer-invitation-email:platform"),
          windowStart: day,
        },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(+day + 86400000) },
        },
        { upsert: true, returnDocument: "after", session },
      );
      const limit = Number(process.env.INVITATION_EMAIL_DAILY_LIMIT || 100);
      if (!usage || !Number.isFinite(limit) || limit < 1 || usage.count > limit)
        throw new TeamError(
          429,
          "EMAIL_QUOTA_EXCEEDED",
          "The daily invitation email allowance has been reached. Please try again tomorrow.",
          Math.max(1, Math.ceil((+day + 86400000 - Date.now()) / 1000)),
        );
      await db.collection("emailOutbox").insertOne(
        {
          _id: record._id,
          weddingId: record.weddingId,
          membershipInviteId: record._id,
          recipientEmail: input.intendedEmail,
          kind: "ADMIN_INVITE",
          dedupeKey: `membership-invitation/${record._id.toHexString()}`,
          status: "PROCESSING",
          attemptCount: 1,
          sendAfter: now,
          createdAt: now,
        },
        { session },
      );
    }
    await db.collection("auditEvents").insertOne(
      {
        weddingId: record.weddingId,
        actorType: "USER",
        actorRef: record.invitedByUserId,
        action: "MEMBERSHIP_INVITATION_CREATED",
        entityType: "MEMBERSHIP_INVITE",
        entityId: record._id,
        occurredAt: now,
        requestId: randomUUID(),
      },
      { session },
    );
  });
  if (input.deliveryMethod === "MANUAL")
    return { invitation: invitationDto(record) };
  const current = await db.collection("membershipInvites").findOne({
    _id: record._id,
    revokedAt: null,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });
  const wedding = await db
    .collection("weddings")
    .findOne({ _id: record.weddingId });
  const sent = current
    ? await sendInvitationEmail({
        invitationId: record._id.toHexString(),
        to: input.intendedEmail,
        code,
        weddingTitle: wedding?.title ?? "your family wedding",
        role: input.role,
        expiresAt: record.expiresAt.toISOString(),
        subject: input.subject,
        message: input.message,
        appOrigin: process.env.APP_ORIGIN || "http://127.0.0.1:3000",
      })
    : { status: "FAILED" as const };
  await db.collection("membershipInvites").updateOne(
    { _id: record._id },
    {
      $set: { emailStatus: sent.status },
    },
  );
  // Keep this terminal update last: wedding deletion waits on PROCESSING rows
  // until provider work and every preceding tenant write have finished.
  await db.collection("emailOutbox").updateOne(
    { _id: record._id },
    {
      $set: {
        status: sent.status === "ACCEPTED" ? "SENT" : "FAILED",
        ...(sent.status === "UNKNOWN"
          ? { lastErrorCode: "DELIVERY_UNKNOWN" }
          : {}),
        updatedAt: new Date(),
        ...("providerId" in sent && sent.providerId
          ? { providerMessageId: sent.providerId }
          : {}),
      },
    },
  );
  return { invitation: invitationDto({ ...record, emailStatus: sent.status }) };
}

/** Persisted limits precede code validation and never store the supplied secret. */
export async function redemptionLimit(
  userId: string,
  source: string,
  email: string,
) {
  const db = await database();
  const duration = 15 * 60 * 1000;
  const now = Date.now();
  const start = new Date(Math.floor(now / duration) * duration);
  for (const [key, cap] of [
    [`account:${userId}`, 10],
    [`source:${source}`, 30],
    [`email:${email}`, 20],
  ] as const) {
    const filter = {
      keyHash: digest(`invitation-redeem:${key}`),
      windowStart: start,
    };
    let row;
    try {
      row = await db.collection("rateLimitWindows").findOneAndUpdate(
        filter,
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(+start + duration) },
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
    if (!row || row.count > cap)
      throw new TeamError(
        429,
        "RATE_LIMITED",
        "Too many attempts. Please try again later.",
        Math.max(1, Math.ceil((+start + duration - now) / 1000)),
      );
  }
}

export async function redeemInvitation(
  userId: string,
  email: string,
  code: string,
  currentToken: string,
) {
  const db = await database();
  const sessionToken = secret();
  const verifier = invitationVerifier(email, code);
  const candidate = await db.collection("membershipInvites").findOne({
    codeVerifier: verifier,
    intendedEmailNormalized: email,
    consumedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    failedAttempts: { $not: { $gte: 20 } },
  });
  const invalid = () =>
    new TeamError(
      422,
      "INVITATION_INVALID",
      "This code is invalid, expired or unavailable for this account. Check the recipient email or ask an administrator for a new invitation.",
    );
  if (!candidate) {
    await db.collection("membershipInvites").updateMany(
      {
        intendedEmailNormalized: email,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $inc: { failedAttempts: 1 } },
    );
    throw invalid();
  }
  try {
    return await mongoose.connection.transaction(async (session) => {
      // Consume the exact authenticated session inside the rotation transaction.
      // Password changes/logout write this row too: a paused, revoked request
      // must not consume the invitation or mint a replacement session.
      const activeSession = await db
        .collection("authSessions")
        .findOneAndUpdate(
          {
            userId: objectId(userId),
            tokenHash: digest(currentToken),
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
          { $set: { revokedAt: new Date() } },
          { session, returnDocument: "after" },
        );
      if (!activeSession)
        throw new TeamError(
          401,
          "AUTH_REQUIRED",
          "Your session changed. Please sign in again before joining.",
        );
      const user = await db
        .collection("users")
        .findOneAndUpdate(
          { _id: objectId(userId), emailNormalized: email, status: "ACTIVE" },
          { $inc: { membershipVersion: 1 } },
          { session },
        );
      if (!user) throw invalid();
      const wedding = await db
        .collection("weddings")
        .findOneAndUpdate(
          { _id: candidate.weddingId, status: "ACTIVE" },
          { $inc: { membershipVersion: 1 } },
          { session },
        );
      if (!wedding) throw invalid();
      const memberships = db.collection("weddingMemberships");
      if (
        await memberships.findOne(
          {
            userId: objectId(userId),
            weddingId: candidate.weddingId,
            status: "ACTIVE",
          },
          { session },
        )
      )
        throw new TeamError(
          409,
          "ALREADY_A_MEMBER",
          "You already belong to this wedding. Open it from Your weddings.",
          undefined,
          candidate.weddingId.toHexString(),
        );
      const invite = await db.collection("membershipInvites").findOneAndUpdate(
        {
          _id: candidate._id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
          failedAttempts: { $not: { $gte: 20 } },
        },
        {
          $set: {
            consumedAt: new Date(),
            consumedByUserId: objectId(userId),
          },
          $unset: { encryptedCode: "", encryptedDeliveryCode: "" },
        },
        { session },
      );
      if (!invite) throw invalid();
      await memberships.updateOne(
        { weddingId: candidate.weddingId, userId: objectId(userId) },
        {
          $set: {
            role: invite.role,
            status: "ACTIVE",
            joinedAt: new Date(),
            removedAt: null,
            invitedByUserId: invite.invitedByUserId,
          },
          $inc: { revision: 1 },
        },
        { upsert: true, session },
      );
      const adminCount = await memberships.countDocuments(
        { weddingId: candidate.weddingId, status: "ACTIVE", role: "ADMIN" },
        { session },
      );
      await db
        .collection("weddings")
        .updateOne(
          { _id: candidate.weddingId },
          { $set: { adminCount } },
          { session },
        );
      await audit(
        db,
        session,
        candidate.weddingId,
        userId,
        "MEMBERSHIP_INVITATION_ACCEPTED",
        "MEMBERSHIP_INVITE",
        candidate._id,
      );
      const now = new Date();
      await db.collection("authSessions").insertOne(
        {
          userId: objectId(userId),
          tokenHash: digest(sessionToken),
          expiresAt: new Date(+now + lifetime * 1000),
          revokedAt: null,
          createdAt: now,
          lastSeenAt: now,
        },
        { session },
      );
      return {
        membership: {
          weddingId: candidate.weddingId.toHexString(),
          role: invite.role,
        },
        sessionToken,
      };
    });
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    )
      throw new TeamError(
        409,
        "ALREADY_A_MEMBER",
        "You already belong to this wedding. Open it from Your weddings.",
        undefined,
        candidate.weddingId.toHexString(),
      );
    throw error;
  }
}

async function audit(
  db: mongoose.mongo.Db,
  session: mongoose.mongo.ClientSession,
  weddingId: mongoose.Types.ObjectId,
  actor: string,
  action: string,
  entityType: string,
  entityId: mongoose.Types.ObjectId,
) {
  await db.collection("auditEvents").insertOne(
    {
      weddingId,
      actorType: "USER",
      actorRef: objectId(actor),
      action,
      entityType,
      entityId,
      occurredAt: new Date(),
      requestId: randomUUID(),
    },
    { session },
  );
}

export async function changeMember(
  weddingId: string,
  actor: string,
  memberId: string,
  revision: number,
  role?: "ADMIN" | "ORGANIZER",
) {
  if (!/^[a-f0-9]{24}$/.test(memberId))
    throw new TeamError(404, "RESOURCE_NOT_FOUND", "Member not found.");
  const db = await database();
  return mongoose.connection.transaction(async (session) => {
    await adminGuard(db, session, weddingId, actor);
    const members = db.collection("weddingMemberships");
    const target = await members.findOne(
      { _id: objectId(memberId), weddingId: objectId(weddingId) },
      { session },
    );
    if (!target)
      throw new TeamError(404, "RESOURCE_NOT_FOUND", "Member not found.");
    if (target.status !== "ACTIVE") {
      if (!role) return;
      throw new TeamError(
        409,
        "MEMBER_REMOVED",
        "This person no longer has access. Refresh your team.",
      );
    }
    if ((target.revision ?? 1) !== revision)
      throw new TeamError(
        409,
        "STALE_REVISION",
        "This membership changed. Refresh your team before trying again.",
      );
    const adminCount = await members.countDocuments(
      { weddingId: target.weddingId, status: "ACTIVE", role: "ADMIN" },
      { session },
    );
    if (target.role === "ADMIN" && role !== "ADMIN" && adminCount <= 1)
      throw new TeamError(
        409,
        "LAST_ADMIN",
        "Keep at least one administrator. Promote another team member first.",
      );
    if (role === target.role) return;
    await members.updateOne(
      { _id: target._id },
      {
        $set: role
          ? { role, revision: revision + 1 }
          : {
              status: "REMOVED",
              removedAt: new Date(),
              revision: revision + 1,
            },
      },
      { session },
    );
    // Membership is rechecked per request; other weddings retain account access.
    await db.collection("weddings").updateOne(
      { _id: target.weddingId },
      {
        $set: {
          adminCount: await members.countDocuments(
            { weddingId: target.weddingId, status: "ACTIVE", role: "ADMIN" },
            { session },
          ),
        },
      },
      { session },
    );
    await audit(
      db,
      session,
      target.weddingId,
      actor,
      role ? "MEMBER_ROLE_CHANGED" : "MEMBER_ACCESS_REMOVED",
      "MEMBERSHIP",
      target._id,
    );
  });
}
export async function revokeInvitation(
  weddingId: string,
  userId: string,
  id: string,
) {
  if (!/^[a-f0-9]{24}$/.test(id))
    throw new TeamError(404, "RESOURCE_NOT_FOUND", "Invitation not found.");
  const db = await database();
  await mongoose.connection.transaction(async (session) => {
    await adminGuard(db, session, weddingId, userId);
    const filter = { _id: objectId(id), weddingId: objectId(weddingId) };
    const invitation = await db
      .collection("membershipInvites")
      .findOne(filter, { session });
    if (!invitation)
      throw new TeamError(404, "RESOURCE_NOT_FOUND", "Invitation not found.");
    if (invitation.revokedAt) return;
    if (invitation.consumedAt || invitation.expiresAt <= new Date())
      throw new TeamError(
        409,
        "INVITATION_NOT_PENDING",
        "This invitation is no longer pending. Refresh invitations.",
      );
    await db.collection("membershipInvites").updateOne(
      filter,
      {
        $set: { revokedAt: new Date(), revokedByUserId: objectId(userId) },
        $unset: { encryptedCode: "", encryptedDeliveryCode: "" },
      },
      { session },
    );
    await db.collection("auditEvents").insertOne(
      {
        weddingId: filter.weddingId,
        actorType: "USER",
        actorRef: objectId(userId),
        action: "MEMBERSHIP_INVITATION_REVOKED",
        entityType: "MEMBERSHIP_INVITE",
        entityId: filter._id,
        occurredAt: new Date(),
        requestId: randomUUID(),
      },
      { session },
    );
  });
}

export async function revealInvitation(
  weddingId: string,
  userId: string,
  id: string,
) {
  if (!/^[a-f0-9]{24}$/.test(id))
    throw new TeamError(404, "RESOURCE_NOT_FOUND", "Invitation not found.");
  const db = await database();
  const span = 15 * 60 * 1000;
  const now = Date.now();
  const start = new Date(Math.floor(now / span) * span);
  const filter = {
    keyHash: digest(`code-reveal:${weddingId}:${userId}`),
    windowStart: start,
  };
  let count;
  try {
    count = await db.collection("rateLimitWindows").findOneAndUpdate(
      filter,
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(+start + span) },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (
      !(error instanceof mongoose.mongo.MongoServerError) ||
      error.code !== 11000
    )
      throw error;
    count = await db
      .collection("rateLimitWindows")
      .findOneAndUpdate(
        filter,
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );
  }
  if (!count || count.count > 10)
    throw new TeamError(
      429,
      "RATE_LIMITED",
      "Too many code reveals. Try again later.",
      Math.max(1, Math.ceil((+start + span - now) / 1000)),
    );
  return mongoose.connection.transaction(async (session) => {
    await adminGuard(db, session, weddingId, userId);
    const item = await db
      .collection("membershipInvites")
      .findOne(
        { _id: objectId(id), weddingId: objectId(weddingId) },
        { session },
      );
    if (!item)
      throw new TeamError(404, "RESOURCE_NOT_FOUND", "Invitation not found.");
    if (
      item.revokedAt ||
      item.consumedAt ||
      item.expiresAt <= new Date() ||
      (item.failedAttempts ?? 0) >= 20
    )
      throw new TeamError(
        409,
        "INVITATION_NOT_PENDING",
        "This code is no longer available. Refresh invitations or create a replacement.",
      );
    if (!item.encryptedCode)
      throw new TeamError(
        409,
        "CODE_UNAVAILABLE",
        "This older code cannot be recovered. Send or generate a replacement to invalidate it and create a new code.",
      );
    const code = decryptInvitationCode(item.encryptedCode);
    await audit(
      db,
      session,
      item.weddingId,
      userId,
      "MEMBERSHIP_INVITATION_CODE_REVEALED",
      "MEMBERSHIP_INVITE",
      item._id,
    );
    return { code, expiresAt: item.expiresAt.toISOString() };
  });
}
