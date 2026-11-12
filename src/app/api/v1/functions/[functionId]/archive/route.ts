import { z } from "zod";
import { failure, reply } from "@/modules/auth/auth-http";
import {
  input,
  manager,
  unavailable,
} from "@/modules/weddings/management-http";
import { archiveFunction } from "@/modules/functions/function-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ functionId: string }> },
) {
  try {
    const auth = await manager(request, true);
    if (auth instanceof Response) return auth;
    const parsed = await input(
      request,
      z.strictObject({ revision: z.number().int().min(1) }),
    );
    if (parsed instanceof Response) return parsed;
    const result = await archiveFunction(
      auth.weddingId,
      auth.userId,
      (await context.params).functionId,
      parsed.revision,
    );
    if (result === "missing")
      return failure(404, "RESOURCE_NOT_FOUND", "Function not found.");
    if (result === "stale")
      return failure(
        409,
        "STALE_REVISION",
        "This function changed. Reload the page before removing it.",
      );
    return reply(200, { data: { status: "ARCHIVED" } });
  } catch (error) {
    return unavailable(error);
  }
}
