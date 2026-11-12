import {
  cookieValue,
  failure,
  reply,
  sessionCookieName,
} from "@/modules/auth/auth-http";
import { currentUser } from "@/modules/auth/registration-service";
import { membershipForUser } from "@/modules/weddings/wedding-service";
export async function GET(request: Request) {
  try {
    const user = await currentUser(cookieValue(request, sessionCookieName));
    if (!user) return failure(401, "AUTH_REQUIRED", "Please sign in.");
    return reply(200, {
      data: { user, membership: await membershipForUser(user.id) },
    });
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Account service is temporarily unavailable.",
    );
  }
}
