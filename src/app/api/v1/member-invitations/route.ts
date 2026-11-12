import { z } from "zod";
import { reply, failure } from "@/modules/auth/auth-http";
import { input } from "@/modules/weddings/management-http";
import { admin, teamFailure } from "@/modules/team/team-http";
import { createInvitation, listInvitations } from "@/modules/team/team-service";
import { invitationInput } from "@/modules/team/team-validation";
export async function GET(request: Request) {
  try {
    const auth = await admin(request);
    if (auth instanceof Response) return auth;
    return reply(200, {
      data: { invitations: await listInvitations(auth.weddingId) },
    });
  } catch (error) {
    return teamFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await admin(request, true);
    if (auth instanceof Response) return auth;
    const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
    if (!key.success)
      return failure(
        422,
        "VALIDATION_ERROR",
        "Refresh the invitation form and try again.",
      );
    const parsed = await input(request, invitationInput);
    if (parsed instanceof Response) return parsed;
    const result = await createInvitation(
      auth.weddingId,
      auth.userId,
      parsed,
      key.data,
    );
    return reply(201, { data: { invitation: result.invitation } }, undefined, {
      "Referrer-Policy": "no-referrer",
    });
  } catch (error) {
    return teamFailure(error);
  }
}
