import mongoose from "mongoose";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const require = createRequire(import.meta.url);
createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(
  process.cwd(),
);
if (!process.env.MONGODB_URI) throw new Error("Database configuration missing");
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
try {
  const db = mongoose.connection.db;
  const names = (await db.listCollections().toArray())
    .map((row) => row.name)
    .filter((name) => !name.startsWith("system."));
  const snapshot = [];
  for (const name of names)
    snapshot.push({
      name,
      indexes: await db.collection(name).listIndexes().toArray(),
      documents: await db.collection(name).find({}).toArray(),
    });
  const duplicate = await db
    .collection("weddingMemberships")
    .aggregate([
      {
        $group: {
          _id: { weddingId: "$weddingId", userId: "$userId" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ])
    .toArray();
  if (duplicate.length)
    throw new Error(
      "Duplicate membership pairs require manual reconciliation; no migration performed",
    );
  console.log(
    JSON.stringify({
      collections: snapshot.map((row) => ({
        name: row.name,
        records: row.documents.length,
      })),
      apply: process.argv.includes("--apply"),
    }),
  );
  if (process.argv.includes("--apply")) {
    await mkdir(".local-backups", { recursive: true });
    const backup = `.local-backups/before-multi-wedding-${Date.now()}.ejson.gz`;
    await writeFile(
      backup,
      gzipSync(
        mongoose.mongo.BSON.EJSON.stringify(
          {
            database: db.databaseName,
            createdAt: new Date(),
            collections: snapshot,
          },
          { relaxed: false },
        ),
      ),
      { flag: "wx" },
    );
    const members = db.collection("weddingMemberships");
    await members.createIndex(
      { weddingId: 1, userId: 1 },
      { unique: true, name: "one_membership_per_wedding_user" },
    );
    await members.createIndex({ userId: 1, status: 1, weddingId: 1 });
    for (const index of await members.listIndexes().toArray()) {
      if (
        index.unique &&
        Object.keys(index.key).length === 1 &&
        index.key.userId === 1
      ) {
        if (
          index.name !== "one_active_wedding_per_user" ||
          index.partialFilterExpression?.status !== "ACTIVE"
        )
          throw new Error(
            "Unexpected single-user uniqueness index; review the backup/index inventory before changing it",
          );
        await members.dropIndex(index.name);
      }
    }
    const invites = db.collection("membershipInvites");
    let migrated = 0;
    for await (const row of invites.find({
      encryptedDeliveryCode: { $exists: true },
    })) {
      const active =
        !row.consumedAt && !row.revokedAt && row.expiresAt > new Date();
      await invites.updateOne(
        { _id: row._id },
        {
          ...(active && !row.encryptedCode
            ? { $set: { encryptedCode: row.encryptedDeliveryCode } }
            : {}),
          $unset: { encryptedDeliveryCode: "" },
        },
      );
      migrated++;
    }
    await invites.updateMany(
      { deliveryMethod: { $exists: false } },
      { $set: { deliveryMethod: "EMAIL" } },
    );
    console.log(
      JSON.stringify({
        backup,
        migratedInvitationCiphertexts: migrated,
        membershipIndexes: (await members.listIndexes().toArray()).map(
          (row) => ({ name: row.name, unique: !!row.unique }),
        ),
      }),
    );
  }
} finally {
  await mongoose.disconnect();
}
