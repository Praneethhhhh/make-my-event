import Link from "next/link";
import "./workspace-nav.css";

export function WorkspaceNav({
  active,
}: {
  active: "overview" | "functions" | "details";
}) {
  return (
    <nav className="workspace-nav" aria-label="Wedding workspace">
      {(
        [
          ["overview", "/wedding", "Overview"],
          ["functions", "/wedding/functions", "Functions"],
          ["details", "/wedding/details", "Wedding details"],
        ] as const
      ).map(([key, href, label]) => (
        <Link
          href={href}
          key={key}
          aria-current={active === key ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
