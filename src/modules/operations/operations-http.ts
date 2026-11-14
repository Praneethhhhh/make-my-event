import { z } from "zod";
import { reply, failure } from "@/modules/auth/auth-http";
import {
  manager,
  input,
  unavailable,
} from "@/modules/weddings/management-http";
import * as schema from "./operations-validation";
import * as service from "./operations-service";

export async function operationsRoute(request: Request) {
  try {
    if (
      /^\/api\/v1\/vendors\/[^/]+\/(?:links|access|assignments)(?:\/|$)/.test(
        new URL(request.url).pathname,
      )
    )
      return failure(404, "RESOURCE_NOT_FOUND", "Resource not found.");
    const mutate = request.method !== "GET";
    const auth = await manager(request, mutate);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const [resource, recordId, action, commentId] = url.pathname
      .replace(/^\/api\/v1\//, "")
      .split("/");
    const { weddingId, userId } = auth;
    if (
      recordId &&
      !["read-all"].includes(recordId) &&
      !schema.id.safeParse(recordId).success
    )
      return failure(404, "RESOURCE_NOT_FOUND", "Record not found.");
    const method = request.method;
    if (method === "GET") {
      if (
        resource === "notifications" &&
        !recordId &&
        url.searchParams.get("view") === "count"
      )
        return reply(200, {
          data: await service.notificationCount(weddingId, userId),
        });
      if (resource === "operations")
        return reply(200, {
          data:
            url.searchParams.get("view") === "choices"
              ? await service.operationsChoices(weddingId, url)
              : url.searchParams.get("view") === "context"
                ? await service.operationsContext(weddingId, userId)
                : url.searchParams.get("view") === "dashboard"
                  ? await service.workspaceDashboard(weddingId, userId)
                  : await service.workspaceDashboard(weddingId, userId),
        });
      if (resource === "tasks" && recordId)
        return reply(200, {
          data: await service.taskDetail(weddingId, recordId, url),
        });
      const kind =
        resource === "vendor-charges"
          ? "charges"
          : resource === "vendor-payments"
            ? "payments"
            : resource;
      if (kind && kind in service.resourceCollections)
        return reply(200, {
          data: recordId
            ? await service.resourceDetail(
                weddingId,
                userId,
                kind as keyof typeof service.resourceCollections,
                recordId,
              )
            : await service.listResource(
                weddingId,
                userId,
                kind as keyof typeof service.resourceCollections,
                url,
              ),
        });
    }
    if (resource === "notifications") {
      if (recordId === "read-all" && method === "POST")
        return reply(200, {
          data: await service.notificationsRead(weddingId, userId, true),
        });
      if (recordId && method === "PATCH") {
        const parsed = await input(request, schema.readInput);
        if (parsed instanceof Response) return parsed;
        return reply(200, {
          data: await service.notificationsRead(
            weddingId,
            userId,
            parsed.read,
            recordId,
          ),
        });
      }
    }
    if (resource === "tasks") {
      if (
        recordId &&
        action === "comments" &&
        commentId &&
        (method === "PATCH" || method === "DELETE")
      ) {
        if (!schema.id.safeParse(commentId).success)
          return failure(404, "RESOURCE_NOT_FOUND", "Comment unavailable.");
        const parsed =
          method === "PATCH"
            ? await input(
                request,
                schema.commentInput
                  .omit({ creationKey: true })
                  .extend({ revision: schema.revision }),
              )
            : await input(
                request,
                z.object({ revision: schema.revision }).strict(),
              );
        if (parsed instanceof Response) return parsed;
        return reply(200, {
          data: await service.changeComment(
            weddingId,
            userId,
            recordId,
            commentId,
            parsed.revision,
            method === "PATCH"
              ? (parsed as {
                  body: string;
                  mentionedUserIds: string[];
                  revision: number;
                })
              : null,
          ),
        });
      }
      if (recordId && action === "comments" && method === "POST") {
        const parsed = await input(request, schema.commentInput);
        if (parsed instanceof Response) return parsed;
        return reply(201, {
          data: await service.addComment(weddingId, userId, recordId, parsed),
        });
      }
      if (recordId && method === "DELETE") {
        const parsed = await input(
          request,
          z.object({ revision: schema.revision }).strict(),
        );
        if (parsed instanceof Response) return parsed;
        await service.removeTask(weddingId, userId, recordId, parsed.revision);
        return reply(200, { data: { deleted: true } });
      }
      if (
        (method === "POST" && !recordId) ||
        (method === "PATCH" && recordId && !action)
      ) {
        const parsed = recordId
          ? await input(
              request,
              schema.taskInput.safeExtend({ revision: schema.revision }),
            )
          : await input(request, schema.taskInput);
        if (parsed instanceof Response) return parsed;
        const { revision, ...fields } = parsed as schema.TaskInput & {
          revision?: number;
        };
        return reply(recordId ? 200 : 201, {
          data: await service.saveTask(
            weddingId,
            userId,
            fields,
            recordId,
            revision,
          ),
        });
      }
    }
    if (resource === "vendors") {
      if (action === "assignments")
        return failure(404, "RESOURCE_NOT_FOUND", "Resource not found.");
      if (
        (method === "POST" && !recordId) ||
        (method === "PATCH" && recordId && !action)
      ) {
        const parsed = await input(
          request,
          schema.vendorInput.extend(
            recordId ? { revision: schema.revision } : {},
          ),
        );
        if (parsed instanceof Response) return parsed;
        const { revision, ...fields } = parsed as schema.VendorInput & {
          revision?: number;
        };
        return reply(recordId ? 200 : 201, {
          data: await service.saveVendor(
            weddingId,
            userId,
            fields,
            recordId,
            revision,
          ),
        });
      }
    }
    const kind =
      resource === "vendor-charges"
        ? "vendorCharges"
        : resource === "vendor-payments"
          ? "vendorPayments"
          : resource === "expenses"
            ? "expenses"
            : null;
    if (kind) {
      if (recordId && action === "void" && method === "POST") {
        const parsed = await input(request, schema.voidInput);
        if (parsed instanceof Response) return parsed;
        return reply(200, {
          data: await service.voidFinancial(
            weddingId,
            userId,
            kind,
            recordId,
            parsed.revision,
            parsed.reason,
          ),
        });
      }
      if (!recordId && method === "POST") {
        const parsed =
          kind === "expenses"
            ? await input(request, schema.expenseInput)
            : kind === "vendorCharges"
              ? await input(request, schema.chargeInput)
              : await input(request, schema.paymentInput);
        if (parsed instanceof Response) return parsed;
        return reply(201, {
          data: await service.postFinancial(weddingId, userId, kind, parsed),
        });
      }
    }
    return failure(405, "METHOD_NOT_ALLOWED", "This action is not supported.");
  } catch (error) {
    if (error instanceof service.OperationsError)
      return failure(error.status, error.code, error.message);
    return unavailable(error);
  }
}
