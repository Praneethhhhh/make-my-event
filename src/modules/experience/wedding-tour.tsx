"use client";

import { lazy, Suspense, useCallback, useEffect, useRef } from "react";
const TourWorkspace = lazy(() => import("./tour-workspace"));
import { pages, targets } from "./tour-content";
import "./wedding-tour.css";

const last = targets.length + pages.length;
const exampleStart = targets.length + 1;
const safeReturn =
  /^\/(?:account|weddings\/(?:new|join|[a-f0-9]{24}(?:\/(?:dashboard|functions|tasks(?:\/[a-f0-9]{24})?|team|guests(?:\/preview)?|vendors|finance|details|notifications))?))$/;

const anchors: Record<string, string> = {
  Dashboard: ".dashboard-metric",
  Functions: ".functions-columns form h2",
  Team: "#invite-email, .team-workspace form h2",
  Tasks: ".operations-heading .primary-action",
  Vendors: ".operations-heading .primary-action",
  Notifications: ".notification-bell",
  Guests: "header button.primary-action",
  Finance: ".operations-heading .primary-action",
  "Wedding details": "input[name=startsOn]",
};
export function WeddingTour({
  accountId,
  step,
  setStep,
}: {
  accountId: string;
  step: number;
  setStep: (step: number) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const returnPath = useRef("");
  const target = targets[step - 1];
  const page = pages[step - exampleStart];
  const title = target?.title ?? page?.title ?? "Welcome to Make My Event";

  useEffect(() => {
    function openTour() {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setStep(0);

      try {
        localStorage.setItem(`mme:tour:v1:${accountId}`, "seen");
      } catch {
        // The guide works without storage.
      }
    }

    const url = new URL(window.location.href);
    const mode = url.searchParams.get("tour");
    if (mode === "welcome" || mode === "manual") {
      const from = url.searchParams.get("tourFrom") ?? "";
      if (mode === "manual" && safeReturn.test(from.split(/[?#]/, 1)[0] ?? ""))
        returnPath.current = from;
      url.searchParams.delete("tour");
      url.searchParams.delete("tourFrom");
      window.history.replaceState(window.history.state, "", url);
      let seen = false;
      try {
        seen = localStorage.getItem(`mme:tour:v1:${accountId}`) === "seen";
      } catch {
        // Show the welcome if the browser cannot remember it.
      }
      if (mode === "manual" || !seen) openTour();
    }
    window.addEventListener("mme:take-tour", openTour);
    return () => window.removeEventListener("mme:take-tour", openTour);
  }, [accountId, setStep]);

  const close = useCallback(() => {
    setStep(-1);
    if (returnPath.current) {
      window.location.replace(returnPath.current);
      return;
    }
    requestAnimationFrame(() => {
      const button = opener.current;
      if (
        button?.isConnected &&
        button.getClientRects().length &&
        button !== document.body
      )
        button.focus();
      else
        document
          .querySelector<HTMLElement>(
            ".wedding-header [aria-label='Account menu']",
          )
          ?.focus();
    });
  }, [setStep]);
  useEffect(() => {
    if (step < 0) return;
    heading.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", escape);
    const selector = target
      ? `[data-tour="${target.target}"]`
      : page
        ? (anchors[page.title] ?? "h1")
            .split(",")
            .map((s) => "[data-tour-workspace] " + s.trim())
            .join(",")
        : "";
    let marked: HTMLElement | null = null;
    const guide = document.querySelector<HTMLElement>(".tour-guide");
    function reveal() {
      if (!marked || !guide) return;
      const overlap =
        marked.getBoundingClientRect().bottom -
        guide.getBoundingClientRect().top +
        12;
      if (overlap > 0) window.scrollBy({ top: overlap, behavior: "instant" });
    }
    const guideObserver = new ResizeObserver(reveal);
    if (guide) guideObserver.observe(guide);
    let frame = 0;
    function mark() {
      if (!selector) return;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el || marked === el) return;
      marked?.removeAttribute("data-tour-current");
      marked = el;
      el.setAttribute("data-tour-current", "");
      el.scrollIntoView({ block: "center", behavior: "instant" });
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reveal);
    }
    mark();
    const observer = new MutationObserver(mark);
    if (selector)
      observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      guideObserver.disconnect();
      cancelAnimationFrame(frame);
      marked?.removeAttribute("data-tour-current");
      window.removeEventListener("keydown", escape);
    };
  }, [step, target, page, close]);
  if (step < 0) return null;
  return (
    <>
      {page && (
        <Suspense fallback={<p role="status">Opening example wedding...</p>}>
          <TourWorkspace section={page.title} />
        </Suspense>
      )}
      <section className="tour-guide" aria-label="Wedding tour">
        <div>
          <small>
            {page ? "Example wedding · " : ""}
            {step === 0 ? "Take a tour" : `Step ${step} of ${last}`}
          </small>
          <h2 ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {step === 0 ? (
            <p>
              <strong>Administrators</strong> set up weddings and manage access.{" "}
              <strong>Organizers</strong> plan the functions, guests and costs.{" "}
              <strong>Guests</strong> open a private invitation and RSVP.
            </p>
          ) : (
            <p>{target?.text ?? page?.text}</p>
          )}
        </div>
        <nav aria-label="Tour controls">
          <button type="button" className="tour-skip" onClick={close}>
            Skip tour
          </button>
          {step > 0 && (
            <button
              type="button"
              className="secondary-action"
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="primary-action"
            onClick={() => (step === last ? close() : setStep(step + 1))}
          >
            {step === 0
              ? "Start tour"
              : step === last
                ? "Finish tour"
                : step === targets.length
                  ? "Open example wedding"
                  : "Next"}
          </button>
        </nav>
      </section>
    </>
  );
}
