import { failure, reply } from "@/modules/auth/auth-http";
import { manager, unavailable } from "@/modules/weddings/management-http";
import { TeamError } from "./team-service";
export async function admin(request: Request, mutate = false) {
  const auth = await manager(request, mutate);
  if (auth instanceof Response) return auth;
  return auth.role === "ADMIN"
    ? auth
    : failure(
        403,
        "PERMISSION_DENIED",
        "Only administrators can manage invitations.",
      );
}
export function teamFailure(error: unknown) {
  if (error instanceof TeamError && error.weddingId)
    return reply(error.status, {
      error: {
        code: error.code,
        message: error.message,
        details: { weddingId: error.weddingId },
      },
    });
  return error instanceof TeamError
    ? failure(
        error.status,
        error.code,
        error.message,
        error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : undefined,
      )
    : unavailable();
}
