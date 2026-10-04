"use client";

import { ConnectKitButton } from "connectkit";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useSignMessage,
  useSignTypedData,
  useWalletClient,
} from "wagmi";
import {
  buildSessionAuthorizationMessage,
  createSession,
  startSession,
  stopSession,
} from "../../lib/prawr-api";
import {
  depositToGateway,
  payForStream,
  getGatewayBalances,
} from "../../lib/gateway-client";
import type { BatchEvmSigner } from "@circle-fin/x402-batching";

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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export default function WatchPage({ params }: { params: { slug: string } }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();

  const [secondsWatched, setSecondsWatched] = useState(0);
  const [sessionState, setSessionState] = useState<
    "idle" | "pending" | "playing" | "capped"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [gatewayBalance, setGatewayBalance] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("5");
  const [depositing, setDepositing] = useState(false);

  // Session refs - avoids stale closures inside the pay interval.
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const decodedSlug = decodeURIComponent(params.slug);
  const stream = streamCatalog[decodedSlug as keyof typeof streamCatalog] ?? {
    id: decodedSlug,
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

  const refreshGatewayBalance = async () => {
    if (!address) return;
    try {
      const balances = await getGatewayBalances(address);
      setGatewayBalance(balances.gateway.formattedAvailable);
    } catch {
      // Gateway API unreachable - leave balance unknown rather than showing 0.
      setGatewayBalance(null);
    }
  };

  useEffect(() => {
    void refreshGatewayBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Cleanup the pay interval on unmount.
  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, []);

  const handleDeposit = async () => {
    if (!address) return;
    setDepositing(true);
    setError(null);
    try {
      if (!walletClient) throw new Error("Connect a wallet to deposit.");
      await depositToGateway(depositAmount, walletClient);
      await refreshGatewayBalance();
    } catch (err) {
      console.error("Deposit failed", err);
      setError("Deposit failed. Make sure your wallet has testnet USDC.");
    } finally {
      setDepositing(false);
    }
  };

  const handleStop = async () => {
    if (watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }
    if (sessionIdRef.current && accessTokenRef.current) {
      try {
        await stopSession(sessionIdRef.current, accessTokenRef.current);
      } catch (err) {
        console.error("Stop session failed", err);
      }
    }
    setSessionState("capped");
  };

  const handleAuthorizeSession = async () => {
    if (!address) return;

    setSessionState("pending");
    setError(null);

    try {
      const issuedAt = new Date().toISOString();
      const maxCharge = String(stream.authCap);

      // 1. Viewer signs the session authorization (spend cap).
      const authorizationHash = await signMessageAsync({
        message: buildSessionAuthorizationMessage({
          streamId: stream.id,
          viewerWallet: address,
          maxCharge,
          issuedAt,
        }),
      });

      // 2. Backend validates the signature and creates the session,
      //    returning the one-time accessToken for session control.
      const session = await createSession({
        streamId: stream.id,
        viewerWallet: address,
        maxCharge,
        authorizationHash,
        issuedAt,
      });
      sessionIdRef.current = session.sessionId;
      accessTokenRef.current = session.accessToken ?? null;

      // 3. Start the session server-side.
      await startSession(session.sessionId, session.accessToken ?? "");
      setSessionState("playing");
      setSecondsWatched(0);

      // 4. Per-second watch loop: each tick pays one second via Gateway.
      //    The wallet signer handles EIP-3009 signing (no private key leaves
      //    the wallet). secondsWatched advances only on successful payments.
      const interval = setInterval(async () => {
        const sessionId = sessionIdRef.current;
        if (!sessionId) return;

        try {
          const gatewaySigner: BatchEvmSigner = {
            address,
            signTypedData: (params) =>
              signTypedDataAsync({
                domain: params.domain,
                types: params.types,
                primaryType: params.primaryType,
                message: params.message,
              } as never),
          };
          const result = await payForStream(
            `${API_BASE_URL}/streams/sessions/${sessionId}/watch`,
            { method: "POST" },
            gatewaySigner
          );

          if ((result.data as { status?: string })?.status === "capped") {
            await handleStop();
            return;
          }
          setSecondsWatched((prev) => prev + 1);
        } catch (err) {
          console.error("Watch second payment failed", err);
        }
      }, 1000);

      watchIntervalRef.current = interval;
    } catch (err) {
      console.error("Session authorization failed", err);
      setError(
        err instanceof Error ? err.message : "Session authorization failed"
      );
      setSessionState("idle");
    }
  };

  const needsDeposit =
    address !== undefined &&
    address !== null &&
    gatewayBalance !== null &&
    Number(gatewayBalance) <= 0;

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
            {sessionState === "playing" ? "Payment active" : "Not watching"}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="card overflow-hidden">
            <div className="flex aspect-video items-center justify-center bg-slate-950 text-2xl font-bold uppercase tracking-[0.3em] text-slate-500">
              {sessionState === "playing" ? "LIVE VIDEO" : "LOCKED"}
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-400">{stream.title}</div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    {stream.creator}
                  </div>
                </div>
                {sessionState === "playing" && (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300"
                  >
                    Stop Watching
                  </button>
                )}
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
                      : "Not connected"}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Gateway Balance</span>
                  <span className="font-semibold text-white">
                    {gatewayBalance === null
                      ? "\u2014"
                      : `${gatewayBalance} USDC`}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3">
                <ConnectKitButton />
              </div>

              {needsDeposit && sessionState === "idle" && (
                <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4">
                  <div className="mb-2 text-sm font-semibold text-brand-200">
                    Deposit to Gateway
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      min="0.01"
                      step="0.01"
                      className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white border border-slate-700"
                      placeholder="USDC amount"
                    />
                    <button
                      type="button"
                      onClick={handleDeposit}
                      disabled={depositing || !address}
                      className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {depositing ? "Depositing..." : "Deposit"}
                    </button>
                  </div>
                </div>
              )}

              {sessionState === "idle" && (
                <button
                  type="button"
                  onClick={handleAuthorizeSession}
                  disabled={isSigning || !address}
                  className="w-full rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSigning
                    ? "Authorizing..."
                    : address
                    ? "Authorize & start watching"
                    : "Connect wallet to authorize"}
                </button>
              )}

              {sessionState === "pending" && (
                <div className="text-center text-sm text-slate-400">
                  Authorizing session...
                </div>
              )}

              {sessionState === "playing" && (
                <div className="text-center text-sm text-emerald-300">
                  Watching - paying per second via Gateway
                </div>
              )}

              {sessionState === "capped" && (
                <div className="text-center text-sm text-red-300">
                  Session ended
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
