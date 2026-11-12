"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWeddingScope } from "./wedding-scope";
import "./wedding-selector.css";

export function WeddingHeader({ displayName }: { displayName: string }) {
  const scope = useWeddingScope();
  const [weddings, setWeddings] = useState<
    { id: string; title: string; role: string }[]
  >([]);
  const [title, setTitle] = useState("Current wedding");
  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    Promise.all([
      fetch("/api/v1/weddings?limit=100", {
        cache: "no-store",
        signal: controller.signal,
      }),
      scope.fetch("/api/v1/wedding", {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([list, current]) => {
        if (controller.signal.aborted) return;
        if (list.ok) setWeddings((await list.json()).data);
        if (current.ok) setTitle((await current.json()).data.wedding.title);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [scope]);
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <header className="wedding-header">
      <div className="wedding-brand">
        <Image src="/brand-mark.png" alt="" width={36} height={36} />
        <div>
          <strong>MAKE MY EVENT</strong>
          <span>FAMILY PLANNER</span>
        </div>
      </div>
      {scope && (
        <details className="wedding-switcher">
          <summary aria-label="Switch wedding">{title}</summary>
          <nav aria-label="Choose wedding">
            {weddings.map((wedding) => (
              <Link
                key={wedding.id}
                href={`/weddings/${wedding.id}`}
                aria-current={
                  scope.weddingId === wedding.id ? "page" : undefined
                }
              >
                {wedding.title}
                <small>
                  {wedding.role === "ADMIN" ? "Administrator" : "Organizer"}
                </small>
              </Link>
            ))}
            <Link href="/weddings">Your weddings</Link>
            <Link href="/weddings/join">Join with code</Link>
            <Link href="/weddings/new">Create wedding</Link>
          </nav>
        </details>
      )}
      <div
        className="wedding-account"
        aria-label={`Signed in as ${displayName}`}
      >
        <span aria-hidden="true">{initials || "ME"}</span>
        <div>
          <strong>{displayName}</strong>
          <small>Family organizer</small>
        </div>
      </div>
    </header>
  );
}
