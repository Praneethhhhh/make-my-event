import { z } from "zod";
import { failure, reply } from "@/modules/auth/auth-http";
import {
  input,
  manager,
  unavailable,
} from "@/modules/weddings/management-http";
import { functionMutationInput } from "@/modules/functions/function-validation";
import { saveFunction } from "@/modules/functions/function-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ functionId: string }> },
) {
  try {
    const auth = await manager(request, true);
    if (auth instanceof Response) return auth;
    const parsed = await input(
      request,
      functionMutationInput.safeExtend({ revision: z.number().int().min(1) }),
    );
    if (parsed instanceof Response) return parsed;
    const { revision, weddingRevision, ...fields } = parsed;
    const result = await saveFunction(
      auth.weddingId,
      auth.userId,
      fields,
      weddingRevision,
      (await context.params).functionId,
      revision,
    );
    if (result.status === "missing")
      return failure(404, "RESOURCE_NOT_FOUND", "Function not found.");
    if (result.status === "stale")
      return failure(
        409,
        "STALE_REVISION",
        "This function changed. Reload the page before saving again.",
      );
    return reply(200, { data: { function: result.function } });
  } catch (error) {
    return unavailable(error);
  }
}
