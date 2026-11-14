import mongoose from "mongoose";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { test, expect, scopedGet } from "../../auth/tests/fixtures";
import { write } from "./fixtures";
import { onboard } from "../../functions/tests/fixtures";
import { pathToFileURL } from "node:url";
test("optional finance migration backs up, reconciles mixed records and preserves unrelated weddings", async ({
  page,
  database,
}) => {
  // Keep the operational ESM CLI outside Playwright's CommonJS transform.
  const load = new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<typeof import("../../../../scripts/migrate-finance-v2.mjs")>;
  const { migrate } = await load(
    pathToFileURL(resolve("scripts/migrate-finance-v2.mjs")).href,
  );
  const wedding = await onboard(page.request);
  const weddingId = new mongoose.Types.ObjectId(wedding.id);
  const foreign = new mongoose.Types.ObjectId();
  const expense = await database.collection("expenses").insertOne({
    weddingId,
    description: "Paid supplies",
    amountPaise: 12345,
    status: "POSTED",
    revision: 1,
    paidAt: new Date(),
  });
  const charge = await database.collection("vendorCharges").insertOne({
    weddingId,
    description: "Flowers",
    amountPaise: 100000,
    status: "ACTIVE",
    revision: 1,
  });
  const vendorPayment = await database.collection("vendorPayments").insertOne({
    weddingId,
    chargeId: charge.insertedId,
    amountPaise: 25000,
    status: "POSTED",
    revision: 1,
    paidAt: new Date(),
  });
  await database.collection("expensePayments").insertOne({
    weddingId,
    expenseId: charge.insertedId,
    expenseSource: "vendorCharges",
    amountPaise: 10000,
    status: "POSTED",
    revision: 1,
    paidAt: new Date(),
  });
  const foreignExpense = await database.collection("expenses").insertOne({
    weddingId: foreign,
    description: "Unrelated",
    amountPaise: 99999,
    status: "POSTED",
  });
  const preview = await migrate(database, weddingId);
  expect(preview.apply).toBe(false);
  expect(preview.before).toEqual({ actualPaid: 47345, outstanding: 65000 });
  expect(
    (await database
      .collection("expenses")
      .findOne({ _id: expense.insertedId }))!.migratedTo,
  ).toBeUndefined();
  const root = await mkdtemp(resolve(".next/finance-migration-"));
  try {
    await expect(
      migrate(database, weddingId, {
        apply: true,
        revision: 999,
        title: wedding.title,
        backupDir: join(root, "invalid"),
      }),
    ).rejects.toThrow(/exact current/);
    const result = await migrate(database, weddingId, {
      apply: true,
      revision: wedding.revision,
      title: wedding.title,
      backupDir: join(root, "backup"),
    });
    expect(result.after).toEqual(preview.before);
    expect(
      (
        await write(page.request, `expenses/${expense.insertedId}/void`, {
          revision: 1,
          reason: "Migrated source",
        })
      ).status(),
    ).toBe(404);
    expect(
      (await readFile(join(root, "backup/expenses.bson"))).length,
    ).toBeGreaterThan(0);
    expect(
      (await (await scopedGet(page.request, "/api/v1/finance/summary")).json())
        .data,
    ).toEqual(preview.before);
    expect(
      (await database
        .collection("expenses")
        .findOne({ _id: foreignExpense.insertedId }))!.migratedTo,
    ).toBeUndefined();
    expect(
      (await database
        .collection("vendorPayments")
        .findOne({ _id: vendorPayment.insertedId }))!.migratedTo,
    ).toBeTruthy();
    const again = await migrate(database, weddingId, {
      apply: true,
      revision: wedding.revision,
      title: wedding.title,
      backupDir: join(root, "second"),
    });
    expect(again.after).toEqual(preview.before);
    expect(
      await database
        .collection("expensePayments")
        .countDocuments({ weddingId }),
    ).toBe(3);
  } finally {
    if (!resolve(root).startsWith(resolve(".next/finance-migration-")))
      throw new Error("Unexpected temporary migration directory.");
    await rm(root, { recursive: true, force: true });
  }
});
