import type { ReactNode } from "react";
export function EmptyState({
  kind,
  title,
  children,
  action,
}: {
  kind: "tasks" | "notifications" | "finance";
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const paths = {
    tasks: "m3 6 2 2 4-4M12 6h9M3 13l2 2 4-4M12 13h9M3 20h6M12 20h9",
    notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    finance:
      "M3 5h18v14H3zM7 9h.01M17 15h.01M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  };
  return (
    <div className="workspace-empty">
      <span className="workspace-empty-icon">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={paths[kind]} />
        </svg>
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
