"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
type Scope = {
  weddingId: string;
  prefix: string;
  fetch: typeof fetch;
  markClean: () => void;
};
const Context = createContext<Scope | null>(null);
export function useWeddingScope() {
  return useContext(Context);
}
export function useWeddingClient() {
  const scope = useWeddingScope();
  return (
    scope ?? {
      weddingId: "",
      prefix: "/weddings",
      fetch: globalThis.fetch,
      markClean: () => {},
    }
  );
}
export function WeddingScope({
  weddingId,
  children,
}: {
  weddingId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dirty = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState("");
  const [lost, setLost] = useState(false);
  const requests = useRef(new Set<AbortController>());
  const scope = useMemo<Scope>(
    () => ({
      weddingId,
      prefix: `/weddings/${weddingId}`,
      markClean: () => {
        dirty.current = false;
      },
      fetch: async (input, init) => {
        const inputPath =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.pathname
              : input.url;
        const path = new URL(inputPath, window.location.origin).pathname;
        const tenant =
          /^\/api\/v1\/(wedding(?:$|\?)|functions(?:\/|$|\?)|members(?:\/|$|\?)|member-invitations(?:\/|$|\?))/.test(
            path,
          ) && !path.endsWith("/redeem");
        const controller = new AbortController();
        requests.current.add(controller);
        const headers = new Headers(
          input instanceof Request ? input.headers : undefined,
        );
        new Headers(init?.headers).forEach((value, key) =>
          headers.set(key, value),
        );
        if (tenant) headers.set("X-Wedding-Id", weddingId);
        try {
          const response = await globalThis.fetch(input, {
            ...init,
            headers,
            signal: init?.signal
              ? AbortSignal.any([controller.signal, init.signal])
              : controller.signal,
          });
          if (!controller.signal.aborted && tenant && response.status === 401)
            window.location.replace("/sign-in");
          if (
            !controller.signal.aborted &&
            tenant &&
            response.status === 404 &&
            path === "/api/v1/wedding"
          ) {
            dirty.current = false;
            setLost(true);
          }
          return response;
        } finally {
          requests.current.delete(controller);
        }
      },
    }),
    [weddingId],
  );
  useEffect(() => {
    const pending = requests.current;
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      for (const request of pending) request.abort();
      pending.clear();
    };
  }, []);
  return (
    <Context.Provider value={scope}>
      <div
        className="contents"
        onInputCapture={(event) => {
          if ((event.target as HTMLElement).closest("form"))
            dirty.current = true;
        }}
        onChangeCapture={(event) => {
          if ((event.target as HTMLElement).closest("form"))
            dirty.current = true;
        }}
        onClickCapture={(event) => {
          const anchor = (
            event.target as HTMLElement
          ).closest<HTMLAnchorElement>("a[href]");
          if (
            !anchor ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            anchor.target === "_blank"
          )
            return;
          const url = new URL(anchor.href);
          if (
            dirty.current &&
            url.origin === location.origin &&
            url.pathname !== location.pathname
          ) {
            event.preventDefault();
            event.stopPropagation();
            setDestination(url.pathname + url.search + url.hash);
            dialog.current?.showModal();
          }
        }}
      >
        {lost ? (
          <main className="wedding-page">
            <section className="team-workspace">
              <h1>Wedding access unavailable</h1>
              <p>
                Your access may have changed, or this wedding is no longer
                active. Your other weddings are unaffected.
              </p>
              <Link
                href="/weddings"
                className="primary-action wedding-access-return"
                onClick={() => {
                  dirty.current = false;
                }}
              >
                Your weddings
              </Link>
            </section>
          </main>
        ) : (
          children
        )}
        <dialog
          ref={dialog}
          className="team-dialog"
          aria-labelledby="unsaved-title"
        >
          <h2 id="unsaved-title">Leave unsaved changes?</h2>
          <p>
            Your entries belong to this wedding. They will not be moved into
            another wedding.
          </p>
          <div className="team-result-actions">
            <button
              className="secondary-action"
              autoFocus
              onClick={() => dialog.current?.close()}
            >
              Stay
            </button>
            <button
              className="primary-action"
              onClick={() => {
                dirty.current = false;
                dialog.current?.close();
                router.push(destination);
              }}
            >
              Discard and continue
            </button>
          </div>
        </dialog>
      </div>
    </Context.Provider>
  );
}
