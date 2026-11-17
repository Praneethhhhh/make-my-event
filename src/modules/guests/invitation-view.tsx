"use client";
import { BrandLockup } from "@/modules/experience/brand-lockup";
import { UiIcon } from "@/modules/experience/ui-icon";
import { useEffect, useRef, useState } from "react";
import { functionColor } from "@/modules/functions/function-colors";
import type { Invitation, GuestFunction } from "./guest-types";
import "./guests.css";
function Flower() {
  return (
    <svg viewBox="0 0 50 50" aria-hidden="true">
      <g fill="var(--color-primary)">
        <path d="M20 0h10v10H20zM0 20h10v10H0zM40 20h10v10H40zM20 40h10v10H20z" />
      </g>
      <g fill="var(--color-accent)">
        <path d="M10 10h10v10H10zM30 10h10v10H30zM10 30h10v10H10zM30 30h10v10H30z" />
      </g>
      <path fill="var(--color-primary)" d="M20 20h10v10H20z" />
    </svg>
  );
}
export function InvitationView({
  data,
  preview = false,
  onSave,
  onDirty,
}: {
  data: Invitation;
  preview?: boolean;
  onDirty?: (id: string) => void;
  onSave?: (
    id: string,
    status: "ACCEPTED" | "DECLINED",
    count: number,
    revision: number,
    key: string,
  ) => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.parse(data.serverTime));
  useEffect(() => {
    const delta = Date.parse(data.serverTime) - Date.now();
    const timer = setInterval(() => setNow(Date.now() + delta), 1000);
    return () => clearInterval(timer);
  }, [data.serverTime]);
  return (
    <article className="invitation-paper">
      <span className="invitation-flower left">
        <Flower />
      </span>
      <span className="invitation-flower right">
        <Flower />
      </span>
      <header className="invitation-hero">
        <span className="invitation-brand">
          <BrandLockup mark={false} />
        </span>
        <p className="invitation-eyebrow">Together with our families</p>
        <h1>
          {data.coupleNames.first}
          <em>&amp;</em>
          {data.coupleNames.second}
        </h1>
        <p>
          {new Intl.DateTimeFormat("en-IN", {
            dateStyle: "long",
            timeZone: "UTC",
          }).format(new Date(data.startsOn + "T00:00:00Z"))}
          {data.endsOn !== data.startsOn
            ? ` — ${new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" }).format(new Date(data.endsOn + "T00:00:00Z"))}`
            : ""}
        </p>
        <span className="invitation-heart" aria-hidden="true">
          <UiIcon name="heart" size={24} />
        </span>
      </header>
      <div className="invitation-greeting">
        <h2>Dear {data.displayName},</h2>
        <p>{data.personalMessage || "We would love to celebrate with you."}</p>
      </div>
      <div className="invitation-celebrations">
        {data.functions.map((f, index) => (
          <FunctionResponse
            key={`${f.invitationId ?? f.id}:${f.revision}`}
            fn={f}
            timeZone={data.timeZone}
            now={now}
            preview={preview}
            initiallyOpen={index === 0}
            {...(onDirty ? { onDirty } : {})}
            {...(onSave ? { onSave } : {})}
          />
        ))}
        {!data.functions.length && (
          <div className="invitation-empty">
            <h2>Your celebration details are being prepared</h2>
            <p>Please contact your hosts for an update.</p>
          </div>
        )}
      </div>
      <footer className="invitation-footer">
        <p>With love,</p>
        <h2>
          {data.coupleNames.first} &amp; {data.coupleNames.second}
        </h2>
      </footer>
    </article>
  );
}
function FunctionResponse({
  fn,
  timeZone,
  now,
  preview,
  initiallyOpen,
  onSave,
  onDirty,
}: {
  fn: GuestFunction;
  timeZone: string;
  now: number;
  preview: boolean;
  initiallyOpen: boolean;
  onDirty?: (id: string) => void;
  onSave?: (
    id: string,
    status: "ACCEPTED" | "DECLINED",
    count: number,
    revision: number,
    key: string,
  ) => Promise<void>;
}) {
  const [status, setStatus] = useState(fn.status),
    [count, setCount] = useState(fn.attendeeCount || 1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(!!fn.respondedAt),
    [key, setKey] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(initiallyOpen);
  const lock = useRef(false);
  const locked = now >= Date.parse(fn.deadlineAt),
    started = now >= Date.parse(fn.startsAt),
    ended = fn.endsAt && now >= Date.parse(fn.endsAt),
    minutes = Math.max(0, Math.floor((Date.parse(fn.startsAt) - now) / 60000)),
    days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    mins = minutes % 60;
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(value));
  const venue = fn.venue,
    hasVenue = !!(
      venue.name ||
      venue.address ||
      venue.city ||
      venue.mapUrl ||
      venue.latitude !== null
    ),
    maps =
      venue.mapUrl ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.latitude !== null && venue.longitude !== null ? `${venue.latitude},${venue.longitude}` : [venue.name, venue.address, venue.city, venue.state].filter(Boolean).join(", "))}`;
  const changed = () => {
    onDirty?.(fn.invitationId ?? fn.id);
    setSaved(false);
    setError("");
    setKey(crypto.randomUUID());
  };
  return (
    <section
      className="invitation-function"
      style={{ borderTopColor: functionColor(fn.color).hex }}
    >
      <header>
        <div>
          <h2>{fn.name}</h2>
          <p>
            {format(fn.startsAt)}
            {fn.endsAt
              ? ` – ${new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone }).format(new Date(fn.endsAt))}`
              : ""}
          </p>
          <small>{timeZone}</small>
        </div>
        <div className="invitation-function-meta">
          <span
            className="invitation-countdown"
            aria-label={`${fn.name} countdown`}
          >
            {ended
              ? "Celebrated"
              : started
                ? "Happening now"
                : `${days}d ${hours}h ${mins}m`}
          </span>
          <span className={`guest-status ${fn.status.toLowerCase()}`}>
            {fn.status === "ACCEPTED"
              ? `Attending · ${fn.attendeeCount}`
              : fn.status === "DECLINED"
                ? "Not attending"
                : "Awaiting reply"}
          </span>
        </div>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            lock.current ||
            busy ||
            preview ||
            locked ||
            status === "PENDING" ||
            !onSave ||
            !fn.invitationId
          )
            return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await onSave(
              fn.invitationId,
              status,
              status === "ACCEPTED" ? count : 0,
              fn.revision,
              key,
            );
            setSaved(true);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not save. Your response is still here.",
            );
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={preview || busy || locked}>
          <legend className="sr-only">Response for {fn.name}</legend>
          <div className="invitation-response-row">
            <div className="invitation-response-buttons">
              <button
                type="button"
                aria-pressed={status === "ACCEPTED"}
                onClick={() => {
                  setStatus("ACCEPTED");
                  changed();
                }}
              >
                Will attend
              </button>
              <button
                type="button"
                aria-pressed={status === "DECLINED"}
                onClick={() => {
                  setStatus("DECLINED");
                  changed();
                }}
              >
                Cannot attend
              </button>
            </div>
            {status === "ACCEPTED" && (
              <label className="invitation-stepper">
                People attending{" "}
                <span>
                  <button
                    type="button"
                    aria-label={`Fewer people for ${fn.name}`}
                    disabled={preview || busy || locked || count <= 1}
                    onClick={() => {
                      setCount((c) => Math.max(1, c - 1));
                      changed();
                    }}
                  >
                    −
                  </button>
                  <input
                    aria-label={`People attending ${fn.name}`}
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={count}
                    onChange={(e) => {
                      setCount(Number(e.target.value));
                      changed();
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`More people for ${fn.name}`}
                    disabled={preview || busy || locked || count >= 200}
                    onClick={() => {
                      setCount((c) => c + 1);
                      changed();
                    }}
                  >
                    +
                  </button>
                </span>
              </label>
            )}
          </div>
          {!preview && !locked && (
            <button
              className="primary-action invitation-save"
              disabled={busy || status === "PENDING"}
            >
              {busy ? "Saving…" : "Save response"}
            </button>
          )}
        </fieldset>
        {locked && !preview && (
          <p className="invitation-response-note">
            Replies closed · Please contact your hosts for changes.
          </p>
        )}
        {error && (
          <p role="alert" className="guest-error">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="guest-success">
            Response saved.
          </p>
        )}
      </form>
      <div className="invitation-venue">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ⌖ Venue &amp; directions{" "}
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        {open && (
          <div className="invitation-venue-details">
            {hasVenue ? (
              <>
                <h3>{venue.name || "Venue"}</h3>
                <p>
                  {[venue.address, venue.city, venue.state]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <a
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Open in Google Maps <UiIcon name="arrow-up-right" />
                </a>
              </>
            ) : (
              <p>Venue details will be shared soon.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
