"use client";

import { ConnectKitButton } from "connectkit";
import { useEffect, useMemo, useState } from "react";
import { keccak256, parseUnits, stringToHex } from "viem";
import {
  useAccount,
  usePublicClient,
  useSignMessage,
  useWriteContract,
} from "wagmi";
import { ARC_CHAIN } from "../../lib/arc-network";
import {
  PRAWR_SETTLEMENT_ABI,
  PRAWR_SETTLEMENT_ADDRESS,
  buildSessionAuthorizationMessage,
  createSession,
  heartbeatWatchSession,
  resumeWatchSession,
  startWatchSession,
  stopWatchSession,
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
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending: isFunding } = useWriteContract();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const [secondsWatched, setSecondsWatched] = useState(0);
  const [sessionControl, setSessionControl] = useState<{
    sessionId: string;
    accessToken: string;
  } | null>(null);
  const [serverCharge, setServerCharge] = useState("0");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const escrowFundingEnabled =
    ARC_CHAIN.testnet === true &&
    process.env.NEXT_PUBLIC_ENABLE_SESSION_ESCROW === "true";
  const [sessionState, setSessionState] = useState<
    | "idle"
    | "pending"
    | "funded"
    | "authorized"
    | "paused"
    | "completed"
    | "capped"
  >("idle");

  useEffect(() => {
    if (sessionState !== "authorized") return;

    const interval = window.setInterval(() => {
      setSecondsWatched((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sessionState]);

  useEffect(() => {
    if (sessionState !== "authorized" || !sessionControl) return;

    let requestPending = false;
    const interval = window.setInterval(async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const snapshot = await heartbeatWatchSession(
          sessionControl.sessionId,
          sessionControl.accessToken
        );
        setServerCharge(snapshot.charge);
        if (snapshot.status === "capped") {
          setSessionState("capped");
        }
      } catch (error) {
        console.error("Watch heartbeat failed", error);
        setPaymentError(
          "Server metering heartbeat failed. Stop watching and retry."
        );
      } finally {
        requestPending = false;
      }
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [sessionControl, sessionState]);

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
    () => Math.max(stream.authCap - Number(serverCharge), 0),
    [serverCharge, stream.authCap]
  );

  const handleAuthorizeSession = async () => {
    if (
      (sessionState === "funded" || sessionState === "paused") &&
      sessionControl
    ) {
      setSessionState("pending");
      setPaymentError(null);
      try {
        const snapshot =
          sessionState === "paused"
            ? await resumeWatchSession(
                sessionControl.sessionId,
                sessionControl.accessToken
              )
            : await startWatchSession(
                sessionControl.sessionId,
                sessionControl.accessToken
              );
        setServerCharge(snapshot.charge);
        setSessionState(
          snapshot.status === "playing" ? "authorized" : snapshot.status
        );
      } catch (error) {
        console.error("Starting server metering failed", error);
        setPaymentError(
          error instanceof Error
            ? error.message
            : "Unable to start server metering"
        );
        setSessionState("funded");
      }
      return;
    }

    if (
      !address ||
      !publicClient ||
      !PRAWR_SETTLEMENT_ADDRESS ||
      !escrowFundingEnabled
    ) {
      setSessionState("idle");
      return;
    }

    setSessionState("pending");
    setPaymentError(null);
    let escrowFunded = false;

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

      const session = await createSession({
        streamId: stream.id,
        viewerWallet: address,
        maxCharge: String(stream.authCap),
        authorizationHash,
        issuedAt,
      });

      const sessionKey = keccak256(stringToHex(session.sessionId));
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 2 * 60 * 60);
      if (publicClient.chain?.id !== ARC_CHAIN.id) {
        throw new Error(`Connect your wallet to ${ARC_CHAIN.name}`);
      }
      const contractCode = await publicClient.getCode({
        address: PRAWR_SETTLEMENT_ADDRESS,
      });
      if (!contractCode || contractCode === "0x") {
        throw new Error(
          "No settlement contract is deployed at the configured address"
        );
      }
      const transactionHash = await writeContractAsync({
        abi: PRAWR_SETTLEMENT_ABI,
        address: PRAWR_SETTLEMENT_ADDRESS,
        functionName: "openSession",
        args: [sessionKey, stream.creatorWallet, expiresAt],
        value: parseUnits(String(stream.authCap), 18),
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
      });

      if (receipt.status !== "success") {
        throw new Error("Arc rejected the escrow funding transaction");
      }

      escrowFunded = true;
      setSessionControl({
        sessionId: session.sessionId,
        accessToken: session.accessToken,
      });
      setSessionState("funded");
      const snapshot = await startWatchSession(
        session.sessionId,
        session.accessToken
      );
      setServerCharge(snapshot.charge);
      setSessionState(
        snapshot.status === "playing" ? "authorized" : snapshot.status
      );
    } catch (error) {
      console.error("Session authorization failed", error);
      setPaymentError(
        error instanceof Error ? error.message : "Unable to fund the session"
      );
      setSessionState(escrowFunded ? "funded" : "idle");
    }
  };

  const handleStopWatching = async () => {
    if (!sessionControl || sessionState !== "authorized") return;

    setSessionState("pending");
    setPaymentError(null);
    try {
      const snapshot = await stopWatchSession(
        sessionControl.sessionId,
        sessionControl.accessToken
      );
      setServerCharge(snapshot.charge);
      setSessionState(snapshot.status === "capped" ? "capped" : "completed");
    } catch (error) {
      console.error("Stopping server metering failed", error);
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Unable to stop server metering"
      );
      setSessionState("authorized");
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
              ? "Metering active"
              : sessionState === "completed"
              ? "Metering stopped"
              : sessionState === "capped"
              ? "Session cap reached"
              : sessionState === "paused"
              ? "Metering paused"
              : sessionState === "funded"
              ? "Escrow funded · start pending"
              : "Not funded"}
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
                <button
                  type="button"
                  onClick={handleStopWatching}
                  disabled={sessionState !== "authorized"}
                  className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-50"
                >
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
                  <div className="text-slate-400">Server accrued</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    ${Number(serverCharge).toFixed(3)}
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
                  <span>Session cap</span>
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
                disabled={
                  sessionState === "pending" ||
                  isSigning ||
                  isFunding ||
                  sessionState === "authorized" ||
                  sessionState === "completed" ||
                  sessionState === "capped" ||
                  !address ||
                  !PRAWR_SETTLEMENT_ADDRESS ||
                  !escrowFundingEnabled
                }
                className="w-full rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sessionState === "pending" || isSigning || isFunding
                  ? "Authorizing and funding..."
                  : sessionState === "authorized"
                  ? `Metered · ${Number(serverCharge).toFixed(3)} USDC`
                  : sessionState === "completed"
                  ? `Stopped · ${Number(serverCharge).toFixed(3)} USDC`
                  : sessionState === "capped"
                  ? "Session cap reached"
                  : sessionState === "funded" || sessionState === "paused"
                  ? sessionState === "paused"
                    ? "Resume session"
                    : "Retry server metering"
                  : !escrowFundingEnabled
                  ? ARC_CHAIN.testnet
                    ? "Testnet escrow disabled"
                    : "Escrow unavailable on Mainnet"
                  : !PRAWR_SETTLEMENT_ADDRESS
                  ? "Settlement contract not configured"
                  : address
                  ? `Fund $${stream.authCap.toFixed(2)} session cap`
                  : "Connect wallet to fund session"}
              </button>
              {escrowFundingEnabled && (
                <p className="text-xs text-amber-200">
                  Testnet only. Heartbeats meter server elapsed time but do not
                  prove playback; automatic settlement is not active. An
                  unfinalized deposit is refundable after expiry.
                </p>
              )}
              {paymentError && (
                <p role="alert" className="text-sm text-red-300">
                  {paymentError}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
