// Optional operational migration. Runtime adapters work without running it.
// Dry run: node --env-file=.env.local scripts/migrate-finance-v2.mjs --wedding=<id>
// Apply additionally requires --apply --revision=<n> --confirm-title=<exact title>
// and --backup-dir=<new directory>. Never run apply without reviewing dry-run output.
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { ObjectId, BSON, MongoClient } = mongoose.mongo;
const collections = [
  "expenses",
  "vendorCharges",
  "vendorPayments",
  "expensePayments",
];
const targetId = (source, id) =>
  new ObjectId(
    createHash("sha256")
      .update(`finance-v2:${source}:${id}`)
      .digest("hex")
      .slice(0, 24),
  );
export async function snapshot(db, weddingId, session) {
  const result = {};
  for (const name of collections)
    result[name] = await db
      .collection(name)
      .find({ weddingId }, { session })
      .toArray();
  return result;
}
export function totals(rows) {
  const live = (row) => !row.migratedTo;
  const costs = [
    ...rows.expenses
      .filter(live)
      .filter((row) => row.modelVersion === 2 && row.status === "ACTIVE"),
    ...rows.vendorCharges.filter(live).filter((row) => row.status === "ACTIVE"),
  ];
  const actualPaid =
    rows.expenses
      .filter(live)
      .filter((row) => row.modelVersion !== 2 && row.status === "POSTED")
      .reduce((sum, row) => sum + row.amountPaise, 0) +
    [...rows.vendorPayments.filter(live), ...rows.expensePayments]
      .filter((row) => row.status === "POSTED")
      .reduce((sum, row) => sum + row.amountPaise, 0);
  const outstanding = costs.reduce((sum, cost) => {
    const source = cost.modelVersion === 2 ? "expenses" : "vendorCharges";
    const paid =
      rows.expensePayments
        .filter(
          (row) =>
            row.status === "POSTED" &&
            row.expenseSource === source &&
            String(row.expenseId) === String(cost._id),
        )
        .reduce((n, row) => n + row.amountPaise, 0) +
      (source === "vendorCharges"
        ? rows.vendorPayments
            .filter(live)
            .filter(
              (row) =>
                row.status === "POSTED" &&
                String(row.chargeId) === String(cost._id),
            )
            .reduce((n, row) => n + row.amountPaise, 0)
        : 0);
    return sum + cost.amountPaise - paid;
  }, 0);
  if (!Number.isSafeInteger(actualPaid) || !Number.isSafeInteger(outstanding))
    throw new Error("Totals exceed safe integer precision.");
  return { actualPaid, outstanding };
}
export async function migrate(
  db,
  weddingId,
  { apply = false, revision, title, backupDir } = {},
) {
  const wedding = await db
    .collection("weddings")
    .findOne({ _id: weddingId, status: "ACTIVE" });
  if (!wedding) throw new Error("Wedding not found.");
  const original = await snapshot(db, weddingId);
  const before = totals(original);
  const report = {
    weddingId: String(weddingId),
    revision: wedding.revision,
    counts: Object.fromEntries(
      collections.map((name) => [name, original[name].length]),
    ),
    before,
    apply: false,
  };
  if (!apply) return report;
  if (revision !== wedding.revision || title !== wedding.title || !backupDir)
    throw new Error(
      "Apply needs the exact current title/revision and a new backup directory.",
    );
  const directory = resolve(backupDir);
  await mkdir(directory, { recursive: false });
  // Concatenated BSON documents retain ObjectIds/dates and include original rows.
  for (const name of collections)
    await writeFile(
      resolve(directory, `${name}.bson`),
      Buffer.concat(original[name].map((row) => BSON.serialize(row))),
      { flag: "wx" },
    );
  await writeFile(
    resolve(directory, "manifest.json"),
    JSON.stringify(
      { ...report, coordinationVersion: wedding.coordinationVersion ?? null },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const locked = await db.collection("weddings").findOneAndUpdate(
        {
          _id: weddingId,
          status: "ACTIVE",
          revision,
          title,
          coordinationVersion: wedding.coordinationVersion ?? {
            $exists: false,
          },
        },
        { $inc: { coordinationVersion: 1 } },
        { session, returnDocument: "after" },
      );
      if (!locked)
        throw new Error(
          "Wedding changed after backup. Review a fresh dry run and backup.",
        );
      const current = await snapshot(db, weddingId, session);
      if (JSON.stringify(totals(current)) !== JSON.stringify(before))
        throw new Error("Finance changed after backup.");
      const expenseTargets = new Map();
      async function insert(collection, row) {
        if (
          await db.collection(collection).findOne({ _id: row._id }, { session })
        )
          throw new Error(
            "Migration target already exists; refusing to overwrite it.",
          );
        await db.collection(collection).insertOne(row, { session });
      }
      for (const source of ["expenses", "vendorCharges"])
        for (const row of current[source]) {
          if (source === "expenses" && row.modelVersion === 2) continue;
          const target = row.migratedTo ?? targetId(source, row._id);
          expenseTargets.set(`${source}:${row._id}`, target);
          if (row.migratedTo) continue;
          const { migratedTo: _, ...fields } = row;
          void _;
          await insert("expenses", {
            ...fields,
            _id: target,
            modelVersion: 2,
            status: row.status === "VOID" ? "VOID" : "ACTIVE",
            legacySource: { collection: source, id: row._id },
            updatedAt: new Date(),
          });
          if (source === "expenses")
            await insert("expensePayments", {
              ...fields,
              _id: targetId("legacyExpensesPayment", row._id),
              expenseId: target,
              expenseSource: "expenses",
              status: row.status === "VOID" ? "VOID" : "POSTED",
              paymentMethod: "OTHER",
              legacySource: { collection: source, id: row._id },
              updatedAt: new Date(),
            });
          await db
            .collection(source)
            .updateOne(
              { _id: row._id, weddingId },
              { $set: { migratedTo: target } },
              { session },
            );
        }
      // New payments made against old charges are retargeted under the same lock.
      for (const row of current.expensePayments)
        if (row.expenseSource === "vendorCharges") {
          const target = expenseTargets.get(`vendorCharges:${row.expenseId}`);
          if (!target) throw new Error("Payment references a missing charge.");
          await db.collection("expensePayments").updateOne(
            { _id: row._id, weddingId },
            {
              $set: {
                expenseId: target,
                expenseSource: "expenses",
                legacyExpenseSource: {
                  collection: "vendorCharges",
                  id: row.expenseId,
                },
              },
            },
            { session },
          );
        }
      for (const row of current.vendorPayments) {
        if (row.migratedTo) continue;
        const target = expenseTargets.get(`vendorCharges:${row.chargeId}`);
        if (!target) throw new Error("Payment references a missing charge.");
        const paymentId = targetId("vendorPayments", row._id);
        await insert("expensePayments", {
          ...row,
          _id: paymentId,
          expenseId: target,
          expenseSource: "expenses",
          legacySource: { collection: "vendorPayments", id: row._id },
          updatedAt: new Date(),
        });
        await db
          .collection("vendorPayments")
          .updateOne(
            { _id: row._id, weddingId },
            { $set: { migratedTo: paymentId } },
            { session },
          );
      }
      const after = totals(await snapshot(db, weddingId, session));
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("Reconciliation mismatch; transaction rolled back.");
      report.after = after;
    });
    await writeFile(
      resolve(directory, "completed.json"),
      JSON.stringify({ ...report, apply: true }, null, 2),
      { flag: "wx" },
    );
    return { ...report, apply: true };
  } finally {
    await session.endSession();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const flags = new Map(
    process.argv.slice(2).map((arg) => {
      const index = arg.indexOf("=");
      return index < 0
        ? [arg, true]
        : [arg.slice(0, index), arg.slice(index + 1)];
    }),
  );
  const wedding = flags.get("--wedding");
  if (
    typeof wedding !== "string" ||
    !/^[a-f0-9]{24}$/.test(wedding) ||
    !process.env.MONGODB_URI
  )
    throw new Error(
      "Set MONGODB_URI and provide --wedding=<id>. Credentials are never printed.",
    );
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    console.log(
      JSON.stringify(
        await migrate(client.db(), new ObjectId(wedding), {
          apply: flags.has("--apply"),
          revision: Number(flags.get("--revision")),
          title: flags.get("--confirm-title"),
          backupDir: flags.get("--backup-dir"),
        }),
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
