"use client";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { useWeddingClient } from "./wedding-scope";
import "./workspace-nav.css";

const groups = [
  {
    label: "Planning",
    links: [
      ["dashboard", "", "Dashboard", "▦"],
      ["functions", "/functions", "Functions", "◇"],
      ["tasks", "/tasks", "Tasks", "✓"],
    ],
  },
  {
    label: "People",
    links: [
      ["team", "/team", "Team", "♧"],
      ["vendors", "/vendors", "Vendors", "⌂"],
    ],
  },
  {
    label: "Management",
    links: [
      ["finance", "/finance", "Finance", "₹"],
      ["details", "/details", "Wedding details", "≡"],
    ],
  },
] as const;
type Area =
  | "overview"
  | "dashboard"
  | "functions"
  | "tasks"
  | "team"
  | "vendors"
  | "finance"
  | "details"
  | "notifications";

const iconPaths: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  functions: "M5 5h14v16H5zM8 2v6M16 2v6M5 11h14M8 15h3M8 18h6",
  tasks: "m3 6 2 2 4-4M12 6h9M3 13l2 2 4-4M12 13h9M3 20h6M12 20h9",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  vendors: "M3 10h18l-2-6H5zM5 10v11h14V10M9 21v-7h6v7",
  finance: "M3 5h18v14H3zM7 9h.01M17 15h.01M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  details: "M4 6h6M14 6h6M4 12h10M18 12h2M4 18h2M10 18h10M10 3v6M14 9v6M6 15v6",
};

export function WorkspaceNav({ active }: { active: Area }) {
  const { prefix } = useWeddingClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const desktop = matchMedia("(min-width: 961px)");
    const resize = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, []);
  const selected = active === "overview" ? "dashboard" : active;
  const current =
    groups
      .flatMap((group) => [...group.links])
      .find(([key]) => key === selected)?.[2] ?? "Notifications";
  function close() {
    dialog.current?.close();
    trigger.current?.focus();
  }
  function links() {
    return groups.map((group) => (
      <section key={group.label} className="workspace-nav-group">
        <p>{group.label}</p>
        {group.links.map(([key, href, label]) => (
          <Link
            key={key}
            href={prefix + href}
            aria-current={selected === key ? "page" : undefined}
            onClick={() => {
              if (dialog.current?.open) close();
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={iconPaths[key]} />
            </svg>
            {label}
          </Link>
        ))}
      </section>
    ));
  }
  return (
    <div className="workspace-navigation">
      <nav className="workspace-nav" aria-label="Wedding workspace">
        {links()}
        <Link className="workspace-all-weddings" href="/weddings">
          ← Your weddings
        </Link>
      </nav>
      <div className="workspace-mobile-bar">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-controls={id}
          onClick={() => dialog.current?.showModal()}
        >
          <span aria-hidden="true">☰</span> Wedding menu
        </button>
        <span>{current}</span>
      </div>
      <dialog
        ref={dialog}
        id={id}
        className="workspace-drawer"
        aria-label="Wedding navigation"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="workspace-drawer-heading">
          <strong>Your wedding</strong>
          <button type="button" onClick={close} aria-label="Close wedding menu">
            ×
          </button>
        </div>
        <nav aria-label="Wedding workspace">
          {links()}
          <Link
            className="workspace-all-weddings"
            href="/weddings"
            onClick={close}
          >
            ← Your weddings
          </Link>
        </nav>
      </dialog>
    </div>
  );
}
