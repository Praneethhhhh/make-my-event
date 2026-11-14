"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  localDateTime,
  localDateTimeToUtc,
} from "@/modules/weddings/zoned-date";
import {
  MentionField,
  trimmedMentions,
  type MentionRange,
} from "./mention-field";
import { RecordPicker } from "./record-picker";
import { functionColors } from "@/modules/functions/function-colors";
import { RequestError } from "./use-operations";
import type { Task, Vendor, Overview } from "./operations-types";
type Kind = "task" | "vendor";
type Props = {
  kind: Kind;
  overview: Overview;

  initial?: Task | Vendor | null;

  busy: boolean;
  submit: (data: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
};
export function OperationsForm({
  kind,
  overview,

  initial,

  busy,
  submit,
  cancel,
}: Props) {
  const form = useRef<HTMLFormElement>(null);
  const key = useRef(crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const task = initial && "assigneeUserId" in initial ? initial : null;
  const [assignee, setAssignee] = useState(
    task ? (task.assigneeUserId ?? "") : overview.userId,
  );
  const [vendor, setVendor] = useState(
    task?.vendorId ?? task?.assigneeVendorId ?? "",
  );
  const [linkedFunction, setLinkedFunction] = useState(task?.functionId ?? "");
  const [taskTitle, setTaskTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [titleMentions, setTitleMentions] = useState<MentionRange[]>(
    task?.mentions?.filter((mention) => mention.field === "title") ?? [],
  );
  const [descriptionMentions, setDescriptionMentions] = useState<
    MentionRange[]
  >(task?.mentions?.filter((mention) => mention.field === "description") ?? []);
  const old = initial as unknown as Record<string, unknown> | null;
  const value = (name: string) =>
    typeof old?.[name] === "string" ? (old[name] as string) : "";
  const field = (
    name: string,
    label: string,
    type = "text",
    required = false,
    max = 160,
  ) => (
    <label className={type === "textarea" ? "wide" : ""} key={name}>
      {label}
      {type === "textarea" ? (
        <textarea
          name={name}
          required={required}
          defaultValue={value(name)}
          maxLength={max}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `ops-${name}-error` : undefined}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={
            name === "dueAt" && value(name)
              ? localDateTime(value(name), overview.timeZone)
              : value(name)
          }
          required={required}
          maxLength={max}
          step={type === "number" ? "0.01" : undefined}
          min={type === "number" ? "0.01" : undefined}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `ops-${name}-error` : undefined}
        />
      )}{" "}
      {errors[name] && <small id={`ops-${name}-error`}>{errors[name]}</small>}
    </label>
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setError("");
    const data = new FormData(event.currentTarget);
    const s = (name: string) => String(data.get(name) ?? "").trim();
    try {
      let payload: Record<string, unknown> = {};
      if (kind === "task") {
        payload = {
          title: taskTitle.trim(),
          description: description.trim(),
          creationKey: key.current,
          mentions: [
            ...trimmedMentions(taskTitle, titleMentions).map((mention) => ({
              ...mention,
              field: "title",
            })),
            ...trimmedMentions(description, descriptionMentions).map(
              (mention) => ({ ...mention, field: "description" }),
            ),
          ],
          functionId: s("functionId") || null,
          assigneeType: "USER",
          assigneeUserId: assignee,
          assigneeVendorId: null,
          vendorId: vendor || null,
          status: s("status"),
          priority: s("priority"),
          dueAt: s("dueAt")
            ? localDateTimeToUtc(s("dueAt"), overview.timeZone)
            : null,
          weddingTimeZone: overview.timeZone,
        };
      } else if (kind === "vendor")
        payload = {
          name: s("name"),
          category: s("category"),
          phones: s("phones")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          color: s("color"),
          internalNotes: s("internalNotes"),
          status: s("status"),
        };
      if (initial) payload.revision = initial.revision;
      await submit(payload);
    } catch (e) {
      const problem =
        e instanceof Error ? e.message : "Could not save. Try again.";
      setError(problem);
      if (e instanceof RequestError) {
        const fields = Object.fromEntries(
          Object.entries(e.fields).map(([key, value]) => [
            key === "amountPaise" ? "amount" : key.split(".")[0]!,
            value,
          ]),
        );
        setErrors(fields);
        setError([problem, ...new Set(Object.values(fields))].join(" "));
        const first = Object.keys(fields)[0];
        requestAnimationFrame(() => {
          const target = first ? form.current?.elements.namedItem(first) : null;
          if (target instanceof HTMLElement) target.focus();
        });
      }
    }
  }
  const heading =
    kind === "task"
      ? initial
        ? "Edit task"
        : "New task"
      : initial
        ? "Edit vendor"
        : "Add vendor";
  return (
    <form
      ref={form}
      className="operations-form"
      onSubmit={(event) => void save(event)}
      onChange={() => {
        key.current = crypto.randomUUID();
        setError("");
        setErrors({});
      }}
      aria-busy={busy}
    >
      <h2>{heading}</h2>
      {error && (
        <p role="alert" className="operations-alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        <div className="operations-fields">
          {kind === "task" && (
            <>
              <MentionField
                name="title"
                label="Task title"
                value={taskTitle}
                onChange={setTaskTitle}
                mentions={titleMentions}
                onMentions={(ranges) => {
                  setTitleMentions(ranges);
                  key.current = crypto.randomUUID();
                  setError("");
                }}
                required
                maxLength={160}
              />
              <label>
                Status
                <select name="status" defaultValue={value("status") || "TODO"}>
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </label>
              <RecordPicker
                type="functions"
                name="functionId"
                label="Function"
                value={linkedFunction}
                onChange={setLinkedFunction}
                empty="Wedding-wide"
                currentName={
                  task?.functionName ?? "Current function (may be archived)"
                }
              />
              <RecordPicker
                type="people"
                name="assignee"
                label="Task owner"
                value={assignee}
                onChange={setAssignee}
                currentName={
                  assignee === overview.userId
                    ? `${overview.displayName} (You)`
                    : task?.ownerName
                }
                required
              />
              <RecordPicker
                type="vendors"
                name="vendorId"
                label="Vendor (optional)"
                value={vendor}
                onChange={setVendor}
                currentName={task?.vendorName}
              />
              <label>
                Priority
                <select
                  name="priority"
                  defaultValue={value("priority") || "NORMAL"}
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
              {field(
                "dueAt",
                `Deadline (${overview.timeZone})`,
                "datetime-local",
              )}
              <MentionField
                name="description"
                label="Description"
                value={description}
                onChange={setDescription}
                mentions={descriptionMentions}
                onMentions={(ranges) => {
                  setDescriptionMentions(ranges);
                  key.current = crypto.randomUUID();
                  setError("");
                }}
                multiline
              />
            </>
          )}
          {kind === "vendor" && (
            <>
              {field("name", "Vendor name", "text", true)}
              {field("category", "Category", "text", true, 80)}
              <label>
                Phone numbers (comma-separated)
                <input
                  name="phones"
                  type="text"
                  required
                  defaultValue={
                    initial && "phones" in initial
                      ? initial.phones.join(", ")
                      : ""
                  }
                  maxLength={160}
                />
                {errors.phones && <small>{errors.phones}</small>}
              </label>
              <fieldset className="vendor-colors">
                <legend>Card color *</legend>
                {functionColors.map((color) => (
                  <label key={color.value}>
                    <input
                      type="radio"
                      name="color"
                      value={color.value}
                      required
                      defaultChecked={value("color") === color.value}
                    />
                    <span style={{ background: color.hex }} />
                    {color.label}
                  </label>
                ))}
              </fieldset>
              <label>
                Status
                <select
                  name="status"
                  defaultValue={value("status") || "ACTIVE"}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              {field(
                "internalNotes",
                "Internal notes",
                "textarea",
                false,
                4000,
              )}
            </>
          )}
        </div>
        <div className="operations-actions">
          <button className="primary-action" type="submit">
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="secondary-action" type="button" onClick={cancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
