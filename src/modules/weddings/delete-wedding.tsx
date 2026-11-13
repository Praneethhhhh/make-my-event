"use client";
import { useRef, useState } from "react";
import { useWeddingClient } from "./wedding-scope";

export function DeleteWedding({
  title,
  revision,
}: {
  title: string;
  revision: number;
}) {
  const { fetch, markClean } = useWeddingClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function close() {
    if (busy) return;
    dialog.current?.close();
    setConfirmation("");
    setError("");
    trigger.current?.focus();
  }
  async function remove() {
    if (lock.current || confirmation !== title) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch("/api/v1/wedding", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": (await csrf.json()).data.token,
        },
        body: JSON.stringify({ revision, confirmationTitle: confirmation }),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(
          body.error?.message || "Could not delete this wedding. Try again.",
        );
        return;
      }
      markClean();
      dialog.current?.close();
      // Discard cached tenant pages after permanent removal.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/weddings");
    } catch {
      setError(
        "Could not confirm deletion. Check Your weddings before retrying.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section
      className="wedding-danger"
      aria-labelledby="delete-wedding-heading"
    >
      <div>
        <p className="section-kicker">DANGER ZONE</p>
        <h2 id="delete-wedding-heading">Delete wedding</h2>
        <p>Permanently remove this celebration and its records.</p>
      </div>
      <button
        ref={trigger}
        className="danger-action"
        onClick={() => dialog.current?.showModal()}
      >
        Delete wedding
      </button>
      <dialog
        ref={dialog}
        className="team-dialog delete-dialog"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-copy"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else {
            setConfirmation("");
            setError("");
          }
        }}
      >
        <p className="section-kicker">PERMANENT ACTION</p>
        <h2 id="delete-dialog-title">Delete this wedding?</h2>
        <p id="delete-dialog-copy">
          This removes the wedding, all functions, invitations and team access.
          Other weddings and accounts stay safe. This cannot be undone.
        </p>
        <label htmlFor="delete-confirmation">
          Type <strong>{title}</strong> to confirm
        </label>
        <input
          id="delete-confirmation"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          maxLength={160}
          disabled={busy}
        />
        {error && (
          <p role="alert" className="wedding-error">
            {error}
          </p>
        )}
        <div className="team-result-actions">
          <button
            className="secondary-action"
            autoFocus
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="danger-action"
            onClick={() => void remove()}
            disabled={busy || confirmation !== title}
          >
            {busy ? "Deleting wedding…" : "Delete wedding permanently"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
