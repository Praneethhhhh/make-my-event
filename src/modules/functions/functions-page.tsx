"use client";
import { useWeddingClient } from "@/modules/weddings/wedding-scope";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { WorkspaceNav } from "@/modules/weddings/workspace-nav";
import {
  localDateTime,
  localDateTimeToUtc,
} from "@/modules/weddings/zoned-date";
import { functionInput, type FunctionDto } from "./function-validation";
import "@/modules/weddings/wedding.css";
import "./functions.css";
import { functionColors, functionColor } from "./function-colors";

export function FunctionsPage() {
  const { fetch, markClean } = useWeddingClient();
  const router = useRouter();
  const [context, setContext] = useState<{
    displayName: string;
    title: string;
    timeZone: string;
    startsOn: string;
    endsOn: string;
    revision: number;
  } | null>(null);
  const [functions, setFunctions] = useState<FunctionDto[]>([]);
  const [editing, setEditing] = useState<FunctionDto | null>(null);
  const [version, setVersion] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formZone, setFormZone] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const options = { cache: "no-store", signal: controller.signal } as const;
    Promise.all([
      fetch("/api/v1/auth/me", options),
      fetch("/api/v1/wedding", options),
      fetch("/api/v1/functions", options),
    ])
      .then(async ([me, wedding, list]) => {
        if (controller.signal.aborted) return;
        if (me.status === 401) return router.replace("/sign-in");
        if (wedding.status === 404) return undefined;
        if (!me.ok || !wedding.ok || !list.ok) throw new Error();
        const profile = (await wedding.json()).data.wedding;
        const account = (await me.json()).data;
        const items = (await list.json()).data.functions;
        if (controller.signal.aborted) return;
        setError("");
        setContext({
          displayName: account.user.displayName,
          title: profile.title,
          timeZone: profile.timeZone,
          startsOn: profile.startsOn,
          endsOn: profile.endsOn,
          revision: profile.revision,
        });
        setFunctions(items);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load functions. Reload the page to try again.");
      });
    return () => controller.abort();
  }, [router, fetch]);

  function changeForm(item: FunctionDto | null) {
    setFormZone(context?.timeZone ?? null);
    setEditing(item);
    setVersion((value) => value + 1);
    setFields({});
    setError("");
    setNotice("");
    setTimeout(
      () => formRef.current?.querySelector<HTMLInputElement>("input")?.focus(),
      0,
    );
  }
  async function remove(item: FunctionDto) {
    if (
      lock.current ||
      !window.confirm(
        `Remove ${item.name} from the schedule? It will be archived, preserving its history and linked records.`,
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(`/api/v1/functions/${item.id}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": (await csrf.json()).data.token,
        },
        body: JSON.stringify({ revision: item.revision }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message || "Could not remove this function.");
        return;
      }
      setFunctions((current) =>
        current.filter((value) => value.id !== item.id),
      );
      if (editing?.id === item.id) {
        setEditing(null);
        setVersion((value) => value + 1);
        setFields({});
      }
      setNotice(
        "Function removed from the schedule. Its history is preserved.",
      );
    } catch {
      setError("Could not remove the function. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function showErrors(next: Record<string, string>) {
    setFields(next);
    setError("Check the highlighted fields and try again.");
    const name = Object.keys(next)[0];
    const named = name ? formRef.current?.elements.namedItem(name) : null;
    const control =
      named instanceof RadioNodeList
        ? (named.item(0) as HTMLElement)
        : (named as HTMLElement | null);
    const disclosure = control?.closest("details");
    if (disclosure) disclosure.open = true;
    control?.focus();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !context) return;
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    const times: Record<string, string | null> = {};
    for (const key of ["startsAt", "endsAt"]) {
      if (!value(key) && key === "endsAt") {
        times[key] = null;
        continue;
      }
      if (
        value(key) &&
        (value(key).slice(0, 10) < context.startsOn ||
          value(key).slice(0, 10) > context.endsOn)
      ) {
        showErrors({
          [key]: `Choose a time between ${context.startsOn} and ${context.endsOn} in ${context.timeZone}.`,
        });
        return;
      }
      try {
        times[key] = localDateTimeToUtc(value(key), context.timeZone);
      } catch (cause) {
        showErrors({
          [key]: cause instanceof Error ? cause.message : "Enter a valid time.",
        });
        return;
      }
    }
    const parsed = functionInput.safeParse({
      name: value("name"),
      color: value("color"),
      description: value("description"),
      ...times,
      venue: {
        name: value("venue.name"),
        address: value("venue.address"),
        city: value("venue.city"),
        state: value("venue.state"),
        latitude: value("venue.latitude")
          ? Number(value("venue.latitude"))
          : null,
        longitude: value("venue.longitude")
          ? Number(value("venue.longitude"))
          : null,
        mapUrl: value("venue.mapUrl"),
        directionsNotes: value("venue.directionsNotes"),
      },
      dressCode: value("dressCode"),
      guestInstructions: value("guestInstructions"),
    });
    if (!parsed.success) {
      showErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setFields({});
    setNotice("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(
        "/api/v1/functions" + (editing ? "/" + editing.id : ""),
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": (await csrf.json()).data.token,
          },
          body: JSON.stringify({
            ...parsed.data,
            weddingRevision: context.revision,
            ...(editing ? { revision: editing.revision } : {}),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        if (
          body.error?.code === "STALE_WEDDING_SCHEDULE" &&
          body.error.details?.wedding
        ) {
          setFormZone((current) => current ?? context.timeZone);
          setContext((current) =>
            current ? { ...current, ...body.error.details.wedding } : current,
          );
          setError(body.error.message);
          return;
        }
        if (body.error?.details?.fields) showErrors(body.error.details.fields);
        else setError(body.error?.message || "Could not save function.");
        return;
      }
      const saved: FunctionDto = body.data.function;
      markClean();
      setFunctions((current) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort(
          (a, b) => a.startsAt.localeCompare(b.startsAt),
        ),
      );
      setEditing(null);
      setVersion((value) => value + 1);
      setNotice("Function saved.");
    } catch {
      setError(
        "Could not reach the server. Your entries are preserved; try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (!context)
    return (
      <main className="wedding-page">
        <p className="loading-state" role={error ? "alert" : undefined}>
          {error || "Loading functions…"}
        </p>
      </main>
    );
  const format = (instant: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: context.timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(instant));
  function field(
    name: string,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      area?: boolean;
      max?: number;
    } = {},
  ) {
    const venueKey = name.split(".")[1] as
      keyof FunctionDto["venue"] | undefined;
    const raw = editing
      ? venueKey
        ? editing.venue[venueKey]
        : editing[name as keyof FunctionDto]
      : "";
    const initial =
      (name === "startsAt" || name === "endsAt") && raw
        ? localDateTime(String(raw), formZone ?? context!.timeZone)
        : (raw ?? "");
    const id = "function-" + name.replaceAll(".", "-");
    const props = {
      id,
      name,
      defaultValue: String(initial),
      required: options.required,
      "aria-invalid": !!fields[name],
      "aria-describedby": fields[name] ? id + "-error" : undefined,
      maxLength: options.max ?? 2000,
    };
    return (
      <div className="wedding-field">
        <label htmlFor={id}>
          {label}
          {options.required ? " *" : ""}
        </label>
        {options.area ? (
          <textarea {...props} />
        ) : (
          <input
            {...props}
            type={options.type ?? "text"}
            min={
              options.type === "datetime-local"
                ? context!.startsOn + "T00:00"
                : undefined
            }
            max={
              options.type === "datetime-local"
                ? context!.endsOn + "T23:59"
                : undefined
            }
            step={options.type === "number" ? "any" : undefined}
          />
        )}
        {fields[name] && (
          <small id={id + "-error"} className="wedding-error">
            {fields[name]}
          </small>
        )}
      </div>
    );
  }
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={context.displayName} />
      <WorkspaceNav active="functions" />
      <div className="functions-workspace">
        <header className="functions-heading">
          <p>{context.title}</p>
          <h1>Wedding functions</h1>
          <p>
            All times in {context.timeZone}. Bring each part of your celebration
            together.
          </p>
        </header>
        <div className="functions-columns">
          <section className="function-list" aria-label="Scheduled functions">
            <h2>
              Scheduled functions <span>({functions.length})</span>
            </h2>
            {!functions.length && (
              <article className="function-tile empty-functions">
                <span aria-hidden="true">✦</span>
                <h3>Your celebration starts here</h3>
                <p>Add your first function, from Haldi to the Reception.</p>
              </article>
            )}
            {functions.map((item) => (
              <article
                className="function-tile"
                key={item.id}
                style={{ borderTopColor: functionColor(item.color).hex }}
              >
                <p className="function-status">SCHEDULED</p>
                <h3>
                  <span
                    className="function-color-dot"
                    aria-hidden="true"
                    style={{ background: functionColor(item.color).hex }}
                  />
                  {item.name}
                </h3>
                <p>
                  {format(item.startsAt)}
                  {item.endsAt ? " – " + format(item.endsAt) : ""}
                </p>
                {item.venue.name && <p>⌖ {item.venue.name}</p>}
                {item.description && <p>{item.description}</p>}
                {item.dressCode && (
                  <p>
                    <strong>Dress code:</strong> {item.dressCode}
                  </p>
                )}
                {item.guestInstructions && <p>{item.guestInstructions}</p>}
                <button
                  type="button"
                  className="secondary-action"
                  disabled={busy}
                  onClick={() => changeForm(item)}
                  aria-label={`Edit ${item.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="secondary-action remove-function"
                  disabled={busy}
                  onClick={() => remove(item)}
                  aria-label={`Remove ${item.name}`}
                >
                  Remove
                </button>
              </article>
            ))}
          </section>
          <form
            ref={formRef}
            key={version}
            className="function-editor"
            onSubmit={save}
            noValidate
            onChange={(event) => {
              const target = event.target;
              if (!(
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement
              ))
                return;
              const name = target.name;
              setFields((current) => {
                const next = { ...current };
                delete next[name];
                return next;
              });
              setError("");
              setNotice("");
            }}
            aria-busy={busy}
          >
            <h2>{editing ? "Edit function" : "Add a function"}</h2>
            <p className="zone-notice">
              Wedding time zone: <strong>{context.timeZone}</strong>
            </p>
            <p className="field-help">
              Functions must fall between {context.startsOn} and{" "}
              {context.endsOn}, including both dates.
            </p>
            {field("name", "Function name", { required: true, max: 120 })}
            <fieldset
              className="function-color-picker"
              aria-describedby={
                fields.color ? "function-color-error" : "function-color-help"
              }
              aria-invalid={!!fields.color}
            >
              <legend>Function color *</legend>
              <p id="function-color-help">
                Choose an accent for this function’s card.
              </p>
              <div className="function-color-options">
                {functionColors.map((color) => (
                  <label key={color.value} className="function-color-option">
                    <input
                      type="radio"
                      name="color"
                      value={color.value}
                      defaultChecked={editing?.color === color.value}
                      required
                    />
                    <span
                      className="color-swatch"
                      style={{ background: color.hex }}
                      aria-hidden="true"
                    >
                      <span>✓</span>
                    </span>
                    <span>{color.label}</span>
                  </label>
                ))}
              </div>
              {fields.color && (
                <p className="wedding-error" id="function-color-error">
                  {fields.color}
                </p>
              )}
            </fieldset>
            {field("description", "Description", { area: true })}
            <div className="field-row">
              {field("startsAt", "Start date and time", {
                type: "datetime-local",
                required: true,
              })}
              {field("endsAt", "End date and time", { type: "datetime-local" })}
            </div>
            <p className="field-help">
              End time is optional. Dates and times use the wedding time zone
              above.
            </p>
            <details open={!!editing?.venue.name}>
              <summary>
                Venue and directions <span>Optional</span>
              </summary>
              {field("venue.name", "Venue name", { max: 160 })}
              {field("venue.address", "Street address", { max: 500 })}
              <div className="field-row">
                {field("venue.city", "City", { max: 120 })}
                {field("venue.state", "State", { max: 120 })}
              </div>
              <div className="field-row">
                {field("venue.latitude", "Latitude", { type: "number" })}
                {field("venue.longitude", "Longitude", { type: "number" })}
              </div>
              {field("venue.mapUrl", "Google Maps directions URL", {
                type: "url",
              })}
              {field("venue.directionsNotes", "Arrival and parking notes", {
                area: true,
                max: 1000,
              })}
            </details>
            {field("dressCode", "Dress code", { max: 300 })}
            {field("guestInstructions", "Guest instructions", { area: true })}
            {error && (
              <p role="alert" className="wedding-error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="save-notice">
                {notice}
              </p>
            )}
            <div className="function-form-actions">
              <button className="primary-action" disabled={busy}>
                {busy ? "Saving…" : "Save function"}
              </button>
              <button
                type="button"
                className="secondary-action"
                disabled={busy}
                onClick={() => changeForm(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
