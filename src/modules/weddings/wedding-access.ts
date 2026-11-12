import mongoose from "mongoose";
export class WeddingAccessError extends Error {}
export async function verifyMembership(
  db: mongoose.mongo.Db,
  session: mongoose.mongo.ClientSession,
  weddingId: string,
  userId: string,
) {
  const member = await db.collection("weddingMemberships").findOne(
    {
      weddingId: new mongoose.Types.ObjectId(weddingId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "ACTIVE",
    },
    { session },
  );
  if (!member)
    throw new WeddingAccessError(
      "This wedding is no longer available to your account.",
    );
}
