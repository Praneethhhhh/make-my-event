import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { test, expect, origin } from "../../auth/tests/fixtures";
import { onboard, write } from "../../functions/tests/fixtures";

test("retired vendor routes and link actions stay unavailable even with legacy credentials", async ({
  page,
  browser,
  database,
}) => {
  const wedding = await onboard(page.request);
  const vendor = (
    await (
      await write(page.request, "vendors", {
        name: "Internal florist",
        category: "Flowers",
        phones: ["9876543210"],
        color: "forest",
        internalNotes: "Managers only",
        status: "ACTIVE",
      })
    ).json()
  ).data;
  const token = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  const link = await database.collection("accessLinks").insertOne({
    weddingId: new mongoose.Types.ObjectId(wedding.id),
    vendorId: new mongoose.Types.ObjectId(vendor.id),
    subjectType: "VENDOR",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 86400000),
  });
  await database.collection("portalSessions").insertOne({
    weddingId: new mongoose.Types.ObjectId(wedding.id),
    vendorId: new mongoose.Types.ObjectId(vendor.id),
    linkId: link.insertedId,
    subjectType: "VENDOR",
    sessionTokenHash: createHash("sha256").update(session).digest("hex"),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  });
  const oldDevice = await browser.newContext({ baseURL: origin });
  try {
    const headers = {
      Cookie: `__Host-mme_vendor=${session}; mme_vendor=${session}`,
    };
    expect(
      (
        await oldDevice.request.get("/api/v1/tasks", {
          headers: { ...headers, "X-Wedding-Id": wedding.id },
        })
      ).status(),
    ).toBe(401);
    for (const path of [
      "/vendor",
      "/vendor/legacy",
      "/api/v1/vendor",
      "/api/v1/vendor/me",
      "/api/v1/vendor/tasks",
    ]) {
      expect((await oldDevice.request.get(path, { headers })).status()).toBe(
        404,
      );
    }
    expect(
      (
        await oldDevice.request.post("/api/v1/vendor/session", {
          headers,
          data: { token },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await oldDevice.request.post(
          "/api/v1/vendor/tasks/000000000000000000000001/complete",
          { headers, data: {} },
        )
      ).status(),
    ).toBe(404);
    for (const method of ["POST", "DELETE", "GET"]) {
      expect(
        (
          await write(page.request, `vendors/${vendor.id}/links`, {}, method)
        ).status(),
      ).toBe(404);
    }
    expect(
      (
        await write(page.request, `vendors/${vendor.id}/links/rotate`, {})
      ).status(),
    ).toBe(404);
    expect(
      (
        await write(page.request, `vendors/${vendor.id}/access/rotate`, {})
      ).status(),
    ).toBe(404);
    // Removal is additive to stored history: internal vendor and finance records survive.
    expect(
      await database
        .collection("vendors")
        .countDocuments({ name: "Internal florist" }),
    ).toBe(1);
  } finally {
    await oldDevice.close();
  }
});
