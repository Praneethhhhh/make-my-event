"use client";
import { useCallback, useRef, useState } from "react";
import { useWeddingClient } from "@/modules/weddings/wedding-scope";

export class RequestError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
export function useOperations() {
  const { fetch, markClean, markDirty, prefix } = useWeddingClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const read = useCallback(
    async <T>(path: string, signal?: AbortSignal): Promise<T> => {
      const response = await fetch("/api/v1/" + path, {
        cache: "no-store",
        ...(signal ? { signal } : {}),
      });
      const body = await response.json();
      if (!response.ok)
        throw new RequestError(
          body.error?.message ?? "Could not load. Try again.",
          body.error?.details?.fields,
        );
      return body.data;
    },
    [fetch],
  );
  const mutate = useCallback(
    async <T>(path: string, data: unknown, method = "POST"): Promise<T> => {
      if (lock.current)
        throw new RequestError("A change is already being saved.");
      lock.current = true;
      setBusy(true);
      try {
        const csrf = await globalThis.fetch("/api/v1/auth/csrf", {
          cache: "no-store",
        });
        if (!csrf.ok) throw new RequestError("Please sign in again.");
        const response = await fetch("/api/v1/" + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": (await csrf.json()).data.token,
          },
          body: JSON.stringify(data),
        });
        const body = await response.json();
        if (!response.ok)
          throw new RequestError(
            body.error?.message ?? "Could not save. Try again.",
            body.error?.details?.fields,
          );
        window.dispatchEvent(new Event("mme-notifications"));
        return body.data;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [fetch],
  );
  return { read, mutate, busy, markClean, markDirty, prefix };
}
