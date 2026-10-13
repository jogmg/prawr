"use client";

import { ConnectKitButton } from "connectkit";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";

export function Header() {
  const pathName = usePathname();

  const isCreatorPage = pathName?.startsWith("/creator");
  const isWatchPage = pathName?.startsWith("/watch");

  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 py-3 sm:py-4 border-b border-[var(--panel-border)] px-4 sm:px-6">
      <Logo />
      <div className="flex items-center gap-3">
        <ConnectKitButton.Custom>
          {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => (
            <button
              type="button"
              onClick={show}
              aria-busy={isConnecting}
              className="rounded-full border border-brand-500/70 bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-brand-100 shadow-glow transition hover:border-brand-700 hover:bg-[var(--surface-raised)] hover:text-white"
            >
              {isConnecting
                ? "Connecting..."
                : isConnected
                ? ensName ?? truncatedAddress
                : "Connect Wallet"}
            </button>
          )}
        </ConnectKitButton.Custom>
        {!isCreatorPage && !isWatchPage ? (
          <a
            href="/creator"
            className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Become a Creator
          </a>
        ) : null}
      </div>
    </header>
  );
}
