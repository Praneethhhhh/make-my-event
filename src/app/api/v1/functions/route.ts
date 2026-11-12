import { reply, failure } from "@/modules/auth/auth-http";
import {
  input,
  manager,
  unavailable,
} from "@/modules/weddings/management-http";
import { functionMutationInput } from "@/modules/functions/function-validation";
import {
  listFunctions,
  saveFunction,
} from "@/modules/functions/function-service";

export async function GET(request: Request) {
  try {
    const auth = await manager(request);
    if (auth instanceof Response) return auth;
    return reply(200, {
      data: { functions: await listFunctions(auth.weddingId) },
    });
  } catch {
    return unavailable();
  }
}
export async function POST(request: Request) {
  try {
    const auth = await manager(request, true);
    if (auth instanceof Response) return auth;
    const parsed = await input(request, functionMutationInput);
    if (parsed instanceof Response) return parsed;
    const { weddingRevision, ...fields } = parsed;
    const result = await saveFunction(
      auth.weddingId,
      auth.userId,
      fields,
      weddingRevision,
    );
    if (result.status !== "saved")
      return failure(404, "RESOURCE_NOT_FOUND", "Wedding not found.");
    return reply(201, {
      data: { function: result.status === "saved" ? result.function : null },
    });
  } catch (error) {
    return unavailable(error);
  }
}
