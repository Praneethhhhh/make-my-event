export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-4 py-6 text-[var(--color-text)] sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-20 sm:gap-28">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-5">
          <span className="text-sm font-bold tracking-[0.14em] text-[var(--color-primary)] uppercase">
            Make My Event
          </span>
          <span className="text-xs tracking-wide text-[var(--color-text-muted)]">
            Celebrate with clarity
          </span>
        </header>

        <section
          className="max-w-3xl py-8 sm:py-16"
          aria-labelledby="welcome-heading"
        >
          <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-[var(--color-accent-text)] uppercase">
            Your celebration, thoughtfully organized
          </p>
          <h1
            id="welcome-heading"
            className="font-[family-name:var(--font-editorial)] text-4xl leading-tight sm:text-5xl"
          >
            Make room for the moments that matter.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[var(--color-text-muted)]">
            Bring your functions, people, tasks, and actual expenses together in
            one calm place. Built for families planning their own unforgettable
            event.
          </p>
          <div className="mt-10 inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-sm text-[var(--color-primary)] shadow-[0_1px_3px_rgba(32,42,41,0.04)]">
            The organizer workspace is coming soon.
          </div>
        </section>

        <footer className="border-t border-[var(--color-border)] py-5 text-xs text-[var(--color-text-muted)]">
          Make My Event · Designed for meaningful gatherings
        </footer>
      </div>
    </main>
  );
}
