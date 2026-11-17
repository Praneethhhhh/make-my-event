"use client";
import { UiIcon } from "@/modules/experience/ui-icon";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
const DraftContext = createContext<(() => void) | null>(null);
const CleanContext = createContext<(() => void) | null>(null);
export function usePanelClean() {
  return useContext(CleanContext);
}
export function usePanelDraft() {
  return useContext(DraftContext);
}
export function OperationsPanel({
  busy,
  close,
  children,
}: {
  busy: boolean;
  close: () => void;
  children: (requestClose: () => void) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const modal = dialog.current;
    modal?.showModal();
    dialog.current
      ?.querySelector<HTMLElement>("input,textarea,select")
      ?.focus();
    return () => {
      // Outside controls are inert until the native modal is closed.
      modal?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  function requestClose() {
    if (!busy) {
      if (dirty) setConfirm(true);
      else close();
    }
  }
  return (
    <dialog
      ref={dialog}
      className="operations-panel"
      aria-label="Edit wedding record"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      onChange={() => {
        setDirty(true);
      }}
    >
      <button
        className="panel-close"
        type="button"
        aria-label="Close editor"
        disabled={busy}
        onClick={requestClose}
      >
        <UiIcon name="close" />
      </button>
      {confirm && (
        <div
          className="panel-discard"
          role="alertdialog"
          aria-label="Discard this draft?"
        >
          <h2>Discard this draft?</h2>
          <p>Your saved records will stay as they are.</p>
          <button
            className="secondary-action"
            type="button"
            autoFocus
            onClick={() => {
              setConfirm(false);
              requestAnimationFrame(() =>
                dialog.current
                  ?.querySelector<HTMLElement>("input,textarea,select")
                  ?.focus(),
              );
            }}
          >
            Keep editing
          </button>
          <button className="primary-action" type="button" onClick={close}>
            Discard draft
          </button>
        </div>
      )}
      <DraftContext.Provider value={() => setDirty(true)}>
        <CleanContext.Provider value={() => setDirty(false)}>
          <div inert={confirm}>{children(requestClose)}</div>
        </CleanContext.Provider>
      </DraftContext.Provider>
    </dialog>
  );
}
