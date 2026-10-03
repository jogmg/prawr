"use client";

import { ConnectKitButton } from "connectkit";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
  buildSessionAuthorizationMessage,
  createSession,
} from "../../lib/prawr-api";

const streamCatalog = {
  "arc-market-briefing": {
    id: "stream_arc_briefing",
    title: "Arc Market Briefing",
    creator: "Circle Research",
    creatorWallet: "0x1111111111111111111111111111111111111111",
    ratePerMinute: 0.02,
    authCap: 2,
  },
  "creator-studio-setup": {
    id: "stream_creator_studio",
    title: "Creator Studio Setup",
    creator: "Maya Chen",
    creatorWallet: "0x2222222222222222222222222222222222222222",
    ratePerMinute: 0.015,
    authCap: 1.5,
  },
} as const;

export default function WatchPage({ params }: { params: { slug: string } }) {
  const { address } = useAccount();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const [secondsWatched, setSecondsWatched] = useState(763);
  const [sessionState, setSessionState] = useState<
    "idle" | "pending" | "authorized"
  >("idle");

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsWatched((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const decodedSlug = decodeURIComponent(params.slug);
  const stream = streamCatalog[decodedSlug as keyof typeof streamCatalog] ?? {
    id: "stream_arc_briefing",
    title: decodedSlug.replace(/-/g, " "),
    creator: "Prawr Creator",
    creatorWallet: "0x1111111111111111111111111111111111111111",
    ratePerMinute: 0.02,
    authCap: 2,
  };

  const currentCost = useMemo(() => {
    const cost = (stream.ratePerMinute / 60) * secondsWatched;
    return Number(cost).toFixed(3);
  }, [secondsWatched, stream.ratePerMinute]);

  const remainingAllowance = useMemo(
    () => Math.max(stream.authCap - Number(currentCost), 0),
    [currentCost, stream.authCap]
  );

  const handleAuthorizeSession = async () => {
    if (!address) {
      setSessionState("idle");
      return;
    }

    setSessionState("pending");

    try {
      const issuedAt = new Date().toISOString();
      const authorizationHash = await signMessageAsync({
        message: buildSessionAuthorizationMessage({
          streamId: stream.id,
          viewerWallet: address,
          maxCharge: String(stream.authCap),
          issuedAt,
        }),
      });

      await createSession({
        streamId: stream.id,
        viewerWallet: address,
        maxCharge: String(stream.authCap),
        authorizationHash,
        issuedAt,
      });

      setSessionState("authorized");
    } catch (error) {
      console.error("Session authorization failed", error);
      setSessionState("idle");
    }
  };

  return (
    <main className="min-h-screen px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-brand-100">
              Watch
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">
              {stream.title}
            </h1>
          </div>
          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
            {sessionState === "authorized"
              ? "Session authorized"
              : "Payment active"}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="card overflow-hidden">
            <div className="flex aspect-video items-center justify-center bg-slate-950 text-2xl font-bold uppercase tracking-[0.3em] text-slate-500">
              LIVE VIDEO
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-400">{stream.title}</div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    {stream.creator}
                  </div>
                </div>
                <button className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300">
                  Stop Watching
                </button>
              </div>
            </div>
          </div>

          <aside className="card p-5">
            <div className="mb-5 text-sm uppercase tracking-[0.18em] text-slate-400">
              Payment panel
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="text-slate-400">Watching</div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {Math.floor(secondsWatched / 60)}:
                  {String(secondsWatched % 60).padStart(2, "0")}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-900 p-3">
                  <div className="text-slate-400">Current cost</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    ${currentCost}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900 p-3">
                  <div className="text-slate-400">Rate</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    ${stream.ratePerMinute.toFixed(2)}/min
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Authorized maximum</span>
                  <span className="font-semibold text-white">
                    ${stream.authCap.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Remaining</span>
                  <span className="font-semibold text-white">
                    ${remainingAllowance.toFixed(3)}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Wallet</span>
                  <span className="font-semibold text-white">
                    {address
                      ? `${address.slice(0, 6)}...${address.slice(-4)}`
                      : "$28.41 USDC"}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3">
                <ConnectKitButton />
              </div>
              <button
                type="button"
                onClick={handleAuthorizeSession}
                disabled={sessionState === "pending" || isSigning || !address}
                className="w-full rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sessionState === "pending" || isSigning
                  ? "Authorizing..."
                  : sessionState === "authorized"
                  ? "Session authorized"
                  : address
                  ? `Authorize $${currentCost} watch session`
                  : "Connect wallet to authorize"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
