"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { WorkspaceNav } from "@/modules/weddings/workspace-nav";
import {
  localDateTime,
  localDateTimeToUtc,
} from "@/modules/weddings/zoned-date";
import { useOperations, RequestError } from "./use-operations";
import { EmptyState } from "./empty-state";
import { ActionIcon } from "./action-icon";
import { OperationsPanel } from "./operations-panel";
import { RecordPicker } from "./record-picker";
import { money, type Overview } from "./operations-types";
import "./operations.css";
import "./operations-redesign.css";
import "./finance.css";
import { parseRupees } from "./finance-money";

type Entry = {
  id: string;
  key: string;
  source:
    | "expenses"
    | "vendorCharges"
    | "expensePayments"
    | "vendorPayments"
    | "legacyExpenses";
  revision: number;
  description: string;
  category?: string;
  vendorId: string | null;
  vendorName: string | null;
  amountPaise: number;
  paidPaise?: number;
  outstandingPaise?: number;
  active?: boolean;
  status: string;
  legacySettled?: boolean;
  notes?: string;
  voidReason?: string;
  paidAt?: string;
  paymentMethod?: string;
};
type Page<T> = { items: T[]; nextCursor: string | null; total?: number };
type Balance = {
  id: string;
  name: string;
  paidPaise: number;
  outstandingPaise: number;
};
export function FinancePage() {
  const { read, mutate, busy, markClean } = useOperations();
  const [context, setContext] = useState<Overview | null>(null);
  const [summary, setSummary] = useState<{
    actualPaid: number;
    outstanding: number;
  } | null>(null);
  const [tab, setTab] = useState<"expenses" | "payments">("expenses");
  const [list, setList] = useState<Page<Entry>>({
    items: [],
    nextCursor: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{
    kind: "expense" | "payment" | "paid-expense" | "correction";
    entry?: Entry;
  } | null>(null);
  const [balances, setBalances] = useState<Page<Balance> | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const [balanceBusy, setBalanceBusy] = useState(false);
  const balanceLock = useRef(false);
  const loadEpoch = useRef(0);
  const listLock = useRef(false);
  const moreRequest = useRef<AbortController | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const path = `finance/${tab}?q=${encodeURIComponent(search)}`;
  const [loadedPath, setLoadedPath] = useState("");
  const resultsCurrent = loadedPath === path;
  useEffect(() => {
    const controller = new AbortController();
    loadEpoch.current++;
    moreRequest.current?.abort();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      Promise.all([
        read<Overview>("operations?view=context", controller.signal),
        read<{ actualPaid: number; outstanding: number }>(
          "finance/summary",
          controller.signal,
        ),
        read<Page<Entry>>(path, controller.signal),
      ])
        .then(([current, figures, rows]) => {
          if (!controller.signal.aborted) {
            setContext(current);
            setSummary(figures);
            setList(rows);
            setLoadedPath(path);
          }
        })
        .catch((problem) => {
          if (!controller.signal.aborted)
            setError(
              problem instanceof Error
                ? problem.message
                : "Couldn’t load finance. Try again.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [read, path, version]);
  function close() {
    setForm(null);
    markClean();
  }
  async function loadBalances(cursor?: string) {
    if (balanceLock.current) return;
    balanceLock.current = true;
    setBalanceBusy(true);
    setBalanceError("");
    try {
      const page = await read<Page<Balance>>(
        `finance/vendor-balances${cursor ? `?cursor=${cursor}` : ""}`,
      );
      setBalances((old) =>
        cursor
          ? { ...page, items: [...(old?.items ?? []), ...page.items] }
          : page,
      );
    } catch (problem) {
      setBalanceError(
        problem instanceof Error ? problem.message : "Couldn’t load balances.",
      );
    } finally {
      balanceLock.current = false;
      setBalanceBusy(false);
    }
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: context?.timeZone ?? "UTC",
    }).format(new Date(value));
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={context?.displayName ?? ""} />
      <WorkspaceNav active="finance" />
      <div className="operations-workspace finance-workspace">
        <header className="operations-heading">
          <div>
            <p className="operations-kicker">
              {context?.title ?? "YOUR WEDDING"}
            </p>
            <h1>Finance</h1>
            <p>Real costs. Clear payments.</p>
          </div>
          <div className="operations-actions">
            <button
              className="primary-action"
              disabled={!context || busy}
              onClick={() => {
                setMessage("");
                setForm({ kind: "expense" });
              }}
            >
              Add entry
            </button>
          </div>
        </header>
        {error && (
          <div className="operations-alert" role="alert">
            {error}{" "}
            <button
              className="secondary-action"
              disabled={loading}
              onClick={() => setVersion((old) => old + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {summary && (
          <div className="finance-summary">
            <article>
              <span>Actual paid</span>
              <strong>{money(summary.actualPaid)}</strong>
            </article>
            <article>
              <span>Outstanding</span>
              <strong>{money(summary.outstanding)}</strong>
            </article>
          </div>
        )}
        <div className="finance-ledger-toolbar">
          <div className="operations-tabs">
            {(["expenses", "payments"] as const).map((view) => (
              <button
                key={view}
                aria-pressed={tab === view}
                onClick={() => {
                  setTab(view);
                  setSearch("");
                }}
              >
                {view === "expenses" ? "Expenses" : "Payments"}
              </button>
            ))}
          </div>
          <label>
            Search {tab}
            <input
              type="search"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <p className="finance-view-explainer">
          {tab === "expenses"
            ? "Expenses are costs you have recorded. Open an expense to record its payment."
            : "Payments are money already paid, linked to their expense."}
        </p>
        {(loading || !resultsCurrent) && !error && (
          <p className="operations-subtle" role="status">
            Loading finance…
          </p>
        )}
        {!loading && resultsCurrent && !list.items.length && !error && (
          <EmptyState
            kind="finance"
            title={
              search
                ? "No matching entries"
                : tab === "expenses"
                  ? "No expenses yet"
                  : "No payments recorded"
            }
          >
            {search
              ? "Try another description or clear the search."
              : tab === "expenses"
                ? "Use Add entry to record a cost to pay later."
                : "Use Add entry for something already paid, or record a payment from an existing expense."}
          </EmptyState>
        )}
        {resultsCurrent && !!list.items.length && (
          <>
            <p className="operations-subtle">
              {list.total}{" "}
              {list.total === 1
                ? tab === "expenses"
                  ? "expense"
                  : "payment"
                : tab}{" "}
              · INR
            </p>
            <div className="finance-ledger" aria-busy={loading}>
              {list.items.map((entry) => (
                <article
                  className={`finance-row ${entry.status === "VOID" ? "is-corrected" : ""}`}
                  key={entry.key}
                >
                  <div>
                    <h2>{entry.description}</h2>
                    <p>
                      {entry.vendorName ?? "No vendor"}
                      {entry.category ? ` · ${entry.category}` : ""}
                    </p>
                    {entry.paidAt && (
                      <p>
                        <time dateTime={entry.paidAt}>
                          {date(entry.paidAt)}
                        </time>{" "}
                        · {entry.paymentMethod ?? "Recorded payment"}
                      </p>
                    )}
                    {entry.status === "VOID" && (
                      <span className="operations-chip">Removed</span>
                    )}
                    {entry.legacySettled && entry.status !== "VOID" && (
                      <span className="operations-chip">Paid in full</span>
                    )}
                    {(entry.notes || entry.voidReason) && (
                      <details>
                        <summary>Notes & history</summary>
                        {entry.notes && (
                          <p className="operations-plain">{entry.notes}</p>
                        )}
                        {entry.voidReason && (
                          <p className="operations-plain">
                            Removal reason: {entry.voidReason}
                          </p>
                        )}
                      </details>
                    )}
                  </div>
                  <div className="finance-row-amount">
                    <strong>{money(entry.amountPaise)}</strong>
                    {tab === "expenses" && entry.status !== "VOID" && (
                      <small>
                        {money(entry.outstandingPaise ?? 0)} remaining
                      </small>
                    )}
                  </div>
                  <div className="finance-row-actions">
                    {tab === "expenses" &&
                      entry.active &&
                      Number(entry.outstandingPaise) > 0 && (
                        <button
                          className="primary-action"
                          disabled={busy}
                          onClick={() => setForm({ kind: "payment", entry })}
                        >
                          Record payment
                        </button>
                      )}
                    <button
                      className="secondary-action"
                      aria-label={`Remove ${tab === "expenses" ? "expense" : "payment"}: ${entry.description}`}
                      title="Remove entry"
                      disabled={busy || entry.status === "VOID"}
                      onClick={() => setForm({ kind: "correction", entry })}
                    >
                      <ActionIcon name="remove" /> Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {resultsCurrent && list.nextCursor && (
          <button
            className="secondary-action operations-load-more"
            disabled={moreBusy || loading}
            onClick={async () => {
              if (listLock.current) return;
              listLock.current = true;
              setMoreBusy(true);
              const epoch = loadEpoch.current;
              const controller = new AbortController();
              moreRequest.current = controller;
              try {
                const page = await read<Page<Entry>>(
                  `${path}&cursor=${encodeURIComponent(list.nextCursor!)}`,
                  controller.signal,
                );
                if (controller.signal.aborted || epoch !== loadEpoch.current)
                  return;
                setList((old) => ({
                  ...page,
                  items: [...old.items, ...page.items],
                }));
              } catch (problem) {
                if (controller.signal.aborted || epoch !== loadEpoch.current)
                  return;
                setError(
                  problem instanceof Error
                    ? problem.message
                    : "Couldn’t load more.",
                );
              } finally {
                listLock.current = false;
                setMoreBusy(false);
              }
            }}
          >
            {moreBusy ? "Loading…" : "More records"}
          </button>
        )}
        <section className="finance-vendor-balances">
          <div>
            <h2>Vendor balances</h2>
            <p>See payments and what remains for each vendor.</p>
          </div>
          <button
            className="secondary-action"
            disabled={balanceBusy}
            onClick={() => void loadBalances()}
          >
            {balanceBusy
              ? "Loading balances…"
              : balances
                ? "Refresh vendor balances"
                : "View vendor balances"}
          </button>
          {balanceError && <p role="alert">{balanceError}</p>}
          {balances && (
            <div className="finance-balances-list">
              {!balances.items.length && <p>No vendor-linked expenses yet.</p>}
              {balances.items.map((balance) => (
                <article key={balance.id}>
                  <strong>{balance.name}</strong>
                  <span>{money(balance.paidPaise)} paid</span>
                  <span>{money(balance.outstandingPaise)} remaining</span>
                </article>
              ))}
              {balances.nextCursor && (
                <button
                  className="secondary-action"
                  disabled={balanceBusy}
                  onClick={() => void loadBalances(balances.nextCursor!)}
                >
                  More vendor balances
                </button>
              )}
            </div>
          )}
        </section>
        {form && context && (
          <OperationsPanel
            key={`${form.kind}:${form.entry?.key ?? "new"}`}
            busy={busy}
            close={close}
          >
            {(requestClose) => (
              <FinanceForm
                kind={form.kind}
                entry={form.entry}
                context={context}
                busy={busy}
                close={requestClose}
                save={async (data, mode) => {
                  const target =
                    mode === "correction"
                      ? `finance/${form.entry!.source === "expenses" || form.entry!.source === "vendorCharges" ? "expenses" : "payments"}/${form.entry!.id}/remove`
                      : mode === "paid-expense"
                        ? "finance/paid-expenses"
                        : `finance/${mode === "expense" ? "expenses" : "payments"}`;
                  await mutate(target, data);
                  markClean();
                  setMessage(
                    mode === "correction"
                      ? "Entry removed. Its history is retained."
                      : mode === "expense"
                        ? "Expense added."
                        : mode === "paid-expense"
                          ? "Payment and expense recorded."
                          : "Payment recorded.",
                  );
                  setVersion((old) => old + 1);
                  setBalances(null);
                  setBalanceError("");
                  setForm(null);
                }}
              />
            )}
          </OperationsPanel>
        )}
      </div>
    </main>
  );
}

function FinanceForm({
  kind,
  entry,
  context,
  busy,
  close,
  save,
}: {
  kind: "expense" | "payment" | "paid-expense" | "correction";
  entry?: Entry | undefined;
  context: Overview;
  busy: boolean;
  close: () => void;
  save: (
    data: Record<string, unknown>,
    mode: "expense" | "paid-expense" | "payment" | "correction",
  ) => Promise<void>;
}) {
  const { read } = useOperations();
  const key = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const [vendor, setVendor] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Entry | null>(entry ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [entryMode, setEntryMode] = useState<"expense" | "paid-expense">(
    kind === "paid-expense" ? "paid-expense" : "expense",
  );
  const recordKind =
    kind === "expense" || kind === "paid-expense" ? entryMode : kind;
  const newExpense = recordKind === "expense" || recordKind === "paid-expense";
  const hasPayment = recordKind === "payment" || recordKind === "paid-expense";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || refreshing) return;
    lock.current = true;
    setError("");
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) ?? "").trim();
    try {
      let data: Record<string, unknown> = { creationKey: key.current };
      if (recordKind === "correction")
        data = {
          ...data,
          source: entry!.source,
          revision: entry!.revision,
          reason: text("reason"),
        };
      else {
        const amountPaise = parseRupees(text("amount"));
        data = { ...data, amountPaise, currency: "INR", notes: text("notes") };
        if (newExpense)
          data = {
            ...data,
            description: text("description"),
            category: text("category"),
            vendorId: vendor || null,
          };
        if (recordKind === "payment") {
          if (!selected?.active || !selected.outstandingPaise)
            throw new RequestError(
              "This expense has no remaining balance. Return to Expenses and refresh.",
            );
          if (amountPaise > selected.outstandingPaise)
            throw new RequestError(
              "The payment exceeds the remaining balance. Refresh the balance if it changed.",
            );
          data = {
            ...data,
            expenseId: selected.id,
            expenseSource: selected.source,
          };
        }
        if (hasPayment)
          data = {
            ...data,
            weddingTimeZone: context.timeZone,
            paidAt: localDateTimeToUtc(text("paidAt"), context.timeZone),
            paymentMethod: text("method"),
          };
      }
      await save(data, recordKind);
    } catch (problem) {
      setError(
        problem instanceof RequestError
          ? [problem.message, ...new Set(Object.values(problem.fields))].join(
              " ",
            )
          : problem instanceof Error
            ? problem.message
            : "Couldn’t save. Your draft is preserved.",
      );
    } finally {
      lock.current = false;
    }
  }
  return (
    <form
      className="operations-form"
      onSubmit={(event) => void submit(event)}
      onChange={() => {
        key.current = crypto.randomUUID();
        setError("");
      }}
    >
      <h2>
        {newExpense
          ? "Add entry"
          : recordKind === "payment"
            ? "Record payment for expense"
            : "Remove entry"}
      </h2>
      {newExpense && (
        <>
          <p className="finance-form-explainer">
            Choose what you want to record.
          </p>
          <fieldset className="finance-entry-choice" disabled={busy}>
            <label>
              <input
                type="radio"
                name="entryMode"
                value="expense"
                checked={entryMode === "expense"}
                onChange={() => setEntryMode("expense")}
              />
              <span>
                <strong>A cost to pay later</strong>
                <small>
                  Adds an expense. Record its payments when you pay.
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="entryMode"
                value="paid-expense"
                checked={entryMode === "paid-expense"}
                onChange={() => setEntryMode("paid-expense")}
              />
              <span>
                <strong>Something already paid</strong>
                <small>Saves its expense and payment together.</small>
              </span>
            </label>
          </fieldset>
        </>
      )}
      {error && (
        <p role="alert" className="operations-alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy || refreshing}>
        <div className="operations-fields">
          {newExpense && (
            <>
              <label>
                Description
                <input name="description" required maxLength={160} />
              </label>
              <label>
                Category
                <input name="category" required maxLength={80} />
              </label>
              <RecordPicker
                type="vendors"
                label="Vendor (optional)"
                name="vendorId"
                value={vendor}
                onChange={setVendor}
              />
            </>
          )}
          {recordKind === "payment" && selected && (
            <section className="finance-payment-context">
              <span>PAYMENT FOR</span>
              <h3>{selected.description}</h3>
              <p>
                {selected.vendorName
                  ? `Vendor · ${selected.vendorName}`
                  : "No vendor · Direct expense"}
              </p>
              <dl>
                <div>
                  <dt>Expense total</dt>
                  <dd>{money(selected.amountPaise)}</dd>
                </div>
                <div>
                  <dt>Already paid</dt>
                  <dd>{money(selected.paidPaise ?? 0)}</dd>
                </div>
                <div>
                  <dt>Remaining balance</dt>
                  <dd>{money(selected.outstandingPaise ?? 0)}</dd>
                </div>
              </dl>
              <button
                className="picker-more"
                type="button"
                onClick={async () => {
                  if (refreshing) return;
                  setRefreshing(true);
                  setError("");
                  try {
                    const rows = await read<Page<Entry>>(
                      `finance/expenses?expenseId=${selected.id}&expenseSource=${selected.source}`,
                    );
                    const current = rows.items[0];
                    if (!current?.active || !current.outstandingPaise) {
                      setSelected(current ?? null);
                      setError("This expense is settled or no longer active.");
                    } else setSelected(current);
                  } catch {
                    setError("Couldn’t refresh this balance. Try again.");
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                Refresh remaining balance
              </button>
            </section>
          )}
          {recordKind !== "correction" && (
            <label>
              Amount (₹ INR)
              <input
                name="amount"
                inputMode="decimal"
                required
                maxLength={15}
                placeholder="0.00"
              />
            </label>
          )}
          {hasPayment && (
            <>
              <label>
                Payment date ({context.timeZone})
                <input
                  name="paidAt"
                  type="datetime-local"
                  required
                  defaultValue={localDateTime(
                    new Date().toISOString(),
                    context.timeZone,
                  )}
                />
              </label>
              <label>
                Payment method
                <select name="method">
                  <option value="UPI">UPI</option>
                  <option value="BANK">Bank transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </>
          )}
          {recordKind !== "correction" ? (
            <label>
              Notes (optional)
              <textarea name="notes" maxLength={2000} />
            </label>
          ) : (
            <>
              <p>
                {entry!.description} · {money(entry!.amountPaise)}
              </p>
              <label>
                Reason for removal
                <textarea name="reason" required maxLength={500} />
              </label>
              <p className="operations-subtle">
                {entry!.source === "expensePayments" ||
                entry!.source === "vendorPayments"
                  ? "Removes this payment from actual paid. Its expense stays, and the remaining balance increases."
                  : entry!.source === "legacyExpenses"
                    ? "Removes this legacy paid entry and its paired expense from active totals."
                    : "Removes this expense from active totals. Remove its recorded payments first."}{" "}
                The original and your reason stay in history.
              </p>
            </>
          )}
        </div>
        <div className="operations-actions">
          <button className="secondary-action" type="button" onClick={close}>
            Cancel
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={busy || refreshing}
          >
            {busy
              ? "Saving…"
              : recordKind === "correction"
                ? "Remove entry"
                : recordKind === "expense"
                  ? "Save expense"
                  : "Save payment"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
