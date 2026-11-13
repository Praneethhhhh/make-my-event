"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// Animate the existing tree; never key/remount the workspace or its drafts.
export function ExperienceMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = stage.current?.querySelectorAll("main h1, .hero-copy");
    const animations = Array.from(targets ?? []).map((element) =>
      element.animate(
        [
          { opacity: 0.65, transform: "translateY(16px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)" },
      ),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [pathname]);
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new WeakSet<Element>();
    const animations = new Set<Animation>();
    const animate = (
      element: Element,
      frames: Keyframe[],
      duration: number,
    ) => {
      if (preference.matches) return;
      const animation = element.animate(frames, {
        duration,
        easing: "cubic-bezier(.2,.7,.2,1)",
      });
      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
      animation.oncancel = () => animations.delete(animation);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            animate(
              entry.target,
              [
                { opacity: 0.65, transform: "translateY(18px)" },
                { opacity: 1, transform: "translateY(0)" },
              ],
              520,
            );
          }
      },
      { threshold: 0.08 },
    );
    const discover = () => {
      root
        .querySelectorAll(
          ".experience,.features,.closing,.wedding-card,.created-card,.team-workspace,.functions-workspace,.wedding-selector,.profile-card",
        )
        .forEach((element) => {
          if (!seen.has(element)) {
            seen.add(element);
            observer.observe(element);
          }
        });
    };
    let frame = 0;
    const mutations = new MutationObserver(() => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          discover();
        });
    });
    mutations.observe(root, { childList: true, subtree: true });
    discover();
    const press = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest(
        "button,a.landing-button,a.primary-action,a.secondary-action",
      );
      if (
        !target ||
        !root.contains(target) ||
        target.matches(":disabled") ||
        event.button !== 0
      )
        return;
      animate(target, [{ scale: ".97" }, { scale: "1" }], 180);
    };
    const reduce = () => {
      if (preference.matches) {
        for (const animation of animations) animation.cancel();
        animations.clear();
      }
    };
    root.addEventListener("pointerdown", press);
    preference.addEventListener("change", reduce);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      root.removeEventListener("pointerdown", press);
      preference.removeEventListener("change", reduce);
      for (const animation of animations) animation.cancel();
    };
  }, []);
  return (
    <div ref={stage} className="route-stage">
      <div key={pathname} className="route-arrival" aria-hidden="true" />
      {children}
    </div>
  );
}
