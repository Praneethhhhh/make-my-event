"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { WeddingHeader } from "./wedding-shell";
import "./wedding.css";
import "./wedding-selector.css";
import "@/modules/team/team.css";
type Card = {
  id: string;
  title: string;
  coupleNames: { first: string; second: string };
  startsOn: string;
  endsOn: string;
  timeZone: string;
  role: "ADMIN" | "ORGANIZER";
};
export function WeddingSelector() {
  const [name, setName] = useState("Your family");
  const [cards, setCards] = useState<Card[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/v1/auth/me", {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`/api/v1/weddings?search=${encodeURIComponent(search)}`, {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([me, list]) => {
        if (me.status === 401 || list.status === 401) {
          window.location.replace("/sign-in");
          return;
        }
        if (!me.ok || !list.ok) throw new Error();
        const result = await list.json();
        const account = (await me.json()).data.user;
        if (controller.signal.aborted) return;
        setName(account.displayName);
        setCards(result.data);
        setCursor(result.page.nextCursor);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Couldn’t load your weddings. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [search, version]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/weddings?search=${encodeURIComponent(search)}&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        window.location.replace("/sign-in");
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json();
      setCards((current) => [...current, ...result.data]);
      setCursor(result.page.nextCursor);
    } catch {
      setError("Couldn’t load the next page. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": (await csrf.json()).data.token },
      });
      if (!response.ok) throw new Error();
      window.location.replace("/");
    } catch {
      setError("Couldn’t sign out. Try again.");
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setCards([]);
    setCursor(null);
    setSearch(query.trim());
    setVersion((value) => value + 1);
  }
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={name} />
      <section className="wedding-selector">
        <div className="selector-heading">
          <div>
            <p>YOUR CELEBRATIONS</p>
            <h1>Your weddings</h1>
            <p>Choose a wedding to plan with its organizing team.</p>
          </div>
          <div className="selector-actions">
            <Link className="primary-action" href="/weddings/new">
              Create wedding
            </Link>
            <Link className="secondary-action" href="/weddings/join">
              Join with code
            </Link>
            <button
              className="secondary-action"
              onClick={() => void signOut()}
              disabled={busy}
            >
              Sign out
            </button>
          </div>
        </div>
        <form className="selector-search" onSubmit={submit}>
          <label htmlFor="wedding-search">Search your weddings</label>
          <div>
            <input
              id="wedding-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={100}
              placeholder="Wedding title or couple names"
            />
            <button className="secondary-action" disabled={busy}>
              Search
            </button>
          </div>
        </form>
        {error && (
          <div role="alert" className="team-panel">
            <p>{error}</p>
            <button
              className="secondary-action"
              onClick={() => {
                setBusy(true);
                setVersion((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}
        {busy && !cards.length ? (
          <p role="status">Loading your weddings…</p>
        ) : cards.length ? (
          <div className="wedding-grid">
            {cards.map((card) => (
              <article className="wedding-choice-card" key={card.id}>
                <span className="team-role">
                  {card.role === "ADMIN" ? "Administrator" : "Organizer"}
                </span>
                <h2>{card.title}</h2>
                <p>
                  {card.coupleNames.first} &amp; {card.coupleNames.second}
                </p>
                <p>
                  {card.startsOn} — {card.endsOn}
                  <br />
                  {card.timeZone}
                </p>
                <Link className="primary-action" href={`/weddings/${card.id}`}>
                  Open wedding
                </Link>
              </article>
            ))}
          </div>
        ) : (
          !error && (
            <section className="team-panel selector-empty">
              <h2>
                {search
                  ? "No matching weddings"
                  : "Your celebrations start here"}
              </h2>
              <p>
                {search
                  ? "Try another title or name."
                  : "Create a wedding or enter an invitation code shared by its administrator. You can be part of several weddings with one account."}
              </p>
            </section>
          )
        )}
        {cursor && (
          <button
            className="secondary-action"
            disabled={busy}
            onClick={() => void more()}
          >
            {busy ? "Loading…" : "Load more weddings"}
          </button>
        )}
      </section>
    </main>
  );
}
