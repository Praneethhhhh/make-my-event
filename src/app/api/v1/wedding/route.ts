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
