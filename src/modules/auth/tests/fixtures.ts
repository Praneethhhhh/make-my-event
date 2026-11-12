import { test as base, expect, type APIRequestContext } from "@playwright/test";
import mongoose from "mongoose";
import { readFile } from "node:fs/promises";

export const origin = "http://127.0.0.1:3100";
export const password = "violet canoe lantern meadow 72";
export const account = {
  displayName: "Test Family",
  email: "family@example.invalid",
  password,
};
export async function mutation(
  api: APIRequestContext,
  route: string,
  data: unknown,
  ip = "test-client",
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.post("/api/v1/auth/" + route, {
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "x-auth-test-ip": ip,
    },
    data,
  });
}
export const test = base.extend<{ database: mongoose.mongo.Db }>({
  database: async ({}, provide) => {
    const { uri } = JSON.parse(
      await readFile(".next/auth-test-db.json", "utf8"),
    );
    const connection = await mongoose.createConnection(uri).asPromise();
    const db = connection.db!;
    try {
      for (const name of [
        "users",
        "authSessions",
        "rateLimitWindows",
        "weddings",
        "weddingMemberships",
        "functions",
        "auditEvents",
      ])
        await db.collection(name).deleteMany({});
      await provide(db);
    } finally {
      for (const name of [
        "users",
        "authSessions",
        "rateLimitWindows",
        "weddings",
        "weddingMemberships",
        "functions",
        "auditEvents",
      ])
        await db.collection(name).deleteMany({});
      await connection.close();
    }
  },
});
export { expect };
