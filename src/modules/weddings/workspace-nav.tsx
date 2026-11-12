"use client";
import Link from "next/link";
import { useWeddingClient } from "./wedding-scope";
import "./workspace-nav.css";

export function WorkspaceNav({
  active,
}: {
  active: "overview" | "functions" | "details" | "team";
}) {
  const { prefix } = useWeddingClient();
  return (
    <nav className="workspace-nav" aria-label="Wedding workspace">
      {(
        [
          ["overview", "", "Overview"],
          ["functions", "/functions", "Functions"],
          ["team", "/team", "Team"],
          ["details", "/details", "Wedding details"],
        ] as const
      ).map(([key, href, label]) => (
        <Link
          href={prefix + href}
          key={key}
          aria-current={active === key ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
