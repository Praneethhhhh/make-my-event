import { admin, teamFailure } from "@/modules/team/team-http";
import { revokeInvitation } from "@/modules/team/team-service";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ inviteId: string }> },
) {
  try {
    const auth = await admin(request, true);
    if (auth instanceof Response) return auth;
    await revokeInvitation(
      auth.weddingId,
      auth.userId,
      (await context.params).inviteId,
    );
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return teamFailure(error);
  }
}
