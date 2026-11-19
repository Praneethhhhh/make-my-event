"use client";
import { WorkspaceLink as Link } from "@/modules/weddings/workspace-link";
import { useState, useEffect, useRef } from "react";
import { useOperations } from "@/modules/operations/use-operations";
import { usePanelClean } from "@/modules/operations/operations-panel";
import type { Guest, GuestFunction } from "./guest-types";
type Read = ReturnType<typeof useOperations>["read"];
type Mutate = ReturnType<typeof useOperations>["mutate"];
export function RecipientDetails({
  guest,
  timeZone,
  read,
  mutate,
  busy,
  edit,
  changed,
  prefix,
}: {
  guest: Guest;
  timeZone: string;
  read: Read;
  mutate: Mutate;
  busy: boolean;
  close: () => void;
  edit: (g: Guest) => void;
  changed: () => void;
  prefix: string;
}) {
  const { markClean } = useOperations();
  const cleanPanel = usePanelClean();
  const [data, setData] = useState(guest),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [intent, setIntent] = useState<"rotate" | "revoke" | "disable" | null>(
      null,
    ),
    [correction, setCorrection] = useState<GuestFunction | null>(null);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!url) return;
    const timer = setTimeout(() => setUrl(""), 30000);
    return () => clearTimeout(timer);
  }, [url]);
  const refresh = async () => {
    const latest = await read<Guest>(`guests/${data.id}`);
    setData(latest);
    changed();
  };
  async function perform(action: "reveal" | "rotate" | "revoke" | "disable") {
    setError("");
    setMessage("");
    try {
      const result = await mutate<{ url?: string }>(
        `guests/${data.id}/${action === "disable" ? "disable" : action === "revoke" ? "links" : `links/${action}`}`,
        { revision: data.revision, creationKey: key.current },
        action === "revoke" ? "DELETE" : "POST",
      );
      key.current = crypto.randomUUID();
      if (action === "reveal") {
        setUrl(result.url ?? "");
        try {
          await navigator.clipboard.writeText(result.url!);
          setMessage("Private link copied.");
        } catch {
          setMessage("Select the link below to copy it manually.");
        }
      } else {
        setUrl("");
        setIntent(null);
        setMessage(
          action === "rotate"
            ? "New link created. The previous link no longer works."
            : action === "disable"
              ? "Invitation removed. Response history is retained."
              : "Link revoked. Existing guest sessions are blocked.",
        );
        await refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update this invitation.",
      );
    }
  }
  return (
    <div className="guest-detail">
      <span className="operations-kicker">INVITATION</span>
      <h2>{data.displayName}</h2>
      {data.personalMessage && (
        <p className="guest-welcome-note">{data.personalMessage}</p>
      )}
      {message && (
        <p role="status" className="guest-success">
          {message}
        </p>
      )}
      {error && (
        <p className="operations-alert" role="alert">
          {error}{" "}
          <button
            className="guest-text-button"
            onClick={() =>
              void refresh().catch(() =>
                setError("Could not refresh. Try reopening this invitation."),
              )
            }
          >
            Refresh details
          </button>
        </p>
      )}
      <div className="operations-actions">
        {data.status === "ACTIVE" && (
          <button
            className="secondary-action"
            disabled={busy}
            onClick={() => edit(data)}
          >
            Edit invitation
          </button>
        )}
        {data.status === "ACTIVE" && (
          <Link
            className="secondary-action"
            href={`${prefix}/guests/preview?recipient=${data.id}`}
          >
            Preview guest page
          </Link>
        )}
      </div>
      <div className="guest-detail-functions">
        {data.functions.map((f) => (
          <article key={f.id}>
            <header>
              <strong>{f.name}</strong>
              <span className="guest-status">
                {f.eligibilityStatus !== "ACTIVE"
                  ? f.eligibilityStatus
                  : f.status === "ACCEPTED"
                    ? `${f.attendeeCount} attending`
                    : f.status === "DECLINED"
                      ? "Declined"
                      : "Pending"}
              </span>
            </header>
            <p>
              Maximum {f.maxAttendees} · Replies until{" "}
              {new Intl.DateTimeFormat("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              }).format(new Date(f.deadlineAt))}
            </p>
            {f.eligibilityStatus === "ACTIVE" && data.status === "ACTIVE" && (
              <button
                className="guest-text-button"
                disabled={busy}
                onClick={() => {
                  setCorrection(f);
                  setMessage("");
                }}
              >
                Correct response
              </button>
            )}
          </article>
        ))}
      </div>
      {data.status === "ACTIVE" && (
        <section className="guest-share">
          <h3>
            {data.linkActive ? "Private invitation link" : "Link revoked"}
          </h3>
          <p>
            {data.linkActive
              ? "Copy and share this invitation with the recipient."
              : "Access is revoked. Replace the link before sharing this invitation again."}
          </p>
          {url && (
            <label>
              Private link{" "}
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                autoComplete="off"
              />
            </label>
          )}
          <div className="operations-actions">
            <button
              className="primary-action"
              disabled={busy || !data.linkActive}
              onClick={() => void perform("reveal")}
            >
              Copy private link
            </button>
            {url && typeof navigator.share === "function" && (
              <button
                className="secondary-action"
                onClick={() =>
                  void navigator
                    .share({ url, title: "Your wedding invitation" })
                    .catch(() =>
                      setMessage(
                        "Sharing cancelled. Your link is still available to copy.",
                      ),
                    )
                }
              >
                Share
              </button>
            )}
          </div>
          <details className="guest-more">
            <summary>Manage invitation access</summary>
            <p className="guest-subtle">
              Replacing a link keeps responses. Removing the invitation keeps
              its history.
            </p>
            <div className="operations-actions">
              {(["rotate", "revoke", "disable"] as const).map((action) => (
                <button
                  className="secondary-action"
                  key={action}
                  disabled={busy || (action === "revoke" && !data.linkActive)}
                  onClick={() => {
                    setIntent(action);
                    key.current = crypto.randomUUID();
                  }}
                >
                  {action === "rotate"
                    ? "Replace link"
                    : action === "revoke"
                      ? "Revoke link"
                      : "Remove invitation"}
                </button>
              ))}
            </div>
          </details>
        </section>
      )}
      {intent && (
        <section
          className="guest-confirm"
          role="alertdialog"
          aria-label="Confirm invitation change"
        >
          <h3>
            {intent === "rotate"
              ? "Replace this private link?"
              : intent === "revoke"
                ? "Revoke this private link?"
                : "Remove this invitation?"}
          </h3>
          <p>
            {intent === "rotate"
              ? "The old link and existing guest sessions will stop working. Their responses stay saved."
              : "This recipient will lose access. Saved responses remain in history and are excluded from current attendance."}
          </p>
          <div className="operations-actions">
            <button
              className="secondary-action"
              disabled={busy}
              onClick={() => setIntent(null)}
            >
              Keep invitation
            </button>
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => void perform(intent)}
            >
              Confirm change
            </button>
          </div>
        </section>
      )}
      {correction && (
        <Correction
          key={correction.invitationId}
          fn={correction}
          busy={busy}
          cancel={() => {
            setCorrection(null);
            markClean();
            cleanPanel?.();
          }}
          save={async (value) => {
            setError("");
            await mutate(
              `function-invitations/${correction.invitationId}/rsvp`,
              value,
              "PATCH",
            );
            setCorrection(null);
            markClean();
            cleanPanel?.();
            setMessage(
              "Response corrected. The reason is retained in history.",
            );
            await refresh();
          }}
        />
      )}
    </div>
  );
}
function Correction({
  fn,
  busy,
  cancel,
  save,
}: {
  fn: GuestFunction;
  busy: boolean;
  cancel: () => void;
  save: (data: unknown) => Promise<void>;
}) {
  const [status, setStatus] = useState(
      fn.status === "DECLINED" ? "DECLINED" : "ACCEPTED",
    ),
    [error, setError] = useState(""),
    key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  return (
    <form
      className="guest-correction"
      onChange={() => {
        key.current = crypto.randomUUID();
        setError("");
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        const fields = new FormData(e.currentTarget);
        try {
          await save({
            status,
            attendeeCount:
              status === "DECLINED" ? 0 : Number(fields.get("count")),
            reason: String(fields.get("reason") ?? "").trim(),
            revision: fn.revision,
            creationKey: key.current,
          });
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not correct this response.",
          );
        } finally {
          lock.current = false;
        }
      }}
    >
      <h3>Correct response · {fn.name}</h3>
      {error && (
        <p role="alert" className="guest-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        <label>
          Response
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACCEPTED">Attending</option>
            <option value="DECLINED">Not attending</option>
          </select>
        </label>
        {status === "ACCEPTED" && (
          <label>
            People attending
            <input
              name="count"
              type="number"
              min={1}
              max={fn.maxAttendees ?? 200}
              defaultValue={fn.attendeeCount || 1}
              required
            />
          </label>
        )}
        <label>
          Reason for correction
          <textarea name="reason" required maxLength={500} />
        </label>
        <div className="operations-actions">
          <button type="button" className="secondary-action" onClick={cancel}>
            Cancel correction
          </button>
          <button className="primary-action">
            {busy ? "Saving…" : "Save correction"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
