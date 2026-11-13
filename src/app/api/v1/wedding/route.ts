import { failure, reply } from "@/modules/auth/auth-http";
import { currentWedding } from "@/modules/weddings/wedding-service";
import { updateWedding } from "@/modules/weddings/wedding-service";
import {
  input,
  manager,
  unavailable,
} from "@/modules/weddings/management-http";
import { weddingInput } from "@/modules/weddings/wedding-validation";
import { z } from "zod";
import { deleteWedding } from "@/modules/weddings/wedding-deletion";

export async function DELETE(request: Request) {
  try {
    const auth = await manager(request, true);
    if (auth instanceof Response) return auth;
    if (auth.role !== "ADMIN")
      return failure(
        403,
        "FORBIDDEN",
        "Only administrators can delete this wedding.",
      );
    const parsed = await input(
      request,
      z
        .object({
          revision: z.number().int().min(1),
          confirmationTitle: z.string().min(1).max(160),
        })
        .strict(),
    );
    if (parsed instanceof Response) return parsed;
    const result = await deleteWedding(
      auth.weddingId,
      auth.userId,
      parsed.revision,
      parsed.confirmationTitle,
    );
    if (result === "forbidden")
      return failure(
        403,
        "FORBIDDEN",
        "Only administrators can delete this wedding.",
      );
    if (result === "stale")
      return failure(
        409,
        "STALE_REVISION",
        "Wedding details changed or the title does not match. Reload and confirm again.",
      );
    if (result === "delivery")
      return failure(
        409,
        "INVITATION_DELIVERY_IN_PROGRESS",
        "An invitation email is still being processed. Wait a moment, then try deleting again.",
        { "Retry-After": "5" },
      );
    if (result === "media")
      return failure(
        409,
        "MEDIA_CLEANUP_REQUIRED",
        "This wedding contains uploaded media. Contact support before deleting it.",
      );
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return unavailable(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await manager(request, true);
    if (auth instanceof Response) return auth;
    const parsed = await input(
      request,
      weddingInput.safeExtend({ revision: z.number().int().min(1) }),
    );
    if (parsed instanceof Response) return parsed;
    const { revision, ...profile } = parsed;
    const wedding = await updateWedding(
      auth.weddingId,
      profile,
      revision,
      auth.userId,
    );
    return wedding
      ? reply(200, { data: { wedding } })
      : failure(
          409,
          "STALE_REVISION",
          "Wedding details changed. Reload the page before saving again.",
        );
  } catch (error) {
    return unavailable(error);
  }
}

export async function GET(request: Request) {
  try {
    const auth = await manager(request);
    if (auth instanceof Response) return auth;
    const result = await currentWedding(auth.userId, auth.weddingId);
    return result
      ? reply(200, { data: result })
      : failure(404, "WEDDING_REQUIRED", "Create your wedding to continue.");
  } catch {
    return failure(
      503,
      "SERVICE_UNAVAILABLE",
      "Wedding setup is temporarily unavailable.",
    );
  }
}
