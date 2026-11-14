import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { write as managementWrite } from "../../functions/tests/fixtures";
/** Existing task cases explicitly use the current fixture actor as owner. */
export async function write(
  api: APIRequestContext,
  path: string,
  data: unknown,
  method = "POST",
) {
  if (
    /^tasks(?:\/[a-f0-9]{24})?$/.test(path) &&
    ["POST", "PATCH"].includes(method) &&
    data &&
    typeof data === "object" &&
    "title" in data
  ) {
    const body = data as Record<string, unknown>;
    const me = (await (await api.get("/api/v1/auth/me")).json()).data?.user;
    data = {
      ...body,
      assigneeUserId: body.assigneeUserId ?? me?.id,
      creationKey: body.creationKey ?? randomUUID(),
    };
  }
  return managementWrite(api, path, data, method);
}
