"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { WorkspaceNav } from "@/modules/weddings/workspace-nav";
import { useOperations } from "./use-operations";
import { money } from "./operations-types";
import "./workspace-dashboard.css";

type Dashboard = {
  title: string;
  displayName: string;
  timeZone: string;
  summary: {
    open: number;
    overdue: number;
    mine: number;
    actualPaid: number;
    outstanding: number;
    activeVendors: number;
  };
};
export function WorkspaceDashboard() {
  const { read, prefix } = useOperations();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    read<Dashboard>("operations?view=dashboard", controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Your dashboard couldn’t load. Please try again.");
      });
    return () => controller.abort();
  }, [read, attempt]);
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={data?.displayName ?? ""} />
      <WorkspaceNav active="dashboard" />
      <div className="workspace-dashboard">
        <header className="dashboard-heading">
          <p>YOUR WEDDING</p>
          <h1>{data?.title ?? "Dashboard"}</h1>
          <span>A little clarity for the days ahead.</span>
        </header>
        {error ? (
          <div className="dashboard-error" role="alert">
            <h2>Let’s try that again</h2>
            <p>{error}</p>
            <button
              className="primary-action"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : !data ? (
          <div
            className="dashboard-loading"
            role="status"
            aria-label="Loading dashboard"
          >
            <span>Gathering your wedding details…</span>
            <div />
            <div />
            <div />
          </div>
        ) : (
          <>
            <section
              className="dashboard-section"
              aria-labelledby="dashboard-tasks"
            >
              <div className="dashboard-section-heading">
                <h2 id="dashboard-tasks">Tasks</h2>
                <Link href={`${prefix}/tasks`}>
                  Open all tasks <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <div className="dashboard-task-metrics">
                {(
                  [
                    [
                      "Open tasks",
                      data.summary.open,
                      "open",
                      "To do and in progress",
                    ],
                    [
                      "Overdue",
                      data.summary.overdue,
                      "overdue",
                      "Past their due date",
                    ],
                    [
                      "My open tasks",
                      data.summary.mine,
                      "mine",
                      "Assigned to you",
                    ],
                  ] as const
                ).map(([label, count, filter, hint]) => (
                  <Link
                    className={`dashboard-metric ${filter === "overdue" && count ? "needs-attention" : ""}`}
                    href={`${prefix}/tasks?scope=${filter}`}
                    key={filter}
                  >
                    <span>
                      {label}
                      <i aria-hidden="true">↗</i>
                    </span>
                    <strong>{count}</strong>
                    <small>{hint}</small>
                  </Link>
                ))}
              </div>
            </section>
            <section
              className="dashboard-section"
              aria-labelledby="dashboard-finances"
            >
              <div className="dashboard-section-heading">
                <h2 id="dashboard-finances">Finances</h2>
                <Link href={`${prefix}/finance`}>
                  Open finance <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <div className="dashboard-finance-metrics">
                <article className="dashboard-metric">
                  <span>Actual paid</span>
                  <strong>{money(data.summary.actualPaid)}</strong>
                  <small>Recorded expenses and payments</small>
                </article>
                <article className="dashboard-metric">
                  <span>Outstanding</span>
                  <strong>{money(data.summary.outstanding)}</strong>
                  <small>Remaining expense balance</small>
                </article>
              </div>
              <p className="dashboard-caption">All amounts in INR.</p>
            </section>
            <section className="dashboard-vendors">
              <div>
                <p>YOUR VENDOR TEAM</p>
                <h2>
                  {data.summary.activeVendors} active{" "}
                  {data.summary.activeVendors === 1 ? "vendor" : "vendors"}
                </h2>
              </div>
              <Link href={`${prefix}/vendors`}>
                Open vendor directory <span aria-hidden="true">↗</span>
              </Link>
            </section>
            <p className="dashboard-caption">
              Wedding time zone · {data.timeZone}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
