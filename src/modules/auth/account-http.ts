import type { z } from "zod";
import {
  cookieValue,
  failure,
  reply,
  sessionCookieName,
  validMutation,
} from "./auth-http";
import { currentUser } from "./registration-service";
import { AccountError, accountLimit } from "./account-service";
export async function accountMember(
  request: Request,
  operation?: "profile" | "password",
) {
  if (operation && !validMutation(request))
    return failure(403, "CSRF_INVALID", "Refresh the page and try again.");
  const token = cookieValue(request, sessionCookieName);
  const user = await currentUser(token);
  if (!user) return failure(401, "AUTH_REQUIRED", "Please sign in.");
  if (operation) {
    const retryAfter = await accountLimit(user.id, operation);
    if (retryAfter)
      return failure(
        429,
        "RATE_LIMITED",
        "Too many changes. Please try again later.",
        { "Retry-After": String(retryAfter) },
      );
  }
  return { user, token };
}
export async function accountInput<T>(request: Request, schema: z.ZodType<T>) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return failure(415, "VALIDATION_ERROR", "Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) return failure(400, "VALIDATION_ERROR", "Invalid request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let payload: unknown;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return failure(413, "VALIDATION_ERROR", "Request is too large.");
      }
      chunks.push(value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return failure(400, "VALIDATION_ERROR", "Invalid request.");
  }
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? parsed.data
    : reply(422, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Check the highlighted fields.",
          details: {
            fields: Object.fromEntries(
              parsed.error.issues.map((issue) => [
                String(issue.path[0] ?? "form"),
                issue.message,
              ]),
            ),
          },
        },
      });
}
export function accountFailure(error: unknown) {
  return error instanceof AccountError
    ? reply(error.status, {
        error: {
          code: error.code,
          message: error.message,
          ...(error.field
            ? { details: { fields: { [error.field]: error.message } } }
            : {}),
        },
      })
    : failure(
        503,
        "SERVICE_UNAVAILABLE",
        "Account changes are temporarily unavailable. Please try again.",
      );
}
