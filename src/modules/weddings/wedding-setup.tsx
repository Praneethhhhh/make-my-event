"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { weddingInput } from "./wedding-validation";
import { WeddingHeader } from "./wedding-shell";
import "./wedding.css";
import { WorkspaceNav } from "./workspace-nav";
import Link from "next/link";
import type { z } from "zod";

const traditions = [
  ["HINDU", "Hindu"],
  ["SIKH", "Sikh"],
  ["MUSLIM", "Muslim"],
  ["CHRISTIAN", "Christian"],
  ["INTERFAITH", "Interfaith"],
  ["CIVIL", "Civil"],
  ["OTHER", "Other"],
] as const;

const commonTimeZones = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

export function WeddingSetup({ editing = false }: { editing?: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [existing, setExisting] = useState<
    (z.infer<typeof weddingInput> & { revision: number }) | null
  >(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/v1/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return router.replace("/sign-in");
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (body.data.membership && !editing) return router.replace("/wedding");
        if (editing) {
          if (!body.data.membership) return router.replace("/wedding/setup");
          const current = await fetch("/api/v1/wedding", { cache: "no-store" });
          if (!current.ok) throw new Error();
          const wedding = (await current.json()).data.wedding;
          setExisting(wedding);
          setDescription(wedding.description ?? "");
        }
        setDisplayName(body.data.user.displayName);
      })
      .catch(() => setError("Could not load wedding setup. Try again."));
  }, [router, editing]);

  function clearField(name: string) {
    setFields((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setError("");
    setNotice("");
  }

  async function signOut() {
    setBusy(true);
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": (await csrf.json()).data.token },
      });
      if (!response.ok) throw new Error();
      router.replace("/");
    } catch {
      setError("Could not sign out. Try again.");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const tradition = String(data.get("tradition") ?? "");
    const payload = {
      title: data.get("title"),
      coupleNames: {
        first: data.get("coupleNames.first"),
        second: data.get("coupleNames.second"),
      },
      ...(tradition ? { tradition } : {}),
      startsOn: data.get("startsOn"),
      endsOn: data.get("endsOn"),
      timeZone: data.get("timeZone"),
      ...(description.trim() ? { description } : {}),
    };
    const parsed = weddingInput.safeParse(payload);
    if (!parsed.success) {
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
      setError("Check the highlighted fields and try again.");
      const first = form.elements.namedItem(
        parsed.error.issues[0]?.path.join(".") ?? "",
      ) as HTMLElement | null;
      first?.focus();
      return;
    }
    setFields({});
    setError("");
    setBusy(true);
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(
        editing ? "/api/v1/wedding" : "/api/v1/weddings",
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": (await csrf.json()).data.token,
          },
          body: JSON.stringify({
            ...parsed.data,
            ...(editing ? { revision: existing?.revision } : {}),
          }),
        },
      );
      const body = await response.json();
      if (response.ok) {
        if (!editing) return router.push("/wedding/created");
        setExisting(body.data.wedding);
        setNotice("Wedding details saved.");
        return;
      }
      setFields(body.error?.details?.fields ?? {});
      setError(body.error?.message ?? "Could not create the wedding.");
    } catch {
      setError("Could not reach wedding setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!displayName)
    return (
      <main className="wedding-page">
        <p className="loading-state" role={error ? "alert" : undefined}>
          {error || "Loading wedding setup…"}
        </p>
      </main>
    );

  return (
    <main className="wedding-page">
      <WeddingHeader displayName={displayName} />
      {editing && <WorkspaceNav active="details" />}
      {!editing && (
        <div className="wedding-progress" aria-label="Setup progress">
          <span>✓ Account created</span>
          <i>•</i>
          <strong>Wedding setup</strong>
        </div>
      )}
      <section className="wedding-intro">
        <p>{editing ? "YOUR CELEBRATION" : "WEDDING SETUP"}</p>
        <h1>{editing ? "Wedding details" : "Create your wedding"}</h1>
        <span>
          {editing
            ? "Keep your celebration information up to date."
            : "Start with the essentials. You can add functions, venues and your organizing team next."}
        </span>
      </section>
      <form
        className="wedding-card"
        onSubmit={submit}
        noValidate
        aria-busy={busy}
      >
        <div className="wedding-fields">
          <p className="required-note">* Required fields</p>
          <Field
            label="Wedding title"
            name="title"
            error={fields.title}
            required
            onChange={clearField}
            placeholder="Pavithra & Manish’s Wedding"
            defaultValue={existing?.title}
            help="This name will appear on invitations and your family schedule."
          />
          <div className="field-row">
            <Field
              label="First partner or host"
              name="coupleNames.first"
              error={fields["coupleNames.first"]}
              required
              onChange={clearField}
              placeholder="Pavithra"
              defaultValue={existing?.coupleNames.first}
            />
            <Field
              label="Second partner or host"
              name="coupleNames.second"
              error={fields["coupleNames.second"]}
              required
              onChange={clearField}
              placeholder="Manish"
              defaultValue={existing?.coupleNames.second}
            />
          </div>
          <label className="wedding-field">
            <span>
              Wedding style or tradition <em>Optional</em>
            </span>
            <select
              name="tradition"
              defaultValue={existing?.tradition ?? ""}
              onChange={() => clearField("tradition")}
            >
              <option value="">Choose an option</option>
              {traditions.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <Field
              label="Start date"
              name="startsOn"
              type="date"
              defaultValue={existing?.startsOn}
              error={fields.startsOn}
              required
              onChange={clearField}
            />
            <Field
              label="End date"
              name="endsOn"
              type="date"
              defaultValue={existing?.endsOn}
              error={fields.endsOn}
              required
              onChange={clearField}
            />
          </div>
          <p className="field-help">
            For multi-day celebrations, select the first and concluding dates.
          </p>
          <Field
            label="Wedding time zone"
            name="timeZone"
            error={fields.timeZone}
            required
            onChange={clearField}
            defaultValue={existing?.timeZone ?? "Asia/Kolkata"}
            list="wedding-time-zones"
            help="Used for ceremony times, reminders and the family schedule. Enter an IANA time zone."
          />
          <datalist id="wedding-time-zones">
            {commonTimeZones.map((timeZone) => (
              <option value={timeZone} key={timeZone} />
            ))}
          </datalist>
          <div className="wedding-field">
            <label htmlFor="wedding-description">
              Short description <em>Optional</em>
            </label>
            <textarea
              id="wedding-description"
              name="description"
              aria-invalid={!!fields.description}
              aria-describedby={
                fields.description
                  ? "wedding-description-error"
                  : "wedding-description-count"
              }
              maxLength={500}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                clearField("description");
              }}
              placeholder="Add a short welcome note or describe the celebration…"
            />
            <small className="counter" id="wedding-description-count">
              {description.length} / 500
            </small>
            {fields.description && (
              <small id="wedding-description-error" className="wedding-error">
                {fields.description}
              </small>
            )}
          </div>
        </div>
        <aside className="next-panel">
          {editing ? (
            <>
              <h2>Keep everyone in sync</h2>
              <p>Update the essentials as your plans take shape.</p>
              <p>
                Changing the wedding time zone preserves existing function
                instants. Their displayed local times will change; review each
                function afterward.
              </p>
              <Link href="/wedding/functions">Review functions →</Link>
            </>
          ) : (
            <>
              <h2>What happens next?</h2>
              <ol>
                <li>
                  <b>1</b>
                  <div>
                    <strong>Create ceremonies and functions</strong>
                    <span>
                      Add Haldi, Sangeet, Wedding and Reception timings.
                    </span>
                  </div>
                </li>
                <li>
                  <b>2</b>
                  <div>
                    <strong>Add venue details</strong>
                    <span>
                      Attach addresses, directions and arrival instructions.
                    </span>
                  </div>
                </li>
                <li>
                  <b>3</b>
                  <div>
                    <strong>Invite family organizers</strong>
                    <span>
                      Give trusted relatives private coordination access.
                    </span>
                  </div>
                </li>
              </ol>
              <p>You’ll configure these after creating your wedding.</p>
            </>
          )}
        </aside>
        <div
          className={
            editing ? "wedding-actions profile-edit-actions" : "wedding-actions"
          }
        >
          <button
            type="button"
            className="secondary-action"
            onClick={signOut}
            disabled={busy}
          >
            Sign out
          </button>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {editing && (
            <Link href="/wedding" className="secondary-action">
              Cancel
            </Link>
          )}
          <button type="submit" className="primary-action" disabled={busy}>
            {busy
              ? editing
                ? "Saving changes…"
                : "Creating wedding…"
              : editing
                ? "Save changes"
                : "Create wedding →"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  error,
  required,
  onChange,
  help,
  ...input
}: {
  label: string;
  name: string;
  error?: string | undefined;
  required?: boolean;
  onChange: (name: string) => void;
  help?: string | undefined;
  placeholder?: string | undefined;
  type?: string | undefined;
  defaultValue?: string | undefined;
  list?: string | undefined;
}) {
  const errorId = name.replace(".", "-") + "-error";
  return (
    <div className="wedding-field">
      <label htmlFor={name}>
        {label} {required && <b>*</b>}
      </label>
      <input
        {...input}
        name={name}
        id={name}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onChange={() => onChange(name)}
      />
      {help && <small>{help}</small>}
      {error && (
        <small id={errorId} className="wedding-error">
          {error}
        </small>
      )}
    </div>
  );
}
