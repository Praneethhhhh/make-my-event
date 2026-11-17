"use client";
import { UiIcon } from "@/modules/experience/ui-icon";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { WorkspaceNav } from "@/modules/weddings/workspace-nav";
import { useOperations } from "@/modules/operations/use-operations";
import { OperationsPanel } from "@/modules/operations/operations-panel";
import { functionColor } from "@/modules/functions/function-colors";
import { GuestResponses } from "./guest-summary";
import { RecipientEditor } from "./guest-editor";
import { RecipientDetails } from "./guest-details";
import type {
  Guest,
  GuestSummary,
  GuestManagementContext as Context,
} from "./guest-types";
import "@/modules/operations/operations.css";
import "@/modules/operations/operations-redesign.css";
import "./guests.css";
type GuestList = { items: Guest[]; total: number; nextCursor: string | null };
export function GuestsPage() {
  const { read, mutate, busy, markClean, prefix } = useOperations(),
    [context, setContext] = useState<Context | null>(null),
    [summary, setSummary] = useState<GuestSummary | null>(null),
    [list, setList] = useState<GuestList>({
      items: [],
      total: 0,
      nextCursor: null,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [contextError, setContextError] = useState(""),
    [summaryError, setSummaryError] = useState(""),
    [message, setMessage] = useState(""),
    [version, setVersion] = useState(0),
    [q, setQ] = useState(""),
    [fn, setFn] = useState(""),
    [response, setResponse] = useState(""),
    [removed, setRemoved] = useState(false),
    [loaded, setLoaded] = useState(""),
    [moreBusy, setMoreBusy] = useState(false),
    [openingId, setOpeningId] = useState("");
  const [panel, setPanel] = useState<{
      kind: "create" | "edit" | "detail";
      guest?: Guest;
    } | null>(null),
    epoch = useRef(0),
    more = useRef<AbortController | null>(null),
    moreLock = useRef(false),
    detailRequest = useRef<AbortController | null>(null);
  const path = `guests?q=${encodeURIComponent(q)}&function=${fn}&response=${response}&state=${removed ? "removed" : "active"}`,
    current = loaded === path;
  useEffect(() => {
    const c = new AbortController();
    // Counts are secondary: their failure must not gate the invitation editor.
    void read<Context>("guests/context", c.signal)
      .then((ctx) => {
        if (!c.signal.aborted) {
          setContext(ctx);
          setContextError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setContextError(e.message);
      });
    void read<GuestSummary>("guests/summary", c.signal)
      .then((counts) => {
        if (!c.signal.aborted) {
          setSummary(counts);
          setSummaryError("");
        }
      })
      .catch(() => {
        if (!c.signal.aborted)
          setSummaryError("Guest counts couldn’t load. Refresh to try again.");
      });
    return () => c.abort();
  }, [read, version]);
  useEffect(() => {
    const c = new AbortController();
    epoch.current++;
    more.current?.abort();
    detailRequest.current?.abort();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void read<GuestList>(path, c.signal)
        .then((data) => {
          if (!c.signal.aborted) {
            setList(data);
            setLoaded(path);
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      c.abort();
      more.current?.abort();
      detailRequest.current?.abort();
    };
  }, [read, path, version]);
  useEffect(() => {
    const focus = () => {
      if (!panel) setVersion((v) => v + 1);
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [panel]);
  const refresh = () => setVersion((v) => v + 1);
  function close() {
    setPanel(null);
    markClean();
  }
  async function detail(id: string) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setOpeningId(id);
    setError("");
    try {
      const guest = await read<Guest>(`guests/${id}`, controller.signal);
      if (!controller.signal.aborted) setPanel({ kind: "detail", guest });
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Could not open invitation.");
    } finally {
      if (detailRequest.current === controller) setOpeningId("");
    }
  }
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={context?.displayName ?? ""} />
      <WorkspaceNav active="guests" />
      <div className="operations-workspace guest-workspace">
        <header className="operations-heading">
          <div>
            <p className="operations-kicker">
              {context?.title ?? "YOUR WEDDING"}
            </p>
            <h1>Guest invitations</h1>
            <p>Your people, beautifully welcomed.</p>
          </div>
          <div className="operations-actions">
            <Link
              className="secondary-action"
              href={`${prefix}/guests/preview`}
            >
              Preview invitation
            </Link>
            {context && !context.functions.length ? (
              <Link
                className="primary-action"
                href={`${prefix}/functions`}
                aria-describedby="guest-function-prerequisite"
              >
                <UiIcon name="plus" /> Add function
              </Link>
            ) : (
              <button
                className="primary-action"
                disabled={!context || busy}
                aria-busy={!context && !contextError}
                onClick={() => {
                  detailRequest.current?.abort();
                  setMessage("");
                  setPanel({ kind: "create" });
                }}
              >
                {!context && !contextError
                  ? "Loading functions…"
                  : "Invite guest"}
              </button>
            )}
          </div>
        </header>
        {context && !context.functions.length && (
          <p
            id="guest-function-prerequisite"
            className="guest-setup-notice"
            role="status"
          >
            <UiIcon name="calendar" /> Add a function first, then invite guests
            to it.
          </p>
        )}
        {message && (
          <p role="status" className="guest-success">
            {message}
          </p>
        )}
        {(error || contextError || summaryError) && (
          <div className="operations-alert" role="alert">
            {error || contextError || summaryError}{" "}
            <button className="guest-text-button" onClick={refresh}>
              Refresh guests
            </button>
          </div>
        )}
        {summary && (
          <GuestResponses
            data={summary}
            choose={(id) => {
              setFn(id);
              setResponse("");
            }}
          />
        )}
        <div className="guest-directory-tools">
          <label>
            Search guests
            <input
              type="search"
              maxLength={160}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Guest or family name"
            />
          </label>
          <label>
            Function
            <select
              value={fn}
              onChange={(e) => {
                setFn(e.target.value);
                setResponse("");
              }}
            >
              <option value="">All functions</option>
              {context?.functions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Response
            <select
              value={response}
              disabled={!fn}
              onChange={(e) => setResponse(e.target.value)}
            >
              <option value="">Any response</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DECLINED">Declined</option>
            </select>
          </label>
          <button
            className="guest-text-button"
            onClick={() => {
              setQ("");
              setFn("");
              setResponse("");
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="guest-directory-heading">
          <button
            className="guest-text-button"
            disabled={loading}
            onClick={refresh}
          >
            Refresh guests
          </button>
          <p>
            {removed ? "Removed invitations" : "Active recipients"}
            {current && !loading ? ` · ${list.total}` : ""}
          </p>
          <button
            className="guest-text-button"
            onClick={() => setRemoved((v) => !v)}
          >
            {removed ? "Show active invitations" : "View removed invitations"}
          </button>
        </div>
        {loading || (!current && !error) ? (
          <p role="status" className="results-loading">
            Loading guests…
          </p>
        ) : !current ? null : !list.items.length ? (
          <div className="workspace-empty">
            <span className="workspace-empty-icon" aria-hidden="true">
              <UiIcon name="heart" size={22} />
            </span>
            <h2>
              {q || fn
                ? "No matching invitations"
                : removed
                  ? "No removed invitations"
                  : "Your guest list starts here"}
            </h2>
            <p>
              {q || fn
                ? "Try another name or clear the filters."
                : removed
                  ? "Removed invitations will stay here for reference."
                  : "Invite a person or a family to your celebrations."}
            </p>
          </div>
        ) : (
          <div className="guest-directory" aria-label="Invited recipients">
            {list.items.map((g) => (
              <article className="guest-directory-row" key={g.id}>
                <div>
                  <h2>{g.displayName}</h2>
                  <span className="guest-subtle">
                    {g.status !== "ACTIVE"
                      ? "Removed · History retained"
                      : g.linkActive
                        ? "Private link active"
                        : "Link revoked"}
                  </span>
                </div>
                <div className="guest-recipient-functions">
                  {g.functions
                    .filter((f) => f.eligibilityStatus === "ACTIVE")
                    .map((f) => (
                      <span key={f.id}>
                        <i style={{ background: functionColor(f.color).hex }} />
                        {f.name}
                        <small>
                          {f.status === "ACCEPTED"
                            ? `${f.attendeeCount} attending`
                            : f.status === "DECLINED"
                              ? "Declined"
                              : "Pending"}
                        </small>
                      </span>
                    ))}
                </div>
                <button
                  className="secondary-action"
                  disabled={!!openingId}
                  onClick={() => void detail(g.id)}
                >
                  {openingId === g.id ? "Opening…" : "View invitation"}{" "}
                  <span className="sr-only">for {g.displayName}</span>
                </button>
              </article>
            ))}
          </div>
        )}
        {current && list.nextCursor && (
          <button
            className="secondary-action operations-load-more"
            disabled={loading || moreBusy}
            onClick={async () => {
              if (moreLock.current) return;
              moreLock.current = true;
              setMoreBusy(true);
              const c = new AbortController(),
                generation = epoch.current;
              more.current = c;
              try {
                const data = await read<GuestList>(
                  `${path}&cursor=${list.nextCursor}`,
                  c.signal,
                );
                if (!c.signal.aborted && generation === epoch.current)
                  setList((old) => ({
                    ...data,
                    items: [...old.items, ...data.items],
                  }));
              } catch (e) {
                if (!c.signal.aborted && generation === epoch.current)
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not load more guests.",
                  );
              } finally {
                moreLock.current = false;
                setMoreBusy(false);
              }
            }}
          >
            More guests
          </button>
        )}
        {panel && context && (
          <OperationsPanel
            key={panel.kind + ":" + (panel.guest?.id ?? "new")}
            busy={busy}
            close={close}
          >
            {(requestClose) =>
              panel.kind === "detail" ? (
                <RecipientDetails
                  guest={panel.guest!}
                  timeZone={context.timeZone}
                  read={read}
                  mutate={mutate}
                  busy={busy}
                  close={requestClose}
                  edit={(g) => setPanel({ kind: "edit", guest: g })}
                  changed={refresh}
                  prefix={prefix}
                />
              ) : (
                <RecipientEditor
                  context={context}
                  guest={panel.guest}
                  busy={busy}
                  cancel={requestClose}
                  save={async (payload) => {
                    const result = await mutate<{ id: string }>(
                      panel.kind === "edit"
                        ? `guests/${panel.guest!.id}`
                        : "guests",
                      payload,
                      panel.kind === "edit" ? "PATCH" : "POST",
                    );
                    markClean();
                    refresh();
                    setMessage(
                      panel.kind === "edit"
                        ? "Invitation updated."
                        : "Invitation created. Copy its private link to share.",
                    );
                    const g = await read<Guest>(`guests/${result.id}`);
                    setPanel({ kind: "detail", guest: g });
                  }}
                />
              )
            }
          </OperationsPanel>
        )}
      </div>
    </main>
  );
}
