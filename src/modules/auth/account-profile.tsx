"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import {
  profileInput,
  passwordChangeInput,
  type AccountProfile as Profile,
} from "./profile-validation";
import { passwordProblem, passwordPersonalInputs } from "./account-validation";
import "@/modules/weddings/wedding.css";
import "@/modules/team/team.css";
import "./account-profile.css";
type Passwords = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};
const emptyPasswords: Passwords = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};
export function AccountProfile() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [nameMessage, setNameMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"name" | "password" | null>(null);
  const lock = useRef(false);
  const dirty = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const destination = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/account", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (!response.ok) throw new Error();
        const profile = (await response.json()).data.user;
        if (!controller.signal.aborted) {
          setUser(profile);
          setName(profile.displayName);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError("Could not load your account. Reload to try again.");
      });
    return () => controller.abort();
  }, [router]);
  useEffect(() => {
    dirty.current =
      !!user &&
      (name !== user.displayName || Object.values(passwords).some(Boolean));
  }, [user, name, passwords]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  function focus(form: HTMLFormElement, next: Record<string, string>) {
    setFields(next);
    requestAnimationFrame(() =>
      (
        form.elements.namedItem(
          Object.keys(next)[0] ?? "",
        ) as HTMLElement | null
      )?.focus(),
    );
  }
  async function save(
    event: FormEvent<HTMLFormElement>,
    kind: "name" | "password",
  ) {
    event.preventDefault();
    if (!user || lock.current) return;
    const form = event.currentTarget;
    const input =
      kind === "name"
        ? { displayName: name, revision: user.revision }
        : { ...passwords, revision: user.revision };
    const parsed =
      kind === "name"
        ? profileInput.safeParse(input)
        : passwordChangeInput.safeParse(input);
    setError("");
    setNameMessage("");
    setPasswordMessage("");
    if (!parsed.success) {
      focus(
        form,
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    if (kind === "password") {
      const problem = passwordProblem(
        passwords.newPassword,
        passwordPersonalInputs(user.displayName, user.email),
      );
      if (problem) {
        focus(form, { newPassword: problem });
        return;
      }
    }
    lock.current = true;
    setBusy(kind);
    setFields({});
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(
        kind === "name" ? "/api/v1/account" : "/api/v1/account/password",
        {
          method: kind === "name" ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": (await csrf.json()).data.token,
          },
          body: JSON.stringify(parsed.data),
        },
      );
      if (response.status === 401) {
        dirty.current = false;
        router.replace("/sign-in");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message || "Could not save your changes.");
        if (body.error?.details?.fields) focus(form, body.error.details.fields);
        return;
      }
      setUser(body.data.user);
      if (kind === "name") {
        setName(body.data.user.displayName);
        setNameMessage("Name updated.");
      } else {
        setPasswords(emptyPasswords);
        setVisible({});
        setPasswordMessage(
          "Password changed. Other devices have been signed out.",
        );
      }
    } catch {
      setError(
        kind === "password"
          ? "Could not confirm the change. If signed out, try signing in with your new password."
          : "Could not save your name. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  if (!user)
    return (
      <main className="wedding-page">
        <p className="loading-state" role={loadError ? "alert" : undefined}>
          {loadError || "Loading your account…"}
        </p>
        {loadError && (
          <button
            className="secondary-action"
            onClick={() => window.location.reload()}
          >
            Reload account
          </button>
        )}
      </main>
    );
  const newPasswordHint = passwords.newPassword
    ? passwordProblem(
        passwords.newPassword,
        passwordPersonalInputs(user.displayName, user.email),
      ) || "Password strength looks good."
    : "15–128 characters. Try several unrelated words.";
  return (
    <main
      className="wedding-page profile-page"
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[href]",
        );
        if (
          !anchor ||
          !dirty.current ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          anchor.target === "_blank"
        )
          return;
        const target = new URL(anchor.href);
        if (
          target.origin === location.origin &&
          target.pathname !== location.pathname
        ) {
          event.preventDefault();
          event.stopPropagation();
          destination.current = target.pathname + target.search + target.hash;
          dialog.current?.showModal();
        }
      }}
    >
      <WeddingHeader displayName={user.displayName} />
      <div className="profile-workspace">
        <header className="profile-heading">
          <p>PERSONAL SETTINGS</p>
          <h1>Your account</h1>
          <span>A few details, just for you.</span>
        </header>
        {error && (
          <p className="profile-error" role="alert">
            {error}
          </p>
        )}
        <form
          className="profile-card"
          onSubmit={(event) => void save(event, "name")}
          noValidate
          aria-busy={busy === "name"}
        >
          <div className="profile-card-title">
            <span aria-hidden="true">01</span>
            <div>
              <h2>Personal details</h2>
              <p>The name your organizing teams see.</p>
            </div>
          </div>
          <fieldset disabled={!!busy}>
            <label htmlFor="profile-name">Your name</label>
            <input
              id="profile-name"
              name="displayName"
              autoComplete="name"
              maxLength={120}
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameMessage("");
                setFields((current) => ({ ...current, displayName: "" }));
              }}
              aria-invalid={!!fields.displayName}
              aria-describedby={
                fields.displayName ? "profile-name-error" : undefined
              }
            />
            {fields.displayName && (
              <small id="profile-name-error" className="wedding-error">
                {fields.displayName}
              </small>
            )}
            <label htmlFor="profile-email">Account email</label>
            <input
              id="profile-email"
              type="email"
              autoComplete="email"
              value={user.email}
              readOnly
              aria-describedby="profile-email-help"
            />
            <small id="profile-email-help">
              Email changes aren’t available yet.
            </small>
            <div className="profile-actions">
              {nameMessage && <p role="status">{nameMessage}</p>}
              <button type="submit" className="primary-action">
                {busy === "name" ? "Saving name…" : "Save name"}
              </button>
            </div>
          </fieldset>
        </form>
        <form
          className="profile-card"
          onSubmit={(event) => void save(event, "password")}
          noValidate
          aria-busy={busy === "password"}
        >
          <div className="profile-card-title">
            <span aria-hidden="true">02</span>
            <div>
              <h2>Change password</h2>
              <p>
                Other devices will be signed out. You’ll stay signed in here.
              </p>
            </div>
          </div>
          <fieldset disabled={!!busy}>
            {(
              [
                ["currentPassword", "Current password"],
                ["newPassword", "New password"],
                ["confirmPassword", "Confirm new password"],
              ] as const
            ).map(([key, label]) => (
              <div className="profile-password" key={key}>
                <label htmlFor={`profile-${key}`}>{label}</label>
                <div className="profile-password-input">
                  <input
                    id={`profile-${key}`}
                    name={key}
                    type={visible[key] ? "text" : "password"}
                    value={passwords[key]}
                    onChange={(event) => {
                      setPasswordMessage("");
                      setPasswords((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }));
                      setFields((current) => ({ ...current, [key]: "" }));
                    }}
                    autoComplete={
                      key === "currentPassword"
                        ? "current-password"
                        : "new-password"
                    }
                    maxLength={128}
                    required
                    aria-invalid={!!fields[key]}
                    aria-describedby={
                      [
                        fields[key] ? `profile-${key}-error` : "",
                        key === "newPassword" ? "profile-password-hint" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  />
                  <button
                    type="button"
                    aria-label={`${visible[key] ? "Hide" : "Show"} ${label.toLowerCase()}`}
                    aria-controls={`profile-${key}`}
                    aria-pressed={!!visible[key]}
                    onClick={() =>
                      setVisible((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                  >
                    {visible[key] ? "Hide" : "Show"}
                  </button>
                </div>
                {key === "newPassword" && (
                  <small id="profile-password-hint">{newPasswordHint}</small>
                )}
                {fields[key] && (
                  <small id={`profile-${key}-error`} className="wedding-error">
                    {fields[key]}
                  </small>
                )}
              </div>
            ))}
            <div className="profile-actions">
              {passwordMessage && <p role="status">{passwordMessage}</p>}
              <button type="submit" className="primary-action">
                {busy === "password" ? "Changing password…" : "Change password"}
              </button>
            </div>
          </fieldset>
        </form>
        <Link href="/weddings" className="profile-back">
          ← Your weddings
        </Link>
      </div>
      <dialog
        ref={dialog}
        className="team-dialog"
        aria-labelledby="profile-leave-title"
      >
        <h2 id="profile-leave-title">Leave unsaved changes?</h2>
        <p>Your account edits haven’t been saved.</p>
        <div className="team-result-actions">
          <button
            className="secondary-action"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            Stay
          </button>
          <button
            className="primary-action"
            onClick={() => {
              dirty.current = false;
              dialog.current?.close();
              router.push(destination.current);
            }}
          >
            Discard and continue
          </button>
        </div>
      </dialog>
    </main>
  );
}
