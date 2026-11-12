"use client";
import Link from "next/link";
import {
  registration,
  loginInput,
  userResponse,
  currentUserResponse,
  passwordProblem,
  passwordPersonalInputs,
} from "./account-validation";
import "./account-form.css";
import { useEffect, useState, type FormEvent } from "react";

export function AccountForm({ signIn = false }: { signIn?: boolean }) {
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [identity, setIdentity] = useState({ displayName: "", email: "" });
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  function clearInputError(field: string) {
    setFields((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError("");
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/auth/me", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          currentUserResponse.parse(await r.json());
          window.location.replace("/weddings");
        } else if (r.status !== 401) throw new Error();
        else setCheckingSession(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Could not check your session. Please try again.");
          setCheckingSession(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;

    const parsed = (signIn ? loginInput : registration).safeParse(
      Object.fromEntries(new FormData(form)),
    );
    if (!parsed.success) {
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      const first = form.elements.namedItem(
        String(parsed.error.issues[0]?.path[0]),
      ) as HTMLInputElement | null;
      first?.focus();
      return;
    }
    const data = parsed.data;
    setFields({});
    setBusy(true);
    setError("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(
        signIn ? "/api/v1/auth/login" : "/api/v1/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": (await csrf.json()).data.token,
          },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (response.ok) {
        if (signIn) {
          const sessionResponse = await fetch("/api/v1/auth/me", {
            cache: "no-store",
          });
          if (!sessionResponse.ok) throw new Error();
          currentUserResponse.parse(await sessionResponse.json());
        }
        setPasswordVisible(false);
        setPassword("");
        userResponse.parse(result);
        setCheckingSession(true);
        // A fresh navigation clears prefetched signed-out pages after the API sets the cookie.
        window.location.replace("/weddings");
      } else {
        if (result.error?.details?.fields)
          setFields(result.error.details.fields);
        setError(result.error?.message ?? "Please try again.");
      }
    } catch {
      setError("Could not reach the account service. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (checkingSession)
    return (
      <main className="account-page mx-auto grid min-h-screen place-content-center">
        <p role="status">Checking your account…</p>
      </main>
    );
  return (
    <main className="account-page mx-auto grid min-h-screen max-w-5xl content-center px-4 py-10">
      <div className="account-panel grid overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white md:grid-cols-2">
        <section className="grid gap-5 p-6 sm:p-12">
          <Link href="/" className="text-sm underline">
            ← Back to home
          </Link>
          <h1 className="font-[family-name:var(--font-editorial)] text-4xl">
            {signIn ? "Welcome back" : "Create an account"}
          </h1>
          <form
            onSubmit={submit}
            aria-busy={busy}
            noValidate
            className="grid gap-4"
          >
            {!signIn && (
              <div className="grid gap-1">
                <label htmlFor="account-name">Your name</label>
                <input
                  className="rounded-lg border p-3"
                  id="account-name"
                  name="displayName"
                  aria-invalid={!!fields.displayName}
                  aria-describedby={
                    fields.displayName ? "name-error" : undefined
                  }
                  value={identity.displayName}
                  onChange={(event) => {
                    setIdentity((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }));
                    clearInputError("displayName");
                  }}
                  autoComplete="name"
                  required
                  maxLength={120}
                />
                {fields.displayName && (
                  <small id="name-error" className="field-error">
                    {fields.displayName}
                  </small>
                )}
              </div>
            )}
            <div className="grid gap-1">
              <label htmlFor="account-email">Email</label>
              <input
                className="rounded-lg border p-3"
                type="email"
                autoComplete="email"
                id="account-email"
                name="email"
                aria-invalid={!!fields.email}
                aria-describedby={fields.email ? "email-error" : undefined}
                spellCheck={false}
                autoCapitalize="none"
                value={identity.email}
                onChange={(event) => {
                  setIdentity((current) => ({
                    ...current,
                    email: event.target.value,
                  }));
                  clearInputError("email");
                }}
                required
                maxLength={254}
              />
              {fields.email && (
                <small id="email-error" className="field-error">
                  {fields.email}
                </small>
              )}
            </div>
            <div className="grid gap-1">
              <label htmlFor="account-password">Password</label>
              <div className="relative">
                <input
                  className="w-full rounded-lg border p-3 pr-20"
                  id="account-password"
                  type={passwordVisible ? "text" : "password"}
                  aria-invalid={!!fields.password}
                  aria-describedby={
                    [
                      !signIn && "password-help",
                      fields.password && "password-error",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearInputError("password");
                  }}
                  name="password"
                  autoComplete={signIn ? "current-password" : "new-password"}
                  minLength={signIn ? 1 : 15}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  aria-controls="account-password"
                  aria-label={
                    passwordVisible ? "Hide password" : "Show password"
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="absolute inset-y-0 right-0 min-w-16 rounded-r-lg px-3 text-sm font-semibold text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                >
                  {passwordVisible ? "Hide" : "Show"}
                </button>
              </div>
              {!signIn && (
                <small id="password-help">
                  {password
                    ? passwordProblem(
                        password,
                        passwordPersonalInputs(
                          identity.displayName,
                          identity.email,
                        ),
                      ) || "Password strength looks good."
                    : "Use 15 to 128 characters. Try several unrelated words."}
                </small>
              )}
            </div>
            {fields.password && (
              <small id="password-error" className="field-error">
                {fields.password}
              </small>
            )}
            {error && <p role="alert">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[var(--color-primary)] p-3 text-white disabled:opacity-60"
            >
              {busy ? "Please wait…" : signIn ? "Sign in" : "Create account"}
            </button>
            <Link
              href={signIn ? "/register" : "/sign-in"}
              className="text-sm underline"
            >
              {signIn ? "Create an account" : "Already registered? Sign in"}
            </Link>
          </form>
        </section>
        <aside className="grid content-center gap-4 bg-[var(--color-surface-muted)] p-8 sm:p-12">
          <p className="text-sm font-bold tracking-wider uppercase">
            Make My Event
          </p>
          <h2 className="font-[family-name:var(--font-editorial)] text-4xl">
            Plan your wedding together.
          </h2>
          <p>
            Your organizing account brings the family’s schedules, tasks and
            invitations into one place.
          </p>
        </aside>
      </div>
    </main>
  );
}
