"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { redemptionInput } from "./team-validation";
import "@/modules/weddings/wedding.css";
import "./team.css";
export function JoinTeam() {
  const [account, setAccount] = useState<{
    displayName: string;
    email: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState<{
    weddingId: string;
    already: boolean;
  } | null>(null);
  const lock = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/auth/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return;
        if (!response.ok) throw new Error();
        const data = (await response.json()).data;
        if (!controller.signal.aborted) setAccount(data.user);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Couldn’t load your account. Reload to try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account || lock.current) return;
    const parsed = redemptionInput.safeParse({ email: account.email, code });
    if (!parsed.success) {
      setError(
        "Enter the case-sensitive 12-character code shared by the wedding administrator or sent by email.",
      );
      codeInput.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch("/api/v1/member-invitations/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": (await csrf.json()).data.token,
        },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json();
      if (!response.ok) {
        if (
          body.error?.code === "ALREADY_A_MEMBER" &&
          /^[a-f0-9]{24}$/.test(body.error.details?.weddingId ?? "")
        ) {
          setJoined({ weddingId: body.error.details.weddingId, already: true });
          setCode("");
          return;
        }
        setError(body.error?.message ?? "Couldn’t accept this invitation.");
        if (response.status === 401) setAccount(null);
        return;
      }
      if (!/^[a-f0-9]{24}$/.test(body.data.membership.weddingId))
        throw new Error();
      setCode("");
      setJoined({ weddingId: body.data.membership.weddingId, already: false });
    } catch {
      setError(
        "Couldn’t confirm acceptance. Check Your weddings before retrying. Your other weddings are unaffected.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function switchAccount() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": (await csrf.json()).data.token },
      });
      if (!response.ok) throw new Error();
      window.location.replace("/sign-in");
    } catch {
      setError("Couldn’t sign out. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={account?.displayName ?? "Your family"} />
      <section className="team-workspace team-join">
        <h1>Join your organizing team</h1>
        <div className="team-panel">
          {!loaded ? (
            <p>Loading your account…</p>
          ) : !account ? (
            <>
              <p>
                Register or sign in with the email address the administrator
                invited, then choose Join with code from Your weddings.
              </p>
              <div className="team-result-actions">
                <Link className="primary-action" href="/sign-in">
                  Sign in
                </Link>
                <Link className="secondary-action" href="/register">
                  Create an account
                </Link>
              </div>
            </>
          ) : joined ? (
            <section role="status">
              <h2>
                {joined.already
                  ? "You already belong to this wedding"
                  : "You’ve joined the wedding"}
              </h2>
              <p>Your other weddings and roles are unchanged.</p>
              <div className="team-result-actions">
                <Link
                  className="primary-action"
                  href={`/weddings/${joined.weddingId}`}
                >
                  Open this wedding
                </Link>
                <Link
                  className="secondary-action"
                  href="/weddings"
                  prefetch={false}
                >
                  View all weddings
                </Link>
              </div>
            </section>
          ) : (
            <>
              <p>
                Signed in as <strong>{account.email}</strong>
              </p>
              <p>
                Use the email address the administrator invited. You can join
                this wedding even if you belong to others.
              </p>
              <button
                className="secondary-action"
                disabled={busy}
                onClick={() => void switchAccount()}
              >
                Switch account
              </button>
              <form onSubmit={submit} noValidate aria-busy={busy}>
                <div className="wedding-field">
                  <label htmlFor="invitation-code">Invitation code</label>
                  <input
                    ref={codeInput}
                    id="invitation-code"
                    value={code}
                    required
                    maxLength={12}
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-describedby="code-help"
                    aria-invalid={!!error}
                    disabled={busy}
                    onChange={(event) => {
                      setCode(event.target.value);
                      setError("");
                    }}
                  />
                  <small id="code-help">
                    Enter the case-sensitive 12-character code shared privately
                    by the administrator or sent by email. Expired/revoked codes
                    require a replacement.
                  </small>
                </div>
                <button className="primary-action" disabled={busy}>
                  {busy ? "Joining…" : "Accept invitation"}
                </button>
              </form>
            </>
          )}
          {error && (
            <p role="alert" className="wedding-error">
              {error}
            </p>
          )}
          <p className="team-note">
            <Link href="/weddings">Your weddings</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
