import {
  cookie,
  cookieValue,
  failure,
  reply,
  clientSource,
  sessionCookieName,
} from "@/modules/auth/auth-http";
import {
  registration,
  register,
  lifetime,
  registrationSourceLimit,
} from "@/modules/auth/registration-service";
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
      if (size > 8192) {
        await reader.cancel();
        return failure(413, "VALIDATION_ERROR", "Request is too large.");
      }
      chunks.push(value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return failure(400, "VALIDATION_ERROR", "Invalid request.");
  }
  let source: string;
  try {
    source = clientSource(request);
    const sourceLimit = await registrationSourceLimit(source);
    if (sourceLimit.status === "limited")
      return failure(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again later.",
        { "Retry-After": String(sourceLimit.retryAfter) },
      );
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Registration is temporarily unavailable. Please try again later.",
    );
  }
  const input = registration.safeParse(payload);
  if (!input.success)
    return reply(422, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the highlighted fields.",
        details: {
          fields: Object.fromEntries(
            input.error.issues.map((issue) => [
              String(issue.path[0]),
              issue.message,
            ]),
          ),
        },
      },
    });
  try {
    const result = await register(input.data);
    if (result.status === "limited")
      return failure(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again later.",
        { "Retry-After": String(result.retryAfter) },
      );
    if (result.status === "duplicate")
      return failure(409, "CONFLICT", "Unable to register with these details.");
    return reply(
      201,
      { data: { user: result.user } },
      cookie(sessionCookieName, result.token, lifetime),
    );
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Registration is temporarily unavailable. Please try again later.",
    );
  }
}
