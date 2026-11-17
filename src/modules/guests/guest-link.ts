// Keep fragments out of server request paths; production must use an explicit origin.
export function privateGuestUrl(token: string) {
  const origin =
    process.env.APP_ORIGIN ||
    (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : "");
  if (!origin) throw new Error("APP_ORIGIN is required for guest link sharing");
  return `${new URL("/invite", origin).toString()}#token=${token}`;
}
