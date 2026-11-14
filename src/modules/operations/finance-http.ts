import { reply, failure } from "@/modules/auth/auth-http";
import {
  manager,
  input,
  unavailable,
} from "@/modules/weddings/management-http";
import { OperationsError } from "./operations-store";
import {
  costInput,
  settlementInput,
  correctionInput,
  paidCostInput,
} from "./finance-validation";
import {
  addCost,
  addPaidCost,
  addSettlement,
  correctFinancial,
  financeList,
  financeSummary,
  vendorBalances,
} from "./finance-service";
export async function financeRoute(request: Request) {
  try {
    const auth = await manager(request, request.method !== "GET");
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const [kind, id, action, ...extra] = url.pathname
      .replace(/^\/api\/v1\/finance\//, "")
      .split("/");
    if (extra.length || (id && !/^[a-f0-9]{24}$/.test(id)))
      return failure(404, "RESOURCE_NOT_FOUND", "Record not found.");
    if (request.method === "GET" && !id) {
      if (kind === "summary")
        return reply(200, { data: await financeSummary(auth.weddingId) });
      if (kind === "vendor-balances")
        return reply(200, { data: await vendorBalances(auth.weddingId, url) });
      if (kind === "expenses" || kind === "payments")
        return reply(200, {
          data: await financeList(auth.weddingId, kind, url),
        });
    }
    if (request.method === "POST") {
      if (kind === "paid-expenses" && !id) {
        const parsed = await input(request, paidCostInput);
        if (parsed instanceof Response) return parsed;
        return reply(201, {
          data: await addPaidCost(auth.weddingId, auth.userId, parsed),
        });
      }
      if (
        (kind === "expenses" || kind === "payments") &&
        id &&
        (action === "correct" || action === "remove")
      ) {
        const parsed = await input(request, correctionInput);
        if (parsed instanceof Response) return parsed;
        return reply(200, {
          data: await correctFinancial(
            auth.weddingId,
            auth.userId,
            kind,
            id,
            parsed,
          ),
        });
      }
      if (kind === "expenses" && !id) {
        const parsed = await input(request, costInput);
        if (parsed instanceof Response) return parsed;
        return reply(201, {
          data: await addCost(auth.weddingId, auth.userId, parsed),
        });
      }
      if (kind === "payments" && !id) {
        const parsed = await input(request, settlementInput);
        if (parsed instanceof Response) return parsed;
        return reply(201, {
          data: await addSettlement(auth.weddingId, auth.userId, parsed),
        });
      }
    }
    return failure(404, "RESOURCE_NOT_FOUND", "Resource not found.");
  } catch (error) {
    if (error instanceof OperationsError)
      return failure(error.status, error.code, error.message);
    return unavailable(error);
  }
}
