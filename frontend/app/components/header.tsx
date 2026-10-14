"use client";

import { ConnectKitButton } from "connectkit";
import { ArrowLeftRight, Check, ChevronDown, Copy, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { Logo } from "./logo";

export function Header() {
  const pathName = usePathname();
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const { address, connector } = useAccount();
  const { data: balance } = useBalance({ address });
  const { disconnect } = useDisconnect();
  const connectorName = connector?.name?.trim();
  const isGenericConnector =
    !connectorName ||
    connector?.id === "injected" ||
    /^(injected|injected wallet|browser wallet)$/i.test(connectorName);
  const walletName = isGenericConnector ? "Browser wallet" : connectorName;
  const walletIcon = isGenericConnector ? undefined : connector?.icon;

  useEffect(() => {
    if (!isWalletMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!walletMenuRef.current?.contains(event.target as Node)) {
        setIsWalletMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsWalletMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isWalletMenuOpen]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setIsAddressCopied(true);
    toast.info("Wallet address copied");
    window.setTimeout(() => setIsAddressCopied(false), 1600);
  };

  const isCreatorPage = pathName?.startsWith("/creator");
  const isWatchPage = pathName?.startsWith("/watch");
  const isStreamsActive = pathName === "/" || isWatchPage;

  const navLinkClass = (isActive: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors ${
      isActive
        ? "bg-[var(--brand)] font-semibold text-[#1c1f1e]"
        : "font-medium text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
    }`;

  return (
    <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-b border-[var(--panel-border)] px-4 py-3 sm:px-6 sm:py-2">
      <Logo />
      <nav
        aria-label="Main navigation"
        className="main-navigation flex items-center justify-center gap-1 rounded-full border border-[var(--panel-border)] bg-[var(--background)] p-1"
      >
        <Link
          href="/"
          aria-current={isStreamsActive ? "page" : undefined}
          className={navLinkClass(isStreamsActive)}
        >
          Streams
        </Link>
        <Link
          href="/creator"
          aria-current={isCreatorPage ? "page" : undefined}
          className={navLinkClass(Boolean(isCreatorPage))}
        >
          Creator
        </Link>
      </nav>
      <ConnectKitButton.Custom>
        {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => (
          <div ref={walletMenuRef} className="relative z-[60]">
            <button
              type="button"
              onClick={() =>
                isConnected
                  ? setIsWalletMenuOpen((isOpen) => !isOpen)
                  : show?.()
              }
              aria-haspopup={isConnected ? "menu" : undefined}
              aria-expanded={isConnected ? isWalletMenuOpen : undefined}
              aria-label={
                isConnected
                  ? `Wallet ${ensName ?? truncatedAddress}; open wallet menu`
                  : "Connect wallet"
              }
              aria-busy={isConnecting}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--panel-border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            >
              {isConnected ? (
                <>
                  <span className="relative aspect-square w-7 shrink-0 overflow-hidden rounded-full">
                    {walletIcon ? (
                      <Image
                        src={walletIcon}
                        alt="wallet icon"
                        className="size-full object-cover"
                        fill
                      />
                    ) : (
                      <div className="size-full bg-gradient-to-br from-[#8f75ff] to-[#2766ed] text-white shadow-[0_0_22px_rgba(90,102,255,0.24)]" />
                    )}
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`text-[var(--muted)] transition-transform ${
                      isWalletMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </>
              ) : (
                <span className="whitespace-nowrap">Connect wallet</span>
              )}
            </button>

            {isConnected && isWalletMenuOpen && (
              <div
                role="menu"
                aria-label="Wallet options"
                className="absolute right-0 top-[calc(100%+0.75rem)] w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[#0d0d0f] p-2 shadow-[0_18px_55px_rgba(0,0,0,0.55)]"
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  <span className="relative aspect-square w-7 shrink-0 overflow-hidden rounded-full">
                    {walletIcon ? (
                      <Image
                        src={walletIcon}
                        alt="wallet icon"
                        className="size-full object-cover"
                        fill
                      />
                    ) : (
                      <div className="size-full bg-gradient-to-br from-[#8f75ff] to-[#2766ed] text-white shadow-[0_0_22px_rgba(90,102,255,0.24)]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-[var(--text)]">
                      {walletName}
                    </p>
                    <p
                      className="truncate font-mono text-sm text-[var(--muted)]"
                      title={address}
                    >
                      {ensName ?? address ?? truncatedAddress}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyAddress}
                    aria-label={
                      isAddressCopied ? "Address copied" : "Copy wallet address"
                    }
                    title={isAddressCopied ? "Copied" : "Copy address"}
                    className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--panel-border)] text-[var(--muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
                  >
                    {isAddressCopied ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>

                <div className="mx-2 flex items-center justify-between gap-3 rounded-lg bg-[var(--surface)] px-4 py-3">
                  <span className="text-lg font-bold text-[var(--text)]">
                    {balance
                      ? Number(balance.formatted).toLocaleString(undefined, {
                          maximumFractionDigits: 5,
                        })
                      : "..."}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {balance?.symbol ?? "Native balance"}
                  </span>
                </div>

                <div className="my-2 border-t border-[var(--panel-border)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsWalletMenuOpen(false);
                    show?.();
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-semibold text-[var(--text)] transition hover:bg-[var(--surface-raised)]"
                >
                  <ArrowLeftRight size={18} className="text-[var(--muted)]" />
                  Change wallet
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsWalletMenuOpen(false);
                    disconnect();
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-semibold text-[#e47c75] transition hover:bg-[#2b1919]"
                >
                  <LogOut size={18} />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </ConnectKitButton.Custom>
    </header>
  );
}
