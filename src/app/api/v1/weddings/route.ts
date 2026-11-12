import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  cookieValue,
  sessionCookieName,
  validMutation,
  failure,
  reply,
} from "@/modules/auth/auth-http";
import { currentUser } from "@/modules/auth/registration-service";
import {
  createWedding,
  listWeddings,
} from "@/modules/weddings/wedding-service";
import { weddingInput } from "@/modules/weddings/wedding-validation";
import { input, unavailable } from "@/modules/weddings/management-http";
function signature(value: string, token: string, search = "") {
  return createHmac("sha256", token)
    .update(`wedding-cursor:${value}:${search}`)
    .digest("hex");
}
export async function GET(request: Request) {
  try {
    const token = cookieValue(request, sessionCookieName);
    const user = await currentUser(token);
    if (!user) return failure(401, "AUTH_REQUIRED", "Please sign in.");
    const parsed = z
      .strictObject({
        search: z.string().trim().max(100).default(""),
        cursor: z.string().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success)
      return failure(
        422,
        "VALIDATION_ERROR",
        "Invalid wedding search or page.",
      );
    let after = "";
    if (parsed.data.cursor) {
      const [id, mac] = parsed.data.cursor.split(".");
      if (
        !id ||
        !mac ||
        !/^[a-f0-9]{24}$/.test(id) ||
        !/^[a-f0-9]{64}$/.test(mac) ||
        !timingSafeEqual(
          Buffer.from(mac, "hex"),
          Buffer.from(signature(id, token, parsed.data.search), "hex"),
        )
      )
        return failure(
          400,
          "VALIDATION_ERROR",
          "This page expired. Refresh your weddings.",
        );
      after = id;
    }
    const result = await listWeddings(
      user.id,
      parsed.data.search,
      after,
      parsed.data.limit,
    );
    const next = result.page.nextCursor;
    return reply(200, {
      ...result,
      page: {
        ...result.page,
        nextCursor: next
          ? `${next}.${signature(next, token, parsed.data.search)}`
          : null,
      },
    });
  } catch (error) {
    return unavailable(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!validMutation(request))
      return failure(403, "CSRF_INVALID", "Refresh the page and try again.");
    const user = await currentUser(cookieValue(request, sessionCookieName));
    if (!user) return failure(401, "AUTH_REQUIRED", "Please sign in.");
    const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
    if (!key.success)
      return failure(
        422,
        "VALIDATION_ERROR",
        "Refresh the wedding form and try again.",
      );
    const parsed = await input(request, weddingInput);
    if (parsed instanceof Response) return parsed;
    const result = await createWedding(user.id, parsed, key.data);
    if (result.status === "limited")
      return failure(
        429,
        "RATE_LIMITED",
        "Too many wedding creation attempts. Please try again later.",
        { "Retry-After": String(result.retryAfter) },
      );
    if (result.status === "idempotency-conflict")
      return failure(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This creation attempt changed or is no longer available. Start a new wedding form.",
      );
    return reply(201, { data: { wedding: result.wedding } });
  } catch (error) {
    return unavailable(error);
  }
}
