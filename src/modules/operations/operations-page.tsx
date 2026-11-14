"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { WorkspaceNav } from "@/modules/weddings/workspace-nav";
import { useOperations } from "./use-operations";
import { RecordPicker } from "./record-picker";
import {
  MentionField,
  trimmedMentions,
  type MentionRange,
} from "./mention-field";
import { functionColor } from "@/modules/functions/function-colors";
import { OperationsPanel } from "./operations-panel";
import "./operations-redesign.css";
import { EmptyState } from "./empty-state";
import { MentionText } from "./mention-text";
import { ActionIcon } from "./action-icon";
import { OperationsForm } from "./operations-form";
import {
  statuses,
  type Task,
  type Vendor,
  type Overview,
  type Notice,
  type Comment,
} from "./operations-types";
import "./operations.css";
type Area = "tasks" | "vendors" | "notifications";
type Page<T> = {
  items: T[];
  nextCursor: string | null;
  unreadCount?: number;
  total?: number;
  statusCounts?: Record<string, number>;
};
type FormKind = "task" | "vendor";
export function OperationsPage({
  area,
  taskId,
  commentId,
  taskScope,
}: {
  area: Area;
  taskId?: string;
  commentId?: string;
  taskScope?: "open" | "overdue" | "mine";
}) {
  const {
    read,
    mutate,
    busy: requestBusy,
    markClean,
    prefix,
  } = useOperations();
  const actionLock = useRef(false);
  const loadEpoch = useRef(0);
  const [acting, setActing] = useState(false);
  const busy = requestBusy || acting;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [items, setItems] = useState<(Task | Vendor | Notice)[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<{
    kind: FormKind;
    initial?: Task | Vendor;
  } | null>(null);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [ownTasks, setOwnTasks] = useState(taskScope === "mine");
  const [scopeFilter, setScopeFilter] = useState(
    taskScope === "mine" ? "open" : (taskScope ?? ""),
  );
  const [personName, setPersonName] = useState("");
  const [loadedResource, setLoadedResource] = useState("");
  const [commentRanges, setCommentRanges] = useState<MentionRange[]>([]);
  const [view, setView] = useState("list");
  const [noticeView, setNoticeView] = useState("unread");
  const [search, setSearch] = useState("");
  const [functionFilter, setFunctionFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [detail, setDetail] = useState<{
    task: Task;
    comments: Comment[];
    nextCursor: string | null;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const commentKey = useRef(crypto.randomUUID());
  const [confirmation, setConfirmation] = useState<{
    kind: "task" | "comment";
    id: string;
    revision: number;
  } | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const reload = () => setVersion((v) => v + 1);
  const resourceBase =
    area === "notifications" ? `notifications?view=${noticeView}` : area;
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  if (functionFilter) query.set("function", functionFilter);
  if (personFilter) query.set("owner", personFilter);
  if (priorityFilter) query.set("priority", priorityFilter);
  if (statusFilter) query.set("status", statusFilter);
  if (area === "tasks" && scopeFilter) query.set("scope", scopeFilter);
  if (area === "tasks" && ownTasks) query.set("mine", "true");
  const resource =
    resourceBase +
    ((area === "tasks" || area === "vendors") && query.size
      ? (resourceBase.includes("?") ? "&" : "?") + query.toString()
      : "");
  const resultsCurrent = loadedResource === resource;
  useEffect(() => {
    const controller = new AbortController();
    loadEpoch.current++;
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError("");
        setNow(Date.now());
      }
    });
    Promise.all([
      read<Overview>("operations?view=context", controller.signal),
      read<Page<Task | Vendor | Notice>>(resource, controller.signal),
      taskId
        ? read<{ task: Task; comments: Comment[]; nextCursor: string | null }>(
            `tasks/${taskId}${commentId ? `?commentId=${commentId}` : ""}`,
            controller.signal,
          )
        : Promise.resolve(null),
    ])
      .then(([data, list, current]) => {
        if (controller.signal.aborted) return;
        setOverview(data);
        setItems(list.items);
        setLoadedResource(resource);
        setTotal(list.total ?? list.items.length);
        setStatusCounts(list.statusCounts ?? {});
        setCursor(list.nextCursor);
        setDetail(current);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setOverview(null);
          setError(
            e instanceof Error ? e.message : "Could not load. Try again.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [read, resource, taskId, commentId, version, area]);
  useEffect(() => {
    if (taskId && detail && location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      target?.scrollIntoView({ behavior: "instant", block: "center" });
    }
  }, [taskId, detail]);
  function openForm(next: NonNullable<typeof form>) {
    if (form) {
      setError("Save or cancel the open form first.");
      return;
    }
    if (comment || mentions.length) {
      setError("Post or clear your comment draft before editing another form.");
      return;
    }
    setForm(next);
    setMessage("");
    setError("");
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          ".operations-form input, .operations-form select",
        )
        ?.focus(),
    );
  }
  function cancel() {
    setForm(null);
    markClean();
  }
  async function submit(data: Record<string, unknown>) {
    if (!form) return;
    const paths = {
      task: "tasks",
      vendor: "vendors",
    };
    await mutate(
      paths[form.kind] + (form.initial ? `/${form.initial.id}` : ""),
      data,
      form.initial ? "PATCH" : "POST",
    );
    setForm(null);
    markClean();
    setMessage("Saved.");
    reload();
  }
  async function action(work: () => Promise<unknown>, refresh = true) {
    if (actionLock.current) return;
    actionLock.current = true;
    setActing(true);
    setError("");
    setMessage("");
    try {
      await work();
      if (refresh) reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      actionLock.current = false;
      setActing(false);
    }
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: overview?.timeZone ?? "UTC",
    }).format(new Date(value));
  const person = (task: Task) =>
    task.ownerName ?? (task.assigneeUserId ? "Team member" : "Needs an owner");
  const tasks = items as Task[];
  const fullTask = (task: Task) => ({
    title: task.title,
    description: task.description,
    functionId: task.functionId,
    assigneeType: "USER",
    assigneeUserId: task.assigneeUserId,
    assigneeVendorId: null,
    vendorId: task.vendorId ?? task.assigneeVendorId ?? null,
    mentions: task.mentions ?? [],
    creationKey: crypto.randomUUID(),
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    revision: task.revision,
    weddingTimeZone: overview!.timeZone,
  });
  const taskCard = (task: Task) => (
    <article className="operations-card" key={task.id}>
      <div className="operations-meta">
        <span className={`operations-chip ${task.priority.toLowerCase()}`}>
          {task.priority.toLowerCase()} priority
        </span>
        <span className="operations-chip">
          {task.functionName ??
            (task.functionId ? "Archived function" : "Wedding-wide")}
        </span>
      </div>
      {!taskId && (
        <h3>
          <Link href={`${prefix}/tasks/${task.id}`}>{task.title}</Link>
        </h3>
      )}
      <p className="task-owner">
        {person(task)}
        {task.vendorName && <small> · {task.vendorName}</small>}
      </p>
      {task.dueAt && (
        <p
          className={
            task.status !== "COMPLETED" && Date.parse(task.dueAt) < now
              ? "operations-overdue"
              : ""
          }
        >
          Due {date(task.dueAt)}
        </p>
      )}
      <div className="operations-actions">
        <label>
          Status{" "}
          <select
            aria-label={`Status for ${task.title}`}
            disabled={busy || !!form || !task.ownerActive}
            value={task.status}
            onChange={(e) =>
              void action(() =>
                mutate(
                  `tasks/${task.id}`,
                  { ...fullTask(task), status: e.target.value },
                  "PATCH",
                ),
              )
            }
          >
            {Object.entries(statuses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-action"
          disabled={busy || !!form}
          onClick={() => openForm({ kind: "task", initial: task })}
        >
          Edit
        </button>
        <button
          className="secondary-action"
          disabled={busy || !!form || !!comment || mentions.length > 0}
          onClick={() => {
            setConfirmation({
              kind: "task",
              id: task.id,
              revision: task.revision,
            });
            confirmDialog.current?.showModal();
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );
  async function postComment(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      await mutate(
        `tasks/${taskId}/comments${editingComment ? `/${editingComment.id}` : ""}`,
        {
          body: comment.trim(),
          mentionedUserIds: mentions,
          mentionRanges: trimmedMentions(comment, commentRanges),
          ...(editingComment
            ? { revision: editingComment.revision }
            : { creationKey: commentKey.current }),
        },
        editingComment ? "PATCH" : "POST",
      );
      commentKey.current = crypto.randomUUID();
      setComment("");
      setMentions([]);
      setCommentRanges([]);
      setEditingComment(null);
      markClean();
      setMessage(editingComment ? "Comment updated." : "Comment posted.");
    });
  }
  const noticeGroups = new Map<string, Notice[]>();
  if (area === "notifications")
    for (const notice of [...(items as Notice[])].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    )) {
      const label = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "long",
        timeZone: overview?.timeZone ?? "UTC",
      }).format(new Date(notice.createdAt));
      noticeGroups.set(label, [...(noticeGroups.get(label) ?? []), notice]);
    }
  const heading = taskId
    ? (detail?.task.title ?? "Task details")
    : {
        tasks: "Tasks",
        vendors: "Vendors",
        notifications: "Notifications",
      }[area];
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={overview?.displayName ?? ""} />
      <WorkspaceNav active={area} />
      <div className="operations-workspace">
        <header className="operations-heading">
          <div>
            <p className="operations-kicker">
              {overview?.title ?? "YOUR WEDDING"}
            </p>
            <h1>{heading}</h1>
            <p>
              {area === "tasks"
                ? "Shared plans, clear responsibilities."
                : area === "vendors"
                  ? "Your wedding contacts."
                  : area === "notifications"
                    ? "Assignments and mentions from your team."
                    : "The next steps for your celebration."}
            </p>
          </div>
          {area === "tasks" && !taskId && (
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => openForm({ kind: "task" })}
            >
              New task
            </button>
          )}
          {area === "vendors" && (
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => openForm({ kind: "vendor" })}
            >
              Add vendor
            </button>
          )}
        </header>
        {error && (
          <div className="operations-alert" role="alert">
            {error}{" "}
            <button
              type="button"
              className="secondary-action"
              disabled={loading}
              onClick={() => {
                if (form || comment || mentions.length) {
                  setError("Save or cancel your draft before refreshing.");
                  return;
                }
                reload();
              }}
            >
              Refresh
            </button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {loading && !overview ? (
          <p className="loading-state" role="status">
            Loading your workspace…
          </p>
        ) : (
          overview && (
            <>
              {form && (
                <OperationsPanel busy={busy} close={cancel}>
                  {(closePanel) => (
                    <OperationsForm
                      key={`${form.kind}:${form.initial?.id ?? "new"}`}
                      kind={form.kind}
                      overview={overview}
                      initial={form.initial ?? null}
                      busy={busy}
                      submit={submit}
                      cancel={closePanel}
                    />
                  )}
                </OperationsPanel>
              )}
              {loading && (
                <p role="status" className="operations-subtle">
                  Updating results…
                </p>
              )}
              {area === "tasks" && !taskId && (
                <>
                  <div
                    className="task-audience"
                    aria-label="Task ownership filter"
                  >
                    <div className="operations-tabs">
                      <button
                        aria-pressed={!ownTasks && !personFilter}
                        onClick={() => {
                          setOwnTasks(false);
                          setPersonFilter("");
                          setPersonName("");
                          setScopeFilter("");
                        }}
                      >
                        All team tasks
                      </button>
                      <button
                        aria-pressed={ownTasks}
                        onClick={() => {
                          setOwnTasks(true);
                          setPersonFilter("");
                          setPersonName("");
                          setScopeFilter("");
                        }}
                      >
                        My tasks
                      </button>
                    </div>
                    <p role="status">
                      {scopeFilter === "overdue"
                        ? "Overdue · "
                        : scopeFilter === "open"
                          ? "Open · "
                          : ""}
                      {personFilter
                        ? `Tasks owned by ${personName || "the selected team member"}`
                        : ownTasks
                          ? "Tasks assigned to you"
                          : "Tasks for all team members"}
                    </p>
                    <button
                      className="picker-more"
                      onClick={() => {
                        setOwnTasks(false);
                        setPersonFilter("");
                        setPersonName("");
                        setScopeFilter("");
                        setSearch("");
                        setFunctionFilter("");
                        setPriorityFilter("");
                        setStatusFilter("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                  <div className="operations-tabs">
                    <button
                      aria-pressed={view === "list"}
                      onClick={() => setView("list")}
                    >
                      List
                    </button>
                    <button
                      aria-pressed={view === "kanban"}
                      onClick={() => setView("kanban")}
                    >
                      Kanban
                    </button>
                  </div>
                  <div className="operations-toolbar">
                    <label>
                      Search tasks
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        type="search"
                        maxLength={100}
                      />
                    </label>
                  </div>
                  <details className="task-filters">
                    <summary>
                      Filters
                      {personFilter || functionFilter || priorityFilter
                        ? " · Active"
                        : ""}
                    </summary>
                    <div className="operations-toolbar">
                      <RecordPicker
                        type="functions"
                        name="functionFilter"
                        label="Function"
                        value={functionFilter}
                        onChange={setFunctionFilter}
                        empty="All functions"
                      />
                      <RecordPicker
                        type="people"
                        name="ownerFilter"
                        label="Owner"
                        value={personFilter}
                        onChange={(value) => {
                          setPersonFilter(value);
                          setOwnTasks(false);
                          setScopeFilter("");
                        }}
                        onChoice={(choice) => setPersonName(choice.name)}
                        empty="All team members"
                      />
                      <label>
                        Priority
                        <select
                          value={priorityFilter}
                          onChange={(e) => setPriorityFilter(e.target.value)}
                        >
                          <option value="">All priorities</option>
                          {["LOW", "NORMAL", "HIGH"].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </details>
                  <div className="operations-result-bar">
                    <span>
                      {total} {total === 1 ? "task" : "tasks"} found
                    </span>
                    <label>
                      Status
                      <select
                        value={statusFilter}
                        onChange={(event) =>
                          setStatusFilter(event.target.value)
                        }
                      >
                        <option value="">All statuses</option>
                        {Object.entries(statuses).map(([key, label]) => (
                          <option value={key} key={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {!resultsCurrent || loading ? (
                    <p role="status" className="results-loading">
                      Loading tasks…
                    </p>
                  ) : !tasks.length ? (
                    <EmptyState
                      kind="tasks"
                      title={
                        search ||
                        personFilter ||
                        ownTasks ||
                        scopeFilter ||
                        priorityFilter ||
                        statusFilter ||
                        functionFilter
                          ? "No matching tasks"
                          : view === "kanban"
                            ? "Your board is ready"
                            : "No tasks yet"
                      }
                    >
                      {search ||
                      personFilter ||
                      ownTasks ||
                      scopeFilter ||
                      priorityFilter ||
                      statusFilter ||
                      functionFilter
                        ? "Try another owner or clear the filters to see more tasks."
                        : "Use New task to add the first thing your team needs to do."}
                    </EmptyState>
                  ) : view === "kanban" ? (
                    <div className="operations-grid">
                      {Object.entries(statuses).map(([status, label]) => (
                        <section className="operations-column" key={status}>
                          <h2>
                            {label} · {statusCounts[status] ?? 0}
                          </h2>
                          {tasks
                            .filter((t) => t.status === status)
                            .map(taskCard)}
                          {!tasks.some((t) => t.status === status) && (
                            <p>
                              {(statusCounts[status] ?? 0) > 0
                                ? "Load more tasks to see this column."
                                : "No tasks here."}
                            </p>
                          )}
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="operations-list">
                      {tasks.map(taskCard)}
                      {!tasks.length && (
                        <div className="operations-empty">
                          {search ||
                          personFilter ||
                          ownTasks ||
                          scopeFilter ||
                          priorityFilter ||
                          statusFilter ||
                          functionFilter
                            ? "No tasks match your current filters."
                            : "No tasks yet. Start with one thing to do together."}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {area === "tasks" && taskId && detail && (
                <>
                  <Link href={`${prefix}/tasks`}>← All tasks</Link>
                  <div className="task-detail-summary">
                    {taskCard(detail.task)}
                  </div>
                  <div className="task-description">
                    <h2>Description</h2>
                    <p className="discussion-body">
                      <MentionText
                        text={
                          detail.task.description || "No description added."
                        }
                        mentions={
                          detail.task.mentions?.filter(
                            (mention) => mention.field === "description",
                          ) ?? []
                        }
                      />
                    </p>
                  </div>
                  <section
                    className="operations-comments"
                    aria-label="Task conversation"
                  >
                    <header className="discussion-heading">
                      <h2>Conversation</h2>
                      <p>Updates from your organizing team.</p>
                    </header>
                    {detail.nextCursor && (
                      <button
                        className="secondary-action operations-load-more"
                        onClick={() =>
                          void action(async () => {
                            const more = await read<typeof detail>(
                              `tasks/${taskId}?cursor=${detail.nextCursor}`,
                            );
                            setDetail({
                              ...detail,
                              comments: [
                                ...new Map(
                                  [...detail.comments, ...more.comments].map(
                                    (comment) => [comment.id, comment],
                                  ),
                                ).values(),
                              ],
                              nextCursor: more.nextCursor,
                            });
                          }, false)
                        }
                      >
                        Older comments
                      </button>
                    )}
                    <div className="discussion-thread">
                      {detail.comments
                        .slice()
                        .sort(
                          (a, b) =>
                            a.createdAt.localeCompare(b.createdAt) ||
                            a.id.localeCompare(b.id),
                        )
                        .map((c) => (
                          <article
                            key={c.id}
                            id={`comment-${c.id}`}
                            className="discussion-comment operations-comment"
                          >
                            <header className="discussion-comment-header">
                              <div>
                                <strong>{c.authorName}</strong>
                                <time dateTime={c.createdAt}>
                                  {date(c.createdAt)}
                                </time>
                              </div>
                              <div className="operations-actions">
                                {c.authorUserId === overview.userId && (
                                  <button
                                    className="discussion-icon"
                                    aria-label="Edit comment"
                                    title="Edit comment"
                                    disabled={busy || !!form}
                                    onClick={() => {
                                      if (comment || editingComment) {
                                        setError(
                                          "Post or clear your current comment first.",
                                        );
                                        return;
                                      }
                                      setEditingComment(c);
                                      setComment(c.body);
                                      setCommentRanges(c.mentionRanges ?? []);
                                      setMentions(c.mentionedUserIds);
                                      document
                                        .querySelector<HTMLTextAreaElement>(
                                          'textarea[name="body"]',
                                        )
                                        ?.focus();
                                    }}
                                  >
                                    <ActionIcon name="edit" />
                                  </button>
                                )}
                                {(c.authorUserId === overview.userId ||
                                  overview.role === "ADMIN") && (
                                  <button
                                    className="discussion-icon"
                                    aria-label="Remove comment"
                                    title="Remove comment"
                                    disabled={busy || !!form}
                                    onClick={() => {
                                      setConfirmation({
                                        kind: "comment",
                                        id: c.id,
                                        revision: c.revision,
                                      });
                                      confirmDialog.current?.showModal();
                                    }}
                                  >
                                    <ActionIcon name="remove" />
                                  </button>
                                )}
                              </div>{" "}
                            </header>
                            <p className="discussion-body">
                              <MentionText
                                text={c.body}
                                mentions={c.mentionRanges ?? []}
                              />
                            </p>
                          </article>
                        ))}
                      {!detail.comments.length && (
                        <div className="operations-empty">
                          Start the conversation.
                        </div>
                      )}
                    </div>
                    <div className="discussion-composer">
                      {editingComment && (
                        <p className="editing-comment-label">
                          Editing your comment
                        </p>
                      )}
                      <form
                        className="operations-form"
                        hidden={!!form}
                        onSubmit={(event) => void postComment(event)}
                      >
                        <fieldset disabled={busy}>
                          <MentionField
                            name="body"
                            label="Write a comment"
                            value={comment}
                            onChange={(value) => {
                              setComment(value);
                              commentKey.current = crypto.randomUUID();
                              setMessage("");
                            }}
                            mentions={commentRanges}
                            onMentions={(ranges) => {
                              setCommentRanges(ranges);
                              setMentions([
                                ...new Set(ranges.map((range) => range.userId)),
                              ]);
                              commentKey.current = crypto.randomUUID();
                            }}
                            multiline
                            required
                          />
                          <p className="operations-subtle">
                            Selected members receive an in-app notification.
                          </p>
                          <button type="submit" className="primary-action">
                            {busy
                              ? "Saving…"
                              : editingComment
                                ? "Save comment"
                                : "Post comment"}
                          </button>
                          {editingComment && (
                            <button
                              type="button"
                              className="secondary-action"
                              onClick={() => {
                                setEditingComment(null);
                                setComment("");
                                setMentions([]);
                                setCommentRanges([]);
                                markClean();
                              }}
                            >
                              Cancel edit
                            </button>
                          )}
                        </fieldset>
                      </form>{" "}
                    </div>
                  </section>
                </>
              )}
              {area === "vendors" && (
                <>
                  <div className="operations-toolbar">
                    <label>
                      Search vendors
                      <input
                        type="search"
                        maxLength={100}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="operations-grid">
                    {(items as Vendor[]).map((v) => (
                      <article
                        className="operations-card vendor-directory-card"
                        key={v.id}
                        style={{
                          borderTopColor: v.color
                            ? functionColor(v.color).hex
                            : "#c4c5be",
                        }}
                      >
                        <div className="operations-meta">
                          <span className="operations-chip">{v.category}</span>
                          <span>
                            {v.status === "ACTIVE" ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <h2>{v.name}</h2>
                        <div className="vendor-phone-list">
                          {v.phones.map((phone) => (
                            <a
                              href={`tel:${phone.replace(/[^+0-9]/g, "")}`}
                              key={phone}
                            >
                              {phone}
                            </a>
                          ))}
                        </div>
                        {v.internalNotes && (
                          <p className="vendor-notes">{v.internalNotes}</p>
                        )}
                        <button
                          className="secondary-action"
                          onClick={() =>
                            openForm({ kind: "vendor", initial: v })
                          }
                        >
                          Edit
                        </button>
                      </article>
                    ))}
                  </div>
                  {!items.length && (
                    <div className="operations-empty">
                      Add the people helping bring your celebration together.
                    </div>
                  )}
                </>
              )}
              {area === "notifications" && (
                <>
                  <div className="operations-tabs">
                    <button
                      aria-pressed={noticeView === "unread"}
                      onClick={() => setNoticeView("unread")}
                    >
                      Unread
                    </button>
                    <button
                      aria-pressed={noticeView === "all"}
                      onClick={() => setNoticeView("all")}
                    >
                      All history
                    </button>
                  </div>
                  <div className="operations-toolbar notification-tools">
                    <button
                      className="secondary-action"
                      disabled={busy}
                      onClick={() =>
                        void action(() => mutate("notifications/read-all", {}))
                      }
                    >
                      Mark all as read
                    </button>
                    <button
                      className="secondary-action"
                      disabled={loading}
                      onClick={reload}
                    >
                      Refresh notifications
                    </button>
                  </div>
                  {!resultsCurrent || loading ? (
                    <p className="results-loading" role="status">
                      Loading notification history…
                    </p>
                  ) : (
                    <div className="operations-list notification-feed">
                      {Array.from(noticeGroups, ([day, notices]) => (
                        <section className="notification-group" key={day}>
                          <h2>{day}</h2>
                          {notices.map((n) => (
                            <article
                              className={`notification-row ${n.readAt ? "" : "is-unread"}`}
                              key={n.id}
                            >
                              <span
                                className="notification-avatar"
                                aria-hidden="true"
                              >
                                {Array.from(n.actorName)[0]}
                              </span>
                              <div className="notification-content">
                                <h3>
                                  <strong>{n.actorName}</strong>{" "}
                                  {n.kind === "ASSIGNED"
                                    ? "assigned you a task"
                                    : n.kind === "ASSIGNED_MENTION"
                                      ? "assigned and mentioned you"
                                      : "mentioned you"}
                                </h3>
                                <p className="notification-task">
                                  {n.taskTitle}
                                </p>
                                {n.excerpt && (
                                  <p className="notification-preview">
                                    {n.excerpt}
                                  </p>
                                )}
                                <div className="notification-meta">
                                  <time
                                    dateTime={n.createdAt}
                                    title={date(n.createdAt)}
                                  >
                                    {new Intl.DateTimeFormat("en-IN", {
                                      timeStyle: "short",
                                      timeZone: overview.timeZone,
                                    }).format(new Date(n.createdAt))}
                                  </time>
                                  {n.available ? (
                                    <Link
                                      href={`${prefix}/tasks/${n.taskId}${n.commentId ? `?commentId=${n.commentId}#comment-${n.commentId}` : ""}`}
                                      onClick={() => {
                                        void mutate(
                                          `notifications/${n.id}`,
                                          { read: true },
                                          "PATCH",
                                        ).catch(() => {});
                                      }}
                                    >
                                      {n.commentId
                                        ? "Open comment →"
                                        : "Open task →"}
                                    </Link>
                                  ) : (
                                    <span>
                                      Task or comment no longer available
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                className="discussion-icon"
                                disabled={busy}
                                aria-label={
                                  n.readAt ? "Mark unread" : "Mark read"
                                }
                                title={n.readAt ? "Mark unread" : "Mark read"}
                                onClick={() =>
                                  void action(() =>
                                    mutate(
                                      `notifications/${n.id}`,
                                      { read: !n.readAt },
                                      "PATCH",
                                    ),
                                  )
                                }
                              >
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  aria-hidden="true"
                                >
                                  <path
                                    d={
                                      n.readAt
                                        ? "M20 12a8 8 0 1 1-8-8M17 3h4v4"
                                        : "m5 12 4 4L19 6"
                                    }
                                  />
                                </svg>
                              </button>
                            </article>
                          ))}
                        </section>
                      ))}
                      {!items.length && (
                        <EmptyState
                          kind="notifications"
                          title={
                            noticeView === "unread"
                              ? "You’re all caught up"
                              : "No notifications yet"
                          }
                          action={
                            noticeView === "unread" ? (
                              <button
                                className="secondary-action"
                                onClick={() => setNoticeView("all")}
                              >
                                View all history
                              </button>
                            ) : undefined
                          }
                        >
                          {noticeView === "unread"
                            ? "No unread assignments or mentions. Your previous notifications are in All history."
                            : "Assignments and mentions from your team will appear here."}
                        </EmptyState>
                      )}
                    </div>
                  )}
                </>
              )}
              {resultsCurrent && !loading && cursor && !taskId && (
                <button
                  className="secondary-action operations-load-more"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const epoch = loadEpoch.current;
                      const page = await read<Page<Task | Vendor | Notice>>(
                        resource +
                          (resource.includes("?") ? "&" : "?") +
                          `cursor=${cursor}`,
                      );
                      if (epoch !== loadEpoch.current) return;
                      setItems((old) => [...old, ...page.items]);
                      setCursor(page.nextCursor);
                    }, false)
                  }
                >
                  Load more
                </button>
              )}
            </>
          )
        )}
      </div>
      <dialog
        ref={confirmDialog}
        className="team-dialog"
        aria-labelledby="operation-confirm-title"
      >
        <h2 id="operation-confirm-title">
          {confirmation?.kind === "task"
            ? "Delete this task?"
            : confirmation?.kind === "comment"
              ? "Remove this comment?"
              : "Remove this comment?"}
        </h2>
        <p>
          {confirmation?.kind === "task"
            ? "It will leave the task board. Its comment history is retained."
            : confirmation?.kind === "comment"
              ? "This comment will no longer be shown to your team."
              : "This comment will no longer be shown to your team."}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmation) return;
            void action(async () => {
              if (confirmation.kind === "task")
                await mutate(
                  `tasks/${confirmation.id}`,
                  { revision: confirmation.revision },
                  "DELETE",
                );
              else if (confirmation.kind === "comment")
                await mutate(
                  `tasks/${taskId}/comments/${confirmation.id}`,
                  { revision: confirmation.revision },
                  "DELETE",
                );
              confirmDialog.current?.close();
              setConfirmation(null);
              if (!form && !comment && !mentions.length) markClean();
            });
          }}
        >
          {error && (
            <p role="alert" className="operations-alert">
              {error}
            </p>
          )}
          <div className="operations-actions">
            <button
              className="secondary-action"
              type="button"
              autoFocus
              onClick={() => {
                confirmDialog.current?.close();
                setConfirmation(null);
                if (!form && !comment && !mentions.length) markClean();
              }}
            >
              Cancel
            </button>
            <button className="primary-action" disabled={busy} type="submit">
              {busy
                ? "Saving…"
                : confirmation?.kind === "task"
                  ? "Delete task"
                  : confirmation?.kind === "comment"
                    ? "Remove comment"
                    : "Remove comment"}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
