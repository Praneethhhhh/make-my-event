import { z } from "zod";
import {
  reply,
  failure,
  validMutation,
  clientSource,
} from "@/modules/auth/auth-http";
import {
  manager,
  input,
  unavailable,
} from "@/modules/weddings/management-http";
import { OperationsError, limit } from "./guest-store";
import * as schema from "./guest-validation";
import * as service from "./guest-service";
import * as access from "./guest-access";
export async function guestRoute(request: Request) {
  try {
    const url = new URL(request.url),
      parts = url.pathname.replace(/^\/api\/v1\//, "").split("/"),
      [resource, id, action, extra, tail] = parts,
      method = request.method;
    if (resource === "guest") {
      if (method !== "GET" && !validMutation(request))
        return failure(
          403,
          "CSRF_INVALID",
          "Refresh the invitation and try again.",
        );
      if (
        id === "access" &&
        action === "exchange" &&
        method === "POST" &&
        !extra
      ) {
        await limit("exchange:" + clientSource(request), 120);
        const data = await input(
          request,
          z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
        );
        if (data instanceof Response) return data;
        const result = await access.exchange(data.token);
        return reply(
          200,
          { data: { guestId: result.guestId } },
          result.setCookie,
          { "Referrer-Policy": "no-referrer" },
        );
      }
      const selected = request.headers.get("x-guest-id") ?? "";
      if (!schema.guestId.safeParse(selected).success)
        return failure(
          404,
          "INVITATION_UNAVAILABLE",
          "This invitation is no longer available.",
        );
      const token = access.guestCredential(request, selected);
      if (method === "GET" && (id === "me" || id === "functions") && !action)
        return reply(200, {
          data: await access.publicInvitation(selected, token),
        });
      if (
        method === "PUT" &&
        id === "function-invitations" &&
        schema.guestId.safeParse(action).success &&
        extra === "rsvp" &&
        !tail
      ) {
        const data = await input(request, schema.responseInput);
        if (data instanceof Response) return data;
        return reply(200, {
          data: await access.guestRsvp(selected, token, action!, data),
        });
      }
      return failure(404, "RESOURCE_NOT_FOUND", "Not found.");
    }
    const auth = await manager(request, method !== "GET");
    if (auth instanceof Response) return auth;
    const { weddingId, userId } = auth;
    if (
      resource === "function-invitations" &&
      schema.guestId.safeParse(id).success &&
      action === "rsvp" &&
      method === "PATCH" &&
      !extra
    ) {
      const data = await input(request, schema.correctionInput);
      if (data instanceof Response) return data;
      return reply(200, {
        data: await service.correctResponse(weddingId, userId, id!, data),
      });
    }
    if (resource !== "guests" || tail)
      return failure(404, "RESOURCE_NOT_FOUND", "Not found.");
    if (method === "GET" && id === "context" && !action)
      return reply(200, {
        data: await service.guestContext(weddingId, userId),
      });
    if (method === "GET" && id === "summary" && !action)
      return reply(200, { data: await service.guestSummary(weddingId) });
    if (method === "GET" && id === "preview" && !action) {
      const selected = url.searchParams.get("recipient");
      if (selected && !schema.guestId.safeParse(selected).success)
        return failure(400, "VALIDATION_ERROR", "Choose a valid recipient.");
      return reply(200, {
        data: await service.managerPreview(weddingId, selected ?? undefined),
      });
    }
    if (!id) {
      if (method === "GET")
        return reply(200, { data: await service.listGuests(weddingId, url) });
      if (method === "POST") {
        const data = await input(request, schema.guestInput);
        if (data instanceof Response) return data;
        return reply(201, {
          data: await service.saveGuest(weddingId, userId, data),
        });
      }
    }
    if (!schema.guestId.safeParse(id).success)
      return failure(404, "RESOURCE_NOT_FOUND", "Not found.");
    if (method === "GET" && !action)
      return reply(200, { data: await service.guestDetails(weddingId, id!) });
    if (method === "PATCH" && !action) {
      const data = await input(request, schema.guestEdit);
      if (data instanceof Response) return data;
      return reply(200, {
        data: await service.saveGuest(weddingId, userId, data, id),
      });
    }
    const operation =
      action === "disable" && !extra && method === "POST"
        ? "disable"
        : action === "links" && extra === "reveal" && method === "POST"
          ? "reveal"
          : action === "links" && extra === "rotate" && method === "POST"
            ? "rotate"
            : action === "links" && !extra && method === "DELETE"
              ? "revoke"
              : null;
    if (operation) {
      const data = await input(request, schema.guestAction);
      if (data instanceof Response) return data;
      return reply(200, {
        data: await service.linkAction(weddingId, userId, id!, operation, data),
      });
    }
    return failure(404, "RESOURCE_NOT_FOUND", "Not found.");
  } catch (error) {
    if (error instanceof OperationsError)
      return failure(
        error.status,
        error.code,
        error.message,
        error.status === 429 ? { "Retry-After": "600" } : undefined,
      );
    return unavailable(error);
  }
}
