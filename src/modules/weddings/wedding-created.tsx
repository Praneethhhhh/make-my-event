"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WeddingHeader } from "./wedding-shell";
import "./wedding.css";
import { WorkspaceNav } from "./workspace-nav";
import Link from "next/link";

type Wedding = {
  title: string;
  coupleNames: { first: string; second: string };
  startsOn: string;
  endsOn: string;
  tradition: string | null;
};

export function WeddingCreated({
  confirmation = false,
}: {
  confirmation?: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [wedding, setWedding] = useState<Wedding | null>(null);
  const [error, setError] = useState("");
  const [role, setRole] = useState("ADMIN");
  useEffect(() => {
    Promise.all([
      fetch("/api/v1/auth/me", { cache: "no-store" }),
      fetch("/api/v1/wedding", { cache: "no-store" }),
    ])
      .then(async ([me, current]) => {
        if (me.status === 401) return router.replace("/sign-in");
        if (current.status === 404) return router.replace("/wedding/setup");
        if (!me.ok || !current.ok) throw new Error();
        const account = (await me.json()).data;
        setDisplayName(account.user.displayName);
        setRole(account.membership.role);
        setWedding((await current.json()).data.wedding);
      })
      .catch(() => setError("Could not load your wedding workspace."));
  }, [router]);

  if (!wedding)
    return (
      <main className="wedding-page">
        <p className="loading-state" role={error ? "alert" : undefined}>
          {error || "Loading your wedding…"}
        </p>
      </main>
    );

  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const tradition = wedding.tradition
    ? wedding.tradition[0] + wedding.tradition.slice(1).toLowerCase()
    : "Not specified";
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={displayName} />
      <WorkspaceNav active="overview" />
      <div className="wedding-progress">
        <span>✓ Account created</span>
        <i>•</i>
        <span>✓ Wedding setup</span>
        <i>•</i>
        <strong>Workspace ready</strong>
      </div>
      <section className="created-card">
        <div className="success-icon" aria-hidden="true">
          ✓
        </div>
        <p className="created-eyebrow">
          {confirmation ? "WEDDING CREATED" : "WEDDING OVERVIEW"}
        </p>
        <h1>
          {confirmation ? "Your wedding workspace is ready" : wedding.title}
        </h1>
        <p>
          {confirmation
            ? `${wedding.title} now has a private place for your family to plan together.`
            : "Your private family workspace is ready for the next planning step."}
        </p>
        <dl className="wedding-summary">
          <div>
            <dt>Wedding</dt>
            <dd>{wedding.title}</dd>
          </div>
          <div>
            <dt>Dates</dt>
            <dd>
              {date.format(new Date(wedding.startsOn + "T00:00:00Z"))} –{" "}
              {date.format(new Date(wedding.endsOn + "T00:00:00Z"))}
            </dd>
          </div>
          <div>
            <dt>Style</dt>
            <dd>{tradition}</dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>{role === "ADMIN" ? "Administrator" : "Organizer"}</dd>
          </div>
        </dl>
        {confirmation && (
          <button
            className="primary-action overview-action"
            type="button"
            onClick={() => router.push("/wedding")}
          >
            Go to wedding overview →
          </button>
        )}
        <section className="future-actions">
          <h2>Next, you can</h2>
          <div>
            <article>
              <b>1</b>
              <h3>Create your first function</h3>
              <p>Add Haldi, Sangeet, Wedding or Reception timings.</p>
              <Link href="/wedding/functions">Manage functions →</Link>
            </article>
            <article>
              <b>2</b>
              <h3>Add venue details</h3>
              <p>Attach locations, directions and arrival notes.</p>
            </article>
            <article>
              <b>3</b>
              <h3>Invite family organizers</h3>
              <p>Share private access with trusted relatives.</p>
            </article>
          </div>
        </section>
        <p className="privacy-note">
          🔒 This workspace is private to your wedding’s organizing team.
        </p>
      </section>
    </main>
  );
}
