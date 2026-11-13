"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useWeddingScope } from "./wedding-scope";
import "./wedding-selector.css";

export function WeddingHeader({ displayName }: { displayName: string }) {
  const scope = useWeddingScope();
  const [open, setOpen] = useState(false);
  const [weddings, setWeddings] = useState<
    { id: string; title: string; role: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const options = { cache: "no-store", signal: controller.signal } as const;
    Promise.all([
      fetch("/api/v1/weddings?limit=100", options),
      scope ? scope.fetch("/api/v1/wedding", options) : Promise.resolve(null),
    ])
      .then(async ([response, current]) => {
        if (!response.ok) throw new Error();
        const body = await response.json();
        const selected = current?.ok ? (await current.json()).data : null;
        if (!controller.signal.aborted) {
          const cards = body.data as {
            id: string;
            title: string;
            role: string;
          }[];
          if (
            selected &&
            !cards.some((card) => card.id === selected.wedding.id)
          )
            cards.unshift({
              id: selected.wedding.id,
              title: selected.wedding.title,
              role: selected.role,
            });
          setWeddings(cards);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Couldn’t load weddings. Use Your weddings to try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      controller.abort();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, scope]);
  async function signOut() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": (await csrf.json()).data.token },
      });
      if (!response.ok) throw new Error();
      // Discard prefetched authenticated pages after session revocation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setError("Couldn’t sign out. Please try again.");
      setBusy(false);
      lock.current = false;
    }
  }
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <header className="wedding-header">
      <Link
        className="wedding-brand"
        href="/weddings"
        aria-label="Make My Event — Your weddings"
      >
        <Image src="/brand-mark.png" alt="" width={36} height={36} />
        <div>
          <strong>MAKE MY EVENT</strong>
          <span>Celebrate together</span>
        </div>
      </Link>
      <div
        className="account-dropdown"
        ref={panel}
        onBlur={(event) => {
          if (
            event.relatedTarget &&
            !event.currentTarget.contains(event.relatedTarget as Node)
          )
            setOpen(false);
        }}
      >
        <button
          ref={trigger}
          className="account-trigger"
          aria-label="Account menu"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setLoading(true);
            setOpen((value) => !value);
          }}
        >
          <span className="account-avatar" aria-hidden="true">
            {initials || "ME"}
          </span>
          <strong>{displayName}</strong>
          <span
            aria-hidden="true"
            className={open ? "chevron is-open" : "chevron"}
          >
            ⌄
          </span>
        </button>
        {open && (
          <nav
            id={id}
            className="account-popover"
            aria-label="Choose wedding"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <Link
              href="/account"
              className="account-panel-heading"
              aria-label="Your account profile"
            >
              <strong>{displayName}</strong>
              <span>Your account</span>
            </Link>
            <div className="account-menu-group">
              <p>YOUR WEDDINGS</p>
              {loading && <span role="status">Loading weddings…</span>}
              {weddings.map((wedding) => (
                <Link
                  key={wedding.id}
                  href={`/weddings/${wedding.id}`}
                  aria-current={
                    scope?.weddingId === wedding.id ? "page" : undefined
                  }
                >
                  <span>{wedding.title}</span>
                  <small>
                    {wedding.role === "ADMIN" ? "Administrator" : "Organizer"}
                    {scope?.weddingId === wedding.id ? " · Current" : ""}
                  </small>
                </Link>
              ))}
            </div>
            <div className="account-menu-group">
              <Link href="/weddings">
                Your weddings <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/weddings/new">Create wedding</Link>
              <Link href="/weddings/join">Join with code</Link>
            </div>
            <div className="account-menu-group">
              <button onClick={() => void signOut()} disabled={busy}>
                {busy ? "Signing out…" : "Sign out"}
                <span aria-hidden="true">↪</span>
              </button>
            </div>
            {error && (
              <p role="alert" className="account-menu-error">
                {error}
              </p>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
