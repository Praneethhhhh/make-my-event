import { reply } from "@/modules/auth/auth-http";
import { admin, teamFailure } from "@/modules/team/team-http";
import { revealInvitation } from "@/modules/team/team-service";
export async function POST(
  request: Request,
  context: { params: Promise<{ inviteId: string }> },
) {
  try {
    const auth = await admin(request, true);
    if (auth instanceof Response) return auth;
    return reply(
      200,
      {
        data: await revealInvitation(
          auth.weddingId,
          auth.userId,
          (await context.params).inviteId,
        ),
      },
      undefined,
      { "Referrer-Policy": "no-referrer" },
    );
  } catch (error) {
    return teamFailure(error);
  }
}
