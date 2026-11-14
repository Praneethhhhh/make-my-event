import { test as base, expect, type APIRequestContext } from "@playwright/test";
import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// Legacy single-wedding regression cases explicitly select their fixture wedding.
// New multi-wedding cases send the intended header directly, including missing-header tests.
const selections = new WeakMap<APIRequestContext, string>();
const creationKeys = new WeakMap<APIRequestContext, string>();
export function selectWedding(api: APIRequestContext, id: string) {
  selections.set(api, id);
}
export function creationKey(api: APIRequestContext) {
  let key = creationKeys.get(api);
  if (!key) {
    key = randomUUID();
    creationKeys.set(api, key);
  }
  return key;
}
export async function scopeHeaders(api: APIRequestContext) {
  if (!selections.has(api)) {
    const response = await api.get("/api/v1/weddings");
    if (response.ok()) {
      const first = (await response.json()).data[0];
      if (first) selections.set(api, first.id);
    }
  }
  return { "X-Wedding-Id": selections.get(api) ?? "000000000000000000000000" };
}
export async function scopedGet(
  api: APIRequestContext,
  path: string,
  options?: Parameters<APIRequestContext["get"]>[1],
) {
  return api.get(path, {
    ...options,
    headers: { ...(await scopeHeaders(api)), ...options?.headers },
  });
}
export async function weddingRoute(api: APIRequestContext, suffix = "") {
  return `/weddings/${(await scopeHeaders(api))["X-Wedding-Id"]}${suffix ? "/" + suffix : ""}`;
}

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
        "membershipInvites",
        "emailOutbox",
        "idempotencyRecords",
        "tasks",
        "taskComments",
        "notifications",
        "vendors",
        "vendorAssignments",
        "vendorCharges",
        "vendorPayments",
        "expenses",
  "expensePayments",
        "accessLinks",
        "portalSessions",
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
        "membershipInvites",
        "emailOutbox",
        "idempotencyRecords",
        "tasks",
        "taskComments",
        "notifications",
        "vendors",
        "vendorAssignments",
        "vendorCharges",
        "vendorPayments",
        "expenses",
  "expensePayments",
        "accessLinks",
        "portalSessions",
      ])
        await db.collection(name).deleteMany({});
      await connection.close();
    }
  },
});
export { expect };
