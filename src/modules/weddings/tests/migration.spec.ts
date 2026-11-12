import { test, expect } from "../../auth/tests/fixtures";
import { onboard } from "../../functions/tests/fixtures";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import mongoose from "mongoose";
const run = promisify(execFile);
test("migration backs up records, removes only the old unique-user index and preserves recoverable invitation data", async ({
  request,
  database,
}) => {
  await onboard(request);
  const members = database.collection("weddingMemberships");
  await members.createIndex(
    { userId: 1 },
    {
      unique: true,
      name: "one_active_wedding_per_user",
      partialFilterExpression: { status: "ACTIVE" },
    },
  );
  const wedding = await database.collection("weddings").findOne({});
  const ciphertext = {
    ciphertext: "legacy-ciphertext",
    nonce: "legacy-nonce",
    tag: "legacy-tag",
    keyVersion: 1,
  };
  const inserted = await database.collection("membershipInvites").insertOne({
    weddingId: wedding!._id,
    encryptedDeliveryCode: ciphertext,
    expiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
    consumedAt: null,
  });
  const { uri } = JSON.parse(await readFile(".next/auth-test-db.json", "utf8"));
  const result = await run(
    process.execPath,
    ["scripts/migrate-multi-wedding.mjs", "--apply"],
    { env: { ...process.env, MONGODB_URI: uri }, windowsHide: true },
  );
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)!);
  const backup = path.resolve(report.backup);
  try {
    const snapshot = mongoose.mongo.BSON.EJSON.parse(
      gunzipSync(await readFile(backup)).toString("utf8"),
    );
    expect(
      snapshot.collections
        .find((row: { name: string }) => row.name === "weddings")
        .documents[0]._id.equals(wedding!._id),
    ).toBe(true);
    expect(
      snapshot.collections
        .find((row: { name: string }) => row.name === "weddingMemberships")
        .indexes.some(
          (index: { name: string }) =>
            index.name === "one_active_wedding_per_user",
        ),
    ).toBe(true);
    expect(
      (await members.listIndexes().toArray()).some(
        (index) => index.name === "one_active_wedding_per_user",
      ),
    ).toBe(false);
    expect(await members.countDocuments()).toBe(1);
    expect(await database.collection("weddings").countDocuments()).toBe(1);
    const migrated = await database
      .collection("membershipInvites")
      .findOne({ _id: inserted.insertedId });
    expect(migrated!.encryptedCode).toEqual(ciphertext);
    expect(migrated!.encryptedDeliveryCode).toBeUndefined();
    expect(migrated!.deliveryMethod).toBe("EMAIL");
  } finally {
    if (
      !backup.startsWith(path.resolve(".local-backups") + path.sep) ||
      !backup.endsWith(".ejson.gz")
    )
      throw new Error("Unexpected backup path");
    await unlink(backup);
  }
});
