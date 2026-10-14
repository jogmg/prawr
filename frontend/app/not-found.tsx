import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-hover)]">
          Prawr / 404
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--text)]">
          This page isn’t here
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The link may be incorrect, or the page may have moved.
        </p>
        <nav aria-label="Recovery links" className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)]"
          >
            Browse streams
          </Link>
          <Link
            href="/creator"
            className="rounded-sm border border-[var(--panel-border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--brand-hover)]"
          >
            Creator dashboard
          </Link>
        </nav>
      </section>
    </main>
  );
}
