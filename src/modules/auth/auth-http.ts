import { randomUUID } from "node:crypto";
export const sessionCookieName =
  process.env.NODE_ENV === "production" ? "__Host-mme_session" : "mme_session";
export function cookieValue(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
export function cookie(name: string, value: string, seconds: number) {
  return (
    name +
    "=" +
    value +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    seconds +
    (process.env.NODE_ENV === "production" ? "; Secure" : "")
  );
}
export function reply(
  status: number,
  payload: object,
  setCookie?: string,
  extraHeaders?: HeadersInit,
) {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store");
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return Response.json(
    { ...payload, meta: { requestId: randomUUID() } },
    { status, headers },
  );
}
export function failure(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return reply(status, { error: { code, message } }, undefined, headers);
}

export function clientSource(request: Request) {
  if (process.env.NODE_ENV === "development") return "local";
  const header =
    process.env.VERCEL === "1"
      ? "x-vercel-forwarded-for"
      : process.env.TRUSTED_CLIENT_IP_HEADER;
  if (!header) throw new Error("Configure the trusted proxy client IP header.");
  const source = request.headers.get(header)?.split(",")[0]?.trim();
  if (!source) throw new Error("Trusted client address unavailable.");
  return source;
}

export function validMutation(request: Request) {
  const url = new URL(request.url);
  const origins = process.env.APP_ORIGIN
    ? [process.env.APP_ORIGIN]
    : process.env.NODE_ENV === "development"
      ? ["localhost", "127.0.0.1"].map(
          (host) => `http://${host}${url.port ? `:${url.port}` : ""}`,
        )
      : [url.origin];
  const token = cookieValue(request, "mme_csrf");
  return (
    origins.includes(request.headers.get("origin") ?? "") &&
    /^[a-f0-9]{64}$/.test(token) &&
    request.headers.get("x-csrf-token") === token
  );
}
