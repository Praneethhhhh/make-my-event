import { reply } from "@/modules/auth/auth-http";
import {
  accountFailure,
  accountInput,
  accountMember,
} from "@/modules/auth/account-http";
import { getAccount, updateName } from "@/modules/auth/account-service";
import { profileInput } from "@/modules/auth/profile-validation";
export async function GET(request: Request) {
  try {
    const auth = await accountMember(request);
    return auth instanceof Response
      ? auth
      : reply(200, { data: { user: await getAccount(auth.user.id) } });
  } catch (error) {
    return accountFailure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const auth = await accountMember(request, "profile");
    if (auth instanceof Response) return auth;
    const parsed = await accountInput(request, profileInput);
    if (parsed instanceof Response) return parsed;
    return reply(200, {
      data: {
        user: await updateName(
          auth.user.id,
          auth.token,
          parsed.displayName,
          parsed.revision,
        ),
      },
    });
  } catch (error) {
    return accountFailure(error);
  }
}
