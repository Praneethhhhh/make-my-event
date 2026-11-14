"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useOperations } from "./use-operations";
import { usePanelDraft } from "./operations-panel";

import {
  activeMentionQuery,
  moveMentions,
  type MentionRange,
} from "./mention-ranges";
export { trimmedMentions, type MentionRange } from "./mention-ranges";
export function MentionField({
  name,
  label,
  value,
  onChange,
  mentions,
  onMentions,
  multiline = false,
  required = false,
  maxLength = 4000,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  mentions: MentionRange[];
  onMentions: (value: MentionRange[]) => void;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  const { read, markDirty } = useOperations();
  const markPanelDirty = usePanelDraft();
  const id = useId();
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState("");
  function search(text: string, caret: number, ranges = mentions) {
    request.current?.abort();
    const match = activeMentionQuery(text, caret, ranges);
    if (!match) {
      setQuery(null);
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const start = match.start;
    setQuery({ start, end: caret });
    setSelected(0);
    setStatus("Finding team members…");
    read<{ items: { id: string; name: string }[]; nextCursor?: string | null }>(
      `operations?view=choices&type=people&q=${encodeURIComponent(match.text)}`,
      controller.signal,
    )
      .then((page) => {
        if (!controller.signal.aborted) {
          setOptions(page.items);
          setStatus(
            page.items.length
              ? page.nextCursor
                ? "Keep typing to narrow the first 50 matches."
                : ""
              : "No team members found.",
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOptions([]);
          setStatus("Couldn’t load people. Type @ again to retry.");
        }
      });
  }
  function choose(person: { id: string; name: string }) {
    if (!query) return;
    const token = `@${person.name}`;
    const next =
      value.slice(0, query.start) + token + " " + value.slice(query.end);
    if (next.length > maxLength) {
      setStatus("There isn’t enough space for this mention.");
      return;
    }
    const nextMentions = moveMentions(value, next, mentions);
    markDirty();
    markPanelDirty?.();
    onChange(next);
    onMentions([
      ...nextMentions,
      {
        userId: person.id,
        start: query.start,
        end: query.start + token.length,
      },
    ]);
    setQuery(null);
    setOptions([]);
    request.current?.abort();
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        query.start + token.length + 1,
        query.start + token.length + 1,
      );
    });
  }
  const props = {
    id,
    name,
    value,
    required,
    maxLength,
    "aria-autocomplete": "list" as const,
    "aria-controls": query ? `${id}-people` : undefined,
    "aria-activedescendant":
      query && options[selected] ? `${id}-option-${selected}` : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const next = event.target.value;
      const moved = moveMentions(value, next, mentions);
      onMentions(moved);
      onChange(next);
      search(next, event.target.selectionStart ?? next.length, moved);
    },
    onClick: (
      event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => search(value, event.currentTarget.selectionStart ?? value.length),
    onKeyUp: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        search(value, event.currentTarget.selectionStart ?? value.length);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (!query) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setQuery(null);
        request.current?.abort();
      } else if (
        options.length &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        setSelected(
          (old) =>
            (old + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length,
        );
      } else if (event.key === "Enter" && options[selected]) {
        event.preventDefault();
        choose(options[selected]!);
      }
    },
    onBlur: () => {
      setTimeout(() => setQuery(null), 150);
    },
  };
  return (
    <div className="mention-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          {...props}
          ref={(node) => {
            input.current = node;
          }}
        />
      ) : (
        <input
          {...props}
          ref={(node) => {
            input.current = node;
          }}
        />
      )}
      {query && (
        <div className="mention-options">
          <ul
            id={`${id}-people`}
            role="listbox"
            aria-label="Mention a team member"
          >
            {options.map((person, index) => (
              <li
                key={person.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={selected === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
              >
                {person.name}
              </li>
            ))}
          </ul>
          {status && <p role="status">{status}</p>}
        </div>
      )}
      <small>Type @ to mention someone.</small>
    </div>
  );
}
