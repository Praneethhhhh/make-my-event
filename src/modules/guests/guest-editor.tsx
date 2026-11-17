"use client";
import { useState, useRef, type FormEvent } from "react";
import {
  useOperations,
  RequestError,
} from "@/modules/operations/use-operations";
import { usePanelDraft } from "@/modules/operations/operations-panel";
import {
  localDateTime,
  localDateTimeToUtc,
} from "@/modules/weddings/zoned-date";
import { functionColor } from "@/modules/functions/function-colors";
import type { Guest, GuestManagementContext as Context } from "./guest-types";
type Selection = {
  functionId: string;
  maxAttendees: number;
  deadlineOverrideAt: string | null;
  revision?: number;
};
export function RecipientEditor({
  context,
  guest,
  busy,
  cancel,
  save,
}: {
  context: Context;
  guest: Guest | undefined;
  busy: boolean;
  cancel: () => void;
  save: (data: unknown) => Promise<void>;
}) {
  const { markDirty } = useOperations();
  const markPanelDirty = usePanelDraft();
  const [selected, setSelected] = useState<Selection[]>(
      () =>
        guest?.functions
          .filter((f) => f.eligibilityStatus === "ACTIVE")
          .map((f) => ({
            functionId: f.id,
            maxAttendees: f.maxAttendees ?? 4,
            deadlineOverrideAt: f.deadlineOverrideAt ?? null,
            revision: f.revision,
          })) ?? [],
    ),
    [error, setError] = useState(""),
    key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  // Unchecking controls eligibility, not the settings retained in this draft.
  const remembered = useRef(new Map(selected.map((f) => [f.functionId, f])));
  function choice(id: string): Selection {
    return (
      remembered.current.get(id) ?? {
        functionId: id,
        maxAttendees: 4,
        deadlineOverrideAt: null,
      }
    );
  }
  function update(id: string, data: Partial<Selection>) {
    const next = { ...choice(id), ...data };
    remembered.current.set(id, next);
    setSelected((old) => old.map((f) => (f.functionId === id ? next : f)));
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    if (!selected.length) {
      setError("Choose at least one function.");
      return;
    }
    lock.current = true;
    setError("");
    try {
      const fields = new FormData(e.currentTarget);
      await save({
        displayName: String(fields.get("displayName") ?? "").trim(),
        personalMessage: String(fields.get("personalMessage") ?? "").trim(),
        functions: selected,
        creationKey: key.current,
        ...(guest ? { revision: guest.revision } : {}),
      });
    } catch (e) {
      setError(
        e instanceof RequestError
          ? [e.message, ...Object.values(e.fields)].join(" ")
          : e instanceof Error
            ? e.message
            : "Could not save. Your draft is preserved.",
      );
    } finally {
      lock.current = false;
    }
  }
  return (
    <form
      className="operations-form guest-editor"
      onSubmit={(e) => void submit(e)}
      onChange={() => {
        key.current = crypto.randomUUID();
        setError("");
      }}
    >
      <h2>{guest ? "Edit invitation" : "Invite guest"}</h2>
      <p className="guest-subtle">A person or a family. One private link.</p>
      {error && (
        <p className="operations-alert" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        <label>
          Recipient name
          <input
            name="displayName"
            required
            maxLength={160}
            defaultValue={guest?.displayName ?? ""}
            placeholder="Elon Musk & family"
            autoComplete="off"
          />
        </label>
        <label>
          Personalized message <small>(optional)</small>
          <textarea
            name="personalMessage"
            maxLength={500}
            rows={3}
            defaultValue={
              guest?.personalMessage ?? "We would love to celebrate with you."
            }
          />
        </label>
        <div className="guest-selection-header">
          <h3>Invite to functions</h3>
          <button
            type="button"
            className="guest-text-button"
            onClick={() => {
              markDirty();
              markPanelDirty?.();
              setSelected(context.functions.map((f) => choice(f.id)));
              key.current = crypto.randomUUID();
            }}
          >
            Select all
          </button>
        </div>
        {context.functions.map((f) => {
          const value = selected.find((s) => s.functionId === f.id);
          return (
            <div
              className="guest-function-choice"
              key={f.id}
              style={{ borderLeftColor: functionColor(f.color).hex }}
            >
              <label className="guest-function-checkbox">
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, choice(f.id)]
                        : old.filter((s) => s.functionId !== f.id),
                    )
                  }
                />
                <span>
                  <strong>{f.name}</strong>
                  <small>
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: context.timeZone,
                    }).format(new Date(f.startsAt))}
                  </small>
                </span>
              </label>
              {value && (
                <>
                  <label className="guest-maximum">
                    Maximum people
                    <input
                      type="number"
                      min={1}
                      max={200}
                      required
                      value={value.maxAttendees}
                      onChange={(e) =>
                        update(f.id, { maxAttendees: Number(e.target.value) })
                      }
                    />
                  </label>
                  <small className="guest-subtle">
                    Includes the named guest · Private to your team
                  </small>
                  <details className="guest-deadline">
                    <summary>Response deadline</summary>
                    <label>
                      Deadline for {f.name} ({context.timeZone})
                      <input
                        type="datetime-local"
                        value={
                          value.deadlineOverrideAt
                            ? localDateTime(
                                value.deadlineOverrideAt,
                                context.timeZone,
                              )
                            : ""
                        }
                        max={localDateTime(f.startsAt, context.timeZone)}
                        onChange={(e) => {
                          try {
                            update(f.id, {
                              deadlineOverrideAt: e.target.value
                                ? localDateTimeToUtc(
                                    e.target.value,
                                    context.timeZone,
                                  )
                                : null,
                            });
                          } catch {
                            setError(
                              "Choose a valid local time for the response deadline.",
                            );
                          }
                        }}
                      />
                    </label>
                    <small>
                      Leave empty to close replies when this function starts.
                    </small>
                  </details>
                </>
              )}
            </div>
          );
        })}
        <div className="operations-actions">
          <button type="button" className="secondary-action" onClick={cancel}>
            Cancel
          </button>
          <button className="primary-action" disabled={busy}>
            {busy ? "Saving…" : guest ? "Save changes" : "Create invitation"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
