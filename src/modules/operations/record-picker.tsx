"use client";
import { useEffect, useRef, useState } from "react";
import { useOperations } from "./use-operations";
type Choice = { id: string; name: string };
export function RecordPicker({
  type,
  label,
  name,
  value,
  onChange,
  onChoice,
  required = false,
  currentName,
  empty = "None",
}: {
  type: "people" | "vendors" | "functions";
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onChoice?: (choice: Choice) => void;
  required?: boolean;
  currentName?: string | undefined;
  empty?: string;
}) {
  const { read } = useOperations();
  const epoch = useRef(0);
  const moreLock = useRef(false);
  const moreRequest = useRef<AbortController | null>(null);
  const [selectedChoice, setSelectedChoice] = useState({
    id: value,
    name: currentName ?? "Current selection",
  });
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Choice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loadedPath, setLoadedPath] = useState("");
  const path = `operations?view=choices&type=${type}&q=${encodeURIComponent(query)}`;
  const resultsCurrent = loadedPath === path;
  const choices = resultsCurrent ? items : [];
  useEffect(() => {
    const controller = new AbortController();
    epoch.current++;
    moreRequest.current?.abort();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      read<{ items: Choice[]; nextCursor: string | null }>(
        path,
        controller.signal,
      )
        .then((page) => {
          if (!controller.signal.aborted) {
            setItems(page.items);
            setCursor(page.nextCursor);
            setLoadedPath(path);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setItems([]);
            setCursor(null);
            setError("Couldn’t load choices. Try again.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [read, path, attempt]);
  return (
    <div className="record-picker">
      <label>
        {label}
        <select
          name={name}
          value={value}
          onChange={(event) => {
            setSelectedChoice({
              id: event.target.value,
              name:
                event.target.selectedOptions[0]?.textContent ??
                "Current selection",
            });
            onChange(event.target.value);
            onChoice?.({
              id: event.target.value,
              name: event.target.selectedOptions[0]?.textContent ?? "",
            });
          }}
          required={required}
          aria-busy={loading || (!resultsCurrent && !error)}
        >
          <option value="">{required ? "Choose a team member" : empty}</option>
          {value && !choices.some((item) => item.id === value) && (
            <option value={value}>
              {selectedChoice.id === value
                ? selectedChoice.name
                : (currentName ?? "Current selection")}
            </option>
          )}
          {choices.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <details className="picker-search">
        <summary>Search all choices</summary>
        <input
          type="search"
          maxLength={100}
          aria-label={`Find ${label.toLowerCase()}`}
          placeholder={`Find ${label.toLowerCase()}…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </details>
      {loading && <small role="status">Loading choices…</small>}
      {error && (
        <small role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((old) => old + 1)}>
            Retry
          </button>
        </small>
      )}
      {resultsCurrent && cursor && (
        <button
          type="button"
          className="picker-more"
          disabled={loading}
          onClick={async () => {
            if (moreLock.current) return;
            moreLock.current = true;
            const version = epoch.current;
            const controller = new AbortController();
            moreRequest.current = controller;
            setLoading(true);
            try {
              const page = await read<{
                items: Choice[];
                nextCursor: string | null;
              }>(`${path}&cursor=${cursor}`, controller.signal);
              if (controller.signal.aborted || version !== epoch.current)
                return;
              setItems((old) => [...old, ...page.items]);
              setCursor(page.nextCursor);
            } catch {
              if (!controller.signal.aborted && version === epoch.current)
                setError("Couldn’t load more choices.");
            } finally {
              moreLock.current = false;
              if (!controller.signal.aborted && version === epoch.current)
                setLoading(false);
            }
          }}
        >
          More choices
        </button>
      )}
    </div>
  );
}
