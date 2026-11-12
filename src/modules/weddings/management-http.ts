import {
  cookieValue,
  failure,
  reply,
  sessionCookieName,
} from "@/modules/auth/auth-http";
import { currentUser } from "@/modules/auth/registration-service";
import { membershipForUser } from "./wedding-service";
import type { z } from "zod";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { WeddingScheduleError } from "./schedule-error";
import { StaleWeddingScheduleError } from "./stale-schedule-error";

export async function manager(request: Request, mutate = false) {
  if (mutate) {
    const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
    const token = cookieValue(request, "mme_csrf");
    if (
      request.headers.get("origin") !== origin ||
      !/^[a-f0-9]{64}$/.test(token) ||
      request.headers.get("x-csrf-token") !== token
    )
      return failure(403, "CSRF_INVALID", "Refresh the page and try again.");
  }
  const user = await currentUser(cookieValue(request, sessionCookieName));
  if (!user) return failure(401, "AUTH_REQUIRED", "Please sign in.");
  const membership = await membershipForUser(user.id);
  if (!membership)
    return failure(404, "WEDDING_REQUIRED", "Create your wedding to continue.");
  if (mutate) {
    const windowMs = 15 * 60 * 1000;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const limits = mongoose.connection.db!.collection("rateLimitWindows");
    const filter = {
      keyHash: createHash("sha256")
        .update("management:" + user.id)
        .digest("hex"),
      windowStart,
    };
    let window;
    try {
      window = await limits.findOneAndUpdate(
        filter,
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(+windowStart + windowMs) },
        },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      if (
        !(error instanceof mongoose.mongo.MongoServerError) ||
        error.code !== 11000
      )
        throw error;
      window = await limits.findOneAndUpdate(
        filter,
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );
    }
    if (!window) throw new Error("Mutation limit unavailable");
    if (window.count > 120)
      return failure(
        429,
        "RATE_LIMITED",
        "Too many changes. Please try again shortly.",
        {
          "Retry-After": String(
            Math.max(1, Math.ceil((+windowStart + windowMs - now) / 1000)),
          ),
        },
      );
  }
  return { ...membership, userId: user.id };
}

export async function input<T>(request: Request, schema: z.ZodType<T>) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return failure(415, "VALIDATION_ERROR", "Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) return failure(400, "VALIDATION_ERROR", "Invalid request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return failure(413, "VALIDATION_ERROR", "Request is too large.");
      }
      chunks.push(value);
    }
    const parsed = schema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (parsed.success) return parsed.data;
    return reply(422, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the highlighted fields and try again.",
        details: {
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ]),
          ),
        },
      },
    });
  } catch {
    return failure(400, "VALIDATION_ERROR", "Invalid request.");
  }
}

export function unavailable(error?: unknown) {
  if (error instanceof StaleWeddingScheduleError)
    return reply(409, {
      error: {
        code: "STALE_WEDDING_SCHEDULE",
        message: error.message,
        details: { wedding: error.wedding },
      },
    });
  if (error instanceof WeddingScheduleError)
    return reply(422, {
      error: {
        code: "WEDDING_DATE_CONFLICT",
        message: error.message,
        details: { fields: error.fields },
      },
    });
  return failure(
    503,
    "SERVICE_UNAVAILABLE",
    "Could not save or load your changes. Please try again.",
  );
}
