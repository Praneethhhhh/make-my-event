"use client";
import { ThemeControl } from "@/modules/experience/theme-control";
import { BrandLockup } from "@/modules/experience/brand-lockup";
import { useEffect, useRef, useState } from "react";
import { InvitationView } from "./invitation-view";
import type { Invitation } from "./guest-types";
class GuestRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function guestRequest(
  path: string,
  id?: string,
  body?: unknown,
  method = "GET",
) {
  let token = "";
  if (method !== "GET") {
    const r = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
    if (!r.ok) throw new Error("Please refresh and try again.");
    token = (await r.json()).data.token;
  }
  const r = await fetch("/api/v1/guest/" + path, {
    method,
    cache: "no-store",
    headers: {
      ...(id ? { "X-Guest-Id": id } : {}),
      ...(method !== "GET"
        ? { "Content-Type": "application/json", "X-CSRF-Token": token }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  if (!r.ok)
    throw new GuestRequestError(
      value.error?.message ?? "Could not load this invitation.",
      r.status,
    );
  return value.data;
}
export function GuestEntry() {
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const token = useRef<string | null>(null);
  const pending = useRef<Promise<{ guestId: string }> | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const incomingLink = () => {
      const next = new URLSearchParams(location.hash.slice(1)).get("token");
      if (!next) return;
      // Hash-only navigation can keep this entry mounted. Supersede any old exchange.
      generation.current++;
      token.current = next;
      history.replaceState(history.state, "", "/invite");
      pending.current = null;
      setError(null);
      setAttempt((value) => value + 1);
    };
    window.addEventListener("hashchange", incomingLink);
    return () => window.removeEventListener("hashchange", incomingLink);
  }, []);
  useEffect(() => {
    let active = true;
    const currentGeneration = generation.current;
    if (!pending.current) {
      if (attempt === 0) {
        token.current = new URLSearchParams(location.hash.slice(1)).get(
          "token",
        );
        history.replaceState(history.state, "", "/invite");
      }
      pending.current = token.current
        ? guestRequest(
            "access/exchange",
            undefined,
            { token: token.current },
            "POST",
          )
        : Promise.reject(
            new GuestRequestError(
              "Please open the complete private link shared by your hosts.",
              404,
            ),
          );
    }
    void pending.current
      .then((value) => {
        if (active && currentGeneration === generation.current) {
          token.current = null;
          location.replace("/guest/" + value.guestId);
        }
      })
      .catch((e) => {
        if (active && currentGeneration === generation.current)
          setError(
            e instanceof Error
              ? e
              : new Error("Could not open your invitation."),
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const unavailable =
    error instanceof GuestRequestError &&
    [400, 404, 410].includes(error.status);
  return (
    <main className="guest-public-page">
      <div className="public-theme">
        <ThemeControl />
      </div>
      <div className="guest-unavailable">
        <span className="invitation-brand">
          <BrandLockup mark={false} />
        </span>
        <h1>
          {error
            ? unavailable
              ? "This invitation is unavailable"
              : "Let’s try that again"
            : "Opening your invitation"}
        </h1>
        <p role={error ? "alert" : "status"}>
          {error?.message || "A celebration awaits…"}
        </p>
        {error && !unavailable && (
          <button
            className="secondary-action"
            onClick={() => {
              setError(null);
              pending.current = null;
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        )}
        {unavailable && <p>Please contact your hosts for a new link.</p>}
      </div>
    </main>
  );
}
export function GuestPage({ id }: { id: string }) {
  const [data, setData] = useState<Invitation | null>(null),
    [error, setError] = useState(""),
    [unavailable, setUnavailable] = useState(false),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const dirty = useRef(new Set<string>()),
    confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  useEffect(() => {
    let active = true;
    void guestRequest("functions", id)
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
          setUnavailable(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setUnavailable(
            e instanceof GuestRequestError && [401, 404].includes(e.status),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, version]);
  function refresh() {
    dirty.current.clear();
    confirmation.current?.close();
    setLoading(true);
    setVersion((v) => v + 1);
  }
  return (
    <main className="guest-public-page">
      <div className="public-theme">
        <ThemeControl />
      </div>
      {unavailable || (!data && error) ? (
        <div className="guest-unavailable">
          <span className="invitation-brand">
            <BrandLockup mark={false} />
          </span>
          <h1>
            {unavailable
              ? "Your invitation is unavailable"
              : "Let’s try that again"}
          </h1>
          <p role="alert">{error}</p>
          <button
            className="secondary-action"
            disabled={loading}
            onClick={refresh}
          >
            Try again
          </button>
          <p>Please contact your hosts if this link has changed.</p>
        </div>
      ) : data ? (
        <>
          <button
            className="guest-refresh"
            disabled={loading}
            onClick={() =>
              dirty.current.size ? confirmation.current?.showModal() : refresh()
            }
          >
            {loading ? "Refreshing invitation…" : "Refresh invitation"}
          </button>
          {error && (
            <p className="guest-error" role="alert">
              {error}
            </p>
          )}
          <div inert={loading}>
            <InvitationView
              key={version}
              data={data}
              onDirty={(id) => dirty.current.add(id)}
              onSave={async (
                invitationId,
                status,
                attendeeCount,
                revision,
                creationKey,
              ) => {
                try {
                  const saved = await guestRequest(
                    `function-invitations/${invitationId}/rsvp`,
                    id,
                    { status, attendeeCount, revision, creationKey },
                    "PUT",
                  );
                  dirty.current.delete(invitationId);
                  setData((current) =>
                    current
                      ? {
                          ...current,
                          functions: current.functions.map((f) =>
                            f.invitationId === invitationId
                              ? {
                                  ...f,
                                  status: saved.status,
                                  attendeeCount: saved.attendeeCount,
                                  revision: saved.revision,
                                  respondedAt: saved.respondedAt,
                                }
                              : f,
                          ),
                        }
                      : current,
                  );
                } catch (e) {
                  if (
                    e instanceof GuestRequestError &&
                    [401, 404].includes(e.status)
                  ) {
                    dirty.current.clear();
                    setUnavailable(true);
                    setError(e.message);
                  }
                  throw e;
                }
              }}
            />
          </div>
        </>
      ) : loading ? (
        <div className="guest-unavailable" role="status">
          <span className="invitation-brand">
            <BrandLockup mark={false} />
          </span>
          <h1>A celebration awaits</h1>
          <p>Loading your invitation…</p>
        </div>
      ) : null}
      <dialog
        className="guest-draft-confirm"
        ref={confirmation}
        onCancel={(e) => {
          e.preventDefault();
          confirmation.current?.close();
        }}
      >
        <h2>Keep your unsaved responses?</h2>
        <p>Refreshing will discard responses you have not saved yet.</p>
        <div>
          <button
            className="primary-action"
            onClick={() => confirmation.current?.close()}
          >
            Keep editing
          </button>
          <button className="secondary-action" onClick={refresh}>
            Discard and refresh
          </button>
        </div>
      </dialog>
    </main>
  );
}
