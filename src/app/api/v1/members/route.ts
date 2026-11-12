import { reply } from "@/modules/auth/auth-http";
import { manager } from "@/modules/weddings/management-http";
import { listMembers } from "@/modules/team/team-service";
import { teamFailure } from "@/modules/team/team-http";
export async function GET(request: Request) {
  try {
    const auth = await manager(request);
    if (auth instanceof Response) return auth;
    return reply(200, {
      data: { members: await listMembers(auth.weddingId, auth.userId) },
    });
  } catch (error) {
    return teamFailure(error);
  }
}
