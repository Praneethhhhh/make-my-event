import mongoose from "mongoose";
import { WeddingAccessError } from "./wedding-access";

// Canonical wedding-owned collections. Global identities and sessions are excluded.
export const weddingOwnedCollections = [
  "weddingMemberships",
  "membershipInvites",
  "functions",
  "tasks",
  "taskComments",
  "notifications",
  "guests",
  "functionInvitations",
  "vendors",
  "vendorAssignments",
  "vendorCharges",
  "vendorPayments",
  "expenses",
  "expensePayments",
  // Retain cleanup of legacy vendor capabilities; vendor routes are removed.
  // These collections also belong to the future guest invitation feature.
  "accessLinks",
  "portalSessions",
  "photos",
  "emailOutbox",
  "emailWebhookEvents",
  "serviceUsage",
  "idempotencyRecords",
  "auditEvents",
] as const;

export async function deleteWedding(
  weddingId: string,
  userId: string,
  revision: number,
  confirmationTitle: string,
) {
  const db = mongoose.connection.db!;
  const id = new mongoose.Types.ObjectId(weddingId);
  return mongoose.connection.transaction(async (session) => {
    const wedding = await db
      .collection("weddings")
      .findOneAndUpdate(
        { _id: id, status: "ACTIVE" },
        { $inc: { coordinationVersion: 1 } },
        { session, returnDocument: "after" },
      );
    if (!wedding)
      throw new WeddingAccessError("This wedding is no longer available.");
    const member = await db.collection("weddingMemberships").findOne(
      {
        weddingId: id,
        userId: new mongoose.Types.ObjectId(userId),
        status: "ACTIVE",
      },
      { session },
    );
    if (!member)
      throw new WeddingAccessError("This wedding is no longer available.");
    if (member.role !== "ADMIN") return "forbidden" as const;
    if (
      (wedding.revision ?? 1) !== revision ||
      wedding.title !== confirmationTitle
    )
      return "stale" as const;
    // EMAIL invitation creation reserves PROCESSING under this same wedding
    // write lock. Its final outbox update is the sender's last tenant write.
    // Do not erase that reservation while a provider call can still begin.
    if (
      await db
        .collection("emailOutbox")
        .findOne({ weddingId: id, status: "PROCESSING" }, { session })
    )
      return "delivery" as const;
    // Storage deletion must be implemented before photos can be removed safely.
    if (await db.collection("photos").findOne({ weddingId: id }, { session }))
      return "media" as const;
    // Keep only the opaque creation-key hash so an old retry cannot recreate a
    // wedding after deletion. Remove its account, tenant and payload references.
    await db.collection("idempotencyRecords").updateMany(
      { weddingId: id, operation: "CREATE_WEDDING" },
      {
        $unset: {
          weddingId: "",
          userId: "",
          requestHash: "",
          operation: "",
          createdAt: "",
        },
        $set: { deletedAt: new Date() },
      },
      { session },
    );
    for (const collection of weddingOwnedCollections) {
      await db
        .collection(collection)
        .deleteMany({ weddingId: id }, { session });
    }
    await db.collection("weddings").deleteOne({ _id: id }, { session });
    return "deleted" as const;
  });
}
