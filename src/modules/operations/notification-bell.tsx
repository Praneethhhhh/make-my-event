"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWeddingScope } from "@/modules/weddings/wedding-scope";
import "./operations.css";
export function NotificationBell() {
  const scope = useWeddingScope();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    let active = true,
      pending = false,
      dirty = false,
      lastAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      dirty = true;
      if (!active || pending || timer || document.visibilityState === "hidden")
        return;
      timer = setTimeout(
        () => {
          timer = undefined;
          void refresh();
        },
        Math.max(200, lastAt + 4000 - Date.now()),
      );
    };
    const refresh = async () => {
      if (!active || pending || document.visibilityState === "hidden") return;
      pending = true;
      dirty = false;
      lastAt = Date.now();
      try {
        const response = await scope.fetch("/api/v1/notifications?view=count", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const body = await response.json();
          if (active) setCount(body.data.unreadCount);
        }
      } catch {
        /* Preserve the last known count until another activity retries. */
      } finally {
        pending = false;
        if (active && dirty) schedule();
      }
    };
    const activity = (event: Event) => {
      if (
        (event as CustomEvent<{ weddingId: string }>).detail?.weddingId ===
        scope.weddingId
      )
        schedule();
    };
    const visible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    void refresh();
    window.addEventListener("mme-wedding-activity", activity);
    window.addEventListener("mme-notifications", schedule);
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("mme-wedding-activity", activity);
      window.removeEventListener("mme-notifications", schedule);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [scope]);
  if (!scope) return null;
  return (
    <Link
      href={`${scope.prefix}/notifications`}
      className="notification-bell"
      aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {count > 0 && <span>{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
