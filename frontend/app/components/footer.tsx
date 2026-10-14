import Link from "next/link";
import { FaLaptopCode } from "react-icons/fa6";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="flex flex-col gap-2 items-center min-[300px]:flex-row min-[300px]:justify-between py-2 text-sm border-t border-[var(--panel-border)] px-4 sm:px-6">
      <Logo />
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <p className="text-center text-[var(--muted)]">
          &copy; {new Date().getFullYear()} Prawr. All rights reserved.
        </p>
        <div className="flex items-center gap-3">
          {/* <Link
            href="#"
            target="_blank"
            aria-label="Prawr on X"
            title="X"
            className="grid size-9 shrink-0 place-items-center rounded-sm border border-[var(--panel-border)] text-[var(--muted)] transition hover:border-[var(--brand-hover)] hover:text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          >
            <FaXTwitter size={18} aria-hidden="true" />
          </Link> */}
          <Link
            href="https://jogmg-frontend.vercel.app/"
            target="_blank"
            aria-label="Developer profile"
            title="Developer"
            className="grid size-9 shrink-0 place-items-center rounded-sm border border-[var(--panel-border)] text-[var(--muted)] transition hover:border-[var(--brand-hover)] hover:text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          >
            <FaLaptopCode size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
