import {
  cookie,
  cookieValue,
  failure,
  sessionCookieName,
} from "@/modules/auth/auth-http";
import { logout } from "@/modules/auth/registration-service";
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
  try {
    await logout(cookieValue(request, sessionCookieName));
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": cookie(sessionCookieName, "", 0),
      },
    });
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Could not sign out. Try again.",
    );
  }
}
