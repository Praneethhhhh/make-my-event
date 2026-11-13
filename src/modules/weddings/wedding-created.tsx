"use client";
import { useWeddingClient } from "@/modules/weddings/wedding-scope";

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
  const { fetch, prefix } = useWeddingClient();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [wedding, setWedding] = useState<Wedding | null>(null);
  const [error, setError] = useState("");
  const [role, setRole] = useState("ADMIN");
  const [functionCount, setFunctionCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const options = { cache: "no-store", signal: controller.signal } as const;
    Promise.all([
      fetch("/api/v1/auth/me", options),
      fetch("/api/v1/wedding", options),
      fetch("/api/v1/functions", options).catch(() => null),
    ])
      .then(async ([me, current, functions]) => {
        if (controller.signal.aborted) return;
        if (me.status === 401) return router.replace("/sign-in");
        if (current.status === 404) return undefined;
        if (!me.ok || !current.ok) throw new Error();
        const account = (await me.json()).data;
        const profile = (await current.json()).data;
        const items = functions?.ok
          ? await functions.json().catch(() => null)
          : null;
        if (controller.signal.aborted) return;
        setError("");
        setDisplayName(account.user.displayName);
        setRole(profile.role);
        setWedding(profile.wedding);
        setFunctionCount(items ? items.data.functions.length : null);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load your wedding workspace.");
      });
    return () => controller.abort();
  }, [router, fetch]);

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
      {confirmation && (
        <div className="wedding-progress">
          <span>✓ Account created</span>
          <i>•</i>
          <span>✓ Wedding setup</span>
          <i>•</i>
          <strong>Workspace ready</strong>
        </div>
      )}
      <section className="created-card">
        {confirmation && (
          <div className="success-icon" aria-hidden="true">
            ✓
          </div>
        )}
        <p className="created-eyebrow">
          {confirmation ? "WEDDING CREATED" : "WEDDING OVERVIEW"}
        </p>
        <h1>
          {confirmation ? "Your wedding workspace is ready" : wedding.title}
        </h1>
        <p>
          {confirmation
            ? `${wedding.title} now has a private place for your family to plan together.`
            : "Your celebration, at a glance."}
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
            onClick={() => router.push(prefix)}
          >
            Go to wedding overview →
          </button>
        )}
        <section className="future-actions">
          <h2>Next, you can</h2>
          <div>
            <article>
              <b>1</b>
              <h3>
                {functionCount === 0
                  ? "Create your first function"
                  : "Manage your functions"}
              </h3>
              <p>
                {functionCount === null
                  ? "Review your schedule and ceremony timings."
                  : functionCount === 0
                    ? "Add Haldi, Sangeet, Wedding or Reception timings."
                    : `${functionCount} active ${functionCount === 1 ? "function" : "functions"} in your wedding schedule.`}
              </p>
              <Link href={`${prefix}/functions`}>Manage functions →</Link>
            </article>
            <article>
              <b>2</b>
              <h3>Add venue details</h3>
              <p>Attach locations, directions and arrival notes.</p>
              <Link href={`${prefix}/functions`}>Edit venues →</Link>
            </article>
            <article>
              <b>3</b>
              <h3>
                {role === "ADMIN"
                  ? "Invite family organizers"
                  : "Meet your organizing team"}
              </h3>
              <p>
                {role === "ADMIN"
                  ? "Share private access with trusted relatives."
                  : "View your team. Only administrators can invite or manage members."}
              </p>
              <Link href={`${prefix}/team`}>
                {role === "ADMIN" ? "Manage team →" : "View team →"}
              </Link>
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
