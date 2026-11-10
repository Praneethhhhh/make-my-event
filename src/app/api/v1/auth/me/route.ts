import {
  cookieValue,
  failure,
  reply,
  sessionCookieName,
} from "@/modules/auth/auth-http";
import { currentUser } from "@/modules/auth/registration-service";
export async function GET(request: Request) {
  try {
    const user = await currentUser(cookieValue(request, sessionCookieName));
    return user
      ? reply(200, { data: { user, membership: null } })
      : failure(401, "AUTH_REQUIRED", "Please sign in.");
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Account service is temporarily unavailable.",
    );
  }
}
