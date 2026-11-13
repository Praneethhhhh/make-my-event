import { cookie, sessionCookieName, reply } from "@/modules/auth/auth-http";
import { lifetime } from "@/modules/auth/registration-service";
import {
  accountFailure,
  accountInput,
  accountMember,
} from "@/modules/auth/account-http";
import { changePassword } from "@/modules/auth/account-service";
import { passwordChangeInput } from "@/modules/auth/profile-validation";
export async function POST(request: Request) {
  try {
    const auth = await accountMember(request, "password");
    if (auth instanceof Response) return auth;
    const parsed = await accountInput(request, passwordChangeInput);
    if (parsed instanceof Response) return parsed;
    const result = await changePassword(auth.user.id, auth.token, parsed);
    return reply(
      200,
      { data: { user: result.user } },
      cookie(sessionCookieName, result.token, lifetime),
    );
  } catch (error) {
    return accountFailure(error);
  }
}
