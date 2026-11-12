import {
  cookieValue,
  failure,
  reply,
  sessionCookieName,
} from "@/modules/auth/auth-http";
import { currentUser } from "@/modules/auth/registration-service";
import { createWedding } from "@/modules/weddings/wedding-service";
import { weddingInput } from "@/modules/weddings/wedding-validation";

export async function POST(request: Request) {
  const localPort = new URL(request.url).port;
  const allowedOrigins = process.env.APP_ORIGIN
    ? [process.env.APP_ORIGIN]
    : process.env.NODE_ENV === "development"
      ? ["localhost", "127.0.0.1"].map(
          (host) => "http://" + host + (localPort ? ":" + localPort : ""),
        )
      : [new URL(request.url).origin];
  const csrf = cookieValue(request, "mme_csrf");
  if (
    !allowedOrigins.includes(request.headers.get("origin") ?? "") ||
    !/^[a-f0-9]{64}$/.test(csrf) ||
    request.headers.get("x-csrf-token") !== csrf
  )
    return failure(403, "CSRF_INVALID", "Refresh the page and try again.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return failure(415, "VALIDATION_ERROR", "Expected JSON.");

  let user;
  try {
    user = await currentUser(cookieValue(request, sessionCookieName));
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Wedding setup is temporarily unavailable. Please try again.",
    );
  }
  if (!user) return failure(401, "AUTH_REQUIRED", "Please sign in.");

  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) throw new Error();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return failure(413, "VALIDATION_ERROR", "Request is too large.");
      }
      chunks.push(value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return failure(400, "VALIDATION_ERROR", "Invalid request.");
  }
  const parsed = weddingInput.safeParse(payload);
  if (!parsed.success)
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
  try {
    const result = await createWedding(user.id, parsed.data);
    if (result.status === "membership-limit")
      return failure(
        409,
        "MEMBERSHIP_LIMIT",
        "Your account already belongs to a wedding.",
      );
    return reply(201, { data: { wedding: result.wedding } });
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Wedding setup is temporarily unavailable. Please try again.",
    );
  }
}
