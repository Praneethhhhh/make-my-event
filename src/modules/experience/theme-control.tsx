"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { UiIcon, type IconName } from "./ui-icon";
import "./theme.css";
type Preference = "light" | "dark";
const key = "mme-theme",
  eventName = "mme-theme-change";
let memory: Preference | null = null;
function read(): Preference {
  if (memory) return memory;
  try {
    const p = localStorage.getItem(key);
    return p === "light" || p === "dark" ? p : "light";
  } catch {
    return "light";
  }
}
function apply(p: Preference) {
  const dark = p === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = p;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
function subscribe(changed: () => void) {
  const sync = () => {
    apply(read());
    changed();
  };
  const stored = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      memory = null;
      sync();
    }
  };
  window.addEventListener(eventName, sync);
  window.addEventListener("storage", stored);
  sync();
  return () => {
    window.removeEventListener(eventName, sync);
    window.removeEventListener("storage", stored);
  };
}
const serverSnapshot = (): Preference => "light";
function choose(p: Preference) {
  memory = p;
  try {
    localStorage.setItem(key, p);
  } catch {
    /* Remain usable when storage is unavailable. */
  }
  apply(p);
  window.dispatchEvent(new Event(eventName));
}
const modes: { value: Preference; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];
export function ThemePicker({ onSelect }: { onSelect?: () => void }) {
  const preference = useSyncExternalStore(subscribe, read, serverSnapshot);
  return (
    <div className="theme-picker" role="group" aria-label="Color theme">
      <p>Appearance</p>
      <div>
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={preference === mode.value}
            onClick={() => {
              choose(mode.value);
              onSelect?.();
            }}
          >
            <UiIcon name={mode.icon} />
            <span>{mode.label}</span>
            {preference === mode.value && <UiIcon name="check" size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}
export function ThemeControl() {
  const preference = useSyncExternalStore(subscribe, read, serverSnapshot),
    [open, setOpen] = useState(false),
    id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="theme-control"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="theme-trigger"
        type="button"
        aria-label="Choose color theme"
        title="Appearance"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <UiIcon name={preference === "dark" ? "moon" : "sun"} />
      </button>
      {open && (
        <div className="theme-popover" id={id}>
          <ThemePicker
            onSelect={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
