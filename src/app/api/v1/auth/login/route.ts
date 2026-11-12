import {
  cookie,
  cookieValue,
  failure,
  reply,
  clientSource,
  sessionCookieName,
} from "@/modules/auth/auth-http";
import {
  loginInput,
  login,
  lifetime,
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
  let input;
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
    input = loginInput.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return failure(400, "VALIDATION_ERROR", "Invalid request.");
  }
  if (!input.success)
    return failure(
      422,
      "VALIDATION_ERROR",
      "Enter a valid email and password.",
    );
  try {
    const source = clientSource(request);
    const result = await login(
      input.data,
      source,
      cookieValue(request, sessionCookieName),
    );
    if (result.status === "limited")
      return failure(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again later.",
        { "Retry-After": String(result.retryAfter) },
      );
    if (result.status === "invalid")
      return failure(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    return reply(
      200,
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
