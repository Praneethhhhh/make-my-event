import {
  cookieValue,
  sessionCookieName,
  validMutation,
  clientSource,
  failure,
  reply,
  cookie,
} from "@/modules/auth/auth-http";
import { currentUser, lifetime } from "@/modules/auth/registration-service";
import { input } from "@/modules/weddings/management-http";
import { redemptionInput } from "@/modules/team/team-validation";
import { redeemInvitation, redemptionLimit } from "@/modules/team/team-service";
import { teamFailure } from "@/modules/team/team-http";
export async function POST(request: Request) {
  try {
    if (!validMutation(request))
      return failure(403, "CSRF_INVALID", "Refresh the page and try again.");
    const user = await currentUser(cookieValue(request, sessionCookieName));
    if (!user)
      return failure(
        401,
        "AUTH_REQUIRED",
        "Please sign in with the invitation recipient’s email.",
      );
    await redemptionLimit(user.id, clientSource(request), user.email);
    const parsed = await input(request, redemptionInput);
    if (parsed instanceof Response) return parsed;
    if (parsed.email !== user.email)
      return failure(
        422,
        "INVITATION_INVALID",
        "Sign in with the email address that received this invitation.",
      );
    const result = await redeemInvitation(
      user.id,
      user.email,
      parsed.code,
      cookieValue(request, sessionCookieName),
    );
    return reply(
      200,
      { data: { membership: result.membership } },
      cookie(sessionCookieName, result.sessionToken, lifetime),
    );
  } catch (error) {
    return teamFailure(error);
  }
}
