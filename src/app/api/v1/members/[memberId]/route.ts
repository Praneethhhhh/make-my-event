import { reply } from "@/modules/auth/auth-http";
import { input } from "@/modules/weddings/management-http";
import { admin, teamFailure } from "@/modules/team/team-http";
import {
  memberChangeInput,
  memberRemoveInput,
} from "@/modules/team/team-validation";
import { changeMember, listMembers } from "@/modules/team/team-service";
type Context = { params: Promise<{ memberId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await admin(request, true);
    if (auth instanceof Response) return auth;
    const parsed = await input(request, memberChangeInput);
    if (parsed instanceof Response) return parsed;
    await changeMember(
      auth.weddingId,
      auth.userId,
      (await context.params).memberId,
      parsed.revision,
      parsed.role,
    );
    const memberId = (await context.params).memberId;
    return reply(200, {
      data: {
        member:
          (await listMembers(auth.weddingId, auth.userId)).find(
            (member) => member.id === memberId,
          ) ?? null,
      },
    });
  } catch (error) {
    return teamFailure(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const auth = await admin(request, true);
    if (auth instanceof Response) return auth;
    const parsed = await input(request, memberRemoveInput);
    if (parsed instanceof Response) return parsed;
    await changeMember(
      auth.weddingId,
      auth.userId,
      (await context.params).memberId,
      parsed.revision,
    );
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return teamFailure(error);
  }
}
