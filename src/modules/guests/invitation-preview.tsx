"use client";
import { UiIcon } from "@/modules/experience/ui-icon";
import Link from "next/link";
import { useState, useEffect } from "react";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { WorkspaceNav } from "@/modules/weddings/workspace-nav";
import { useOperations } from "@/modules/operations/use-operations";
import { InvitationView } from "./invitation-view";
import type {
  Invitation,
  GuestManagementContext as Context,
} from "./guest-types";
import "@/modules/operations/operations.css";
import "@/modules/operations/operations-redesign.css";
import "./guests.css";
export function InvitationPreview({ recipient }: { recipient?: string }) {
  const { read, prefix } = useOperations(),
    [data, setData] = useState<Invitation | null>(null),
    [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    void Promise.all([
      read<Invitation>(
        `guests/preview${recipient ? `?recipient=${recipient}` : ""}`,
        c.signal,
      ),
      read<Context>("guests/context", c.signal),
    ])
      .then(([v, ctx]) => {
        if (!c.signal.aborted) {
          setData(v);
          setContext(ctx);
          setError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [read, recipient, version]);
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={context?.displayName ?? ""} />
      <WorkspaceNav active="guests" />
      <div className="operations-workspace guest-preview">
        <div className="guest-preview-bar">
          <Link href={`${prefix}/guests`}>
            <UiIcon name="arrow-left" /> Back to guests
          </Link>
          <span>{recipient ? "Recipient preview" : "All functions"}</span>
          <p>Preview only — responses are not saved.</p>
        </div>
        {error ? (
          <p className="guest-error" role="alert">
            {error}{" "}
            <button onClick={() => setVersion((v) => v + 1)}>Try again</button>
          </p>
        ) : data ? (
          <InvitationView data={data} preview />
        ) : (
          <p role="status">Loading invitation preview…</p>
        )}
      </div>
    </main>
  );
}
