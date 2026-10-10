"use client";

import { ConnectKitButton } from "connectkit";
import ReactPlayer from "react-player/lazy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  useAccount,
  useSignMessage,
  useSignTypedData,
  useWalletClient,
} from "wagmi";
import { buildSessionAuthorizationMessage } from "../../lib/prawr-api";
import { type GatewayWithdrawalSigner } from "../../lib/gateway-client";
import type { BatchEvmSigner } from "@circle-fin/x402-batching";
import { useStream } from "../../lib/hooks/use-stream-queries";
import {
  useRestoredWatchSession,
  useWatchGatewayBalances,
  useWatchPaymentRequirements,
} from "../../lib/hooks/use-watch-queries";
import {
  useGatewayDeposit,
  useGatewayWithdrawal,
} from "../../lib/hooks/use-gateway-mutations";
import {
  usePayForWatchBlock,
  useWatchSessionMutations,
} from "../../lib/hooks/use-watch-mutations";
import { watchPaymentRequirementsQuery } from "../../lib/queries/watch-queries";
import {
  readWatchSession,
  removeWatchSession,
  saveWatchSession,
  useWatchSessionStore,
  type StoredWatchSession,
} from "../../store/watch/watch-session.store";

const MAX_VIEWING_SECONDS = 24 * 60 * 60;
const DURATION_UNITS = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
} as const;
type DurationUnit = keyof typeof DURATION_UNITS;

export default function WatchPage({ params }: { params: { slug: string } }) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();

  const secondsWatched = useWatchSessionStore((state) => state.secondsWatched);
  const setSecondsWatched = useWatchSessionStore(
    (state) => state.setSecondsWatched
  );
  const prepaidSeconds = useWatchSessionStore((state) => state.prepaidSeconds);
  const setPrepaidSeconds = useWatchSessionStore(
    (state) => state.setPrepaidSeconds
  );
  const amountCharged = useWatchSessionStore((state) => state.amountCharged);
  const setAmountCharged = useWatchSessionStore(
    (state) => state.setAmountCharged
  );
  const sessionState = useWatchSessionStore((state) => state.sessionState);
  const setSessionState = useWatchSessionStore(
    (state) => state.setSessionState
  );
  const resumeAvailable = useWatchSessionStore(
    (state) => state.resumeAvailable
  );
  const setResumeAvailable = useWatchSessionStore(
    (state) => state.setResumeAvailable
  );
  const streamQuery = useStream(decodeURIComponent(params.slug));
  const stream = streamQuery.data ?? null;
  const balancesQuery = useWatchGatewayBalances(address);
  const sessionMutations = useWatchSessionMutations();
  const paidBlockMutation = usePayForWatchBlock();
  const gatewayDeposit = useGatewayDeposit();
  const gatewayWithdrawal = useGatewayWithdrawal();
  const [savedSession, setSavedSession] = useState<StoredWatchSession | null>(
    null
  );
  const [paymentSessionId, setPaymentSessionId] = useState<string>();
  const restoreQuery = useRestoredWatchSession(
    savedSession?.sessionId,
    savedSession?.accessToken
  );
  const paymentRequirementsQuery =
    useWatchPaymentRequirements(paymentSessionId);
  const blockQuote = paymentRequirementsQuery.data
    ? {
        seconds: paymentRequirementsQuery.data.nextBlockSeconds,
        amount: paymentRequirementsQuery.data.nextBlockAmount,
      }
    : null;
  const [showPayModal, setShowPayModal] = useState(false);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("seconds");
  const [durationCount, setDurationCount] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const gatewayBalance = balancesQuery.data?.gateway.formattedAvailable ?? null;
  const walletUsdcBalance = balancesQuery.data?.wallet.formatted ?? null;
  const [depositAmount, setDepositAmount] = useState("5");
  const [playbackSeconds, setPlaybackSeconds] = useState(0);

  // Session refs - avoids stale closures inside the pay interval.
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentInFlightRef = useRef(false);
  const playbackStartPendingRef = useRef(false);
  const prepaidSecondsRef = useRef(0);
  const serverSessionStatusRef = useRef<"playing" | "paused">("playing");
  const pauseRequestRef = useRef<Promise<void> | null>(null);
  const restoreTimeRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number | null>(null);
  const playerRef = useRef<ReactPlayer | null>(null);
  const sessionStorageKey =
    address && stream
      ? `prawr:watch-session:${stream.id}:${address.toLowerCase()}`
      : null;
  const streamNotLive = stream?.status !== "live";
  const streamError =
    streamQuery.error instanceof Error
      ? streamQuery.error.message
      : "Unable to load stream.";

  const applyPendingPlaybackTime = () => {
    const player = playerRef.current;
    const playbackTime = restoreTimeRef.current;
    if (!player || playbackTime === null) return;
    const duration = player.getDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;

    const targetTime = Math.min(playbackTime, duration);
    player.seekTo(targetTime, "seconds");
    lastVideoTimeRef.current = targetTime;
    setPlaybackSeconds(targetTime);
    restoreTimeRef.current = null;
  };

  const controlPlayback = async (action: "play" | "pause") => {
    const player = playerRef.current?.getInternalPlayer();
    if (!player) return;
    if (action === "pause") {
      if (typeof player.pauseVideo === "function") player.pauseVideo();
      else if (typeof player.pause === "function") player.pause();
      return;
    }
    if (typeof player.playVideo === "function") player.playVideo();
    else if (typeof player.play === "function") await player.play();
  };

  const refreshBlockQuote = useCallback(
    async (sessionId: string) => {
      setPaymentSessionId(sessionId);
      await queryClient.fetchQuery(watchPaymentRequirementsQuery(sessionId));
    },
    [queryClient]
  );

  useEffect(() => {
    if (!stream) return;
    useWatchSessionStore
      .getState()
      .setStreamId(`${stream.id}:${address?.toLowerCase() ?? "disconnected"}`);
  }, [address, stream]);

  useEffect(() => {
    if (!sessionStorageKey || !stream) {
      setSavedSession(null);
      return;
    }
    const saved = readWatchSession(sessionStorageKey, stream.id);
    if (!saved && typeof window !== "undefined") {
      removeWatchSession(sessionStorageKey);
    }
    setSavedSession(saved);
  }, [sessionStorageKey, stream]);

  useEffect(() => {
    const session = restoreQuery.data;
    if (!session || !savedSession || !stream || !address) return;
    if (
      session.streamId !== stream.id ||
      session.viewerWallet.toLowerCase() !== address.toLowerCase()
    ) {
      if (sessionStorageKey) removeWatchSession(sessionStorageKey);
      setSavedSession(null);
      return;
    }

    sessionIdRef.current = session.sessionId;
    accessTokenRef.current = savedSession.accessToken;
    serverSessionStatusRef.current = "paused";
    setSecondsWatched(session.secondsWatched);
    setPrepaidSeconds(session.prepaidSeconds);
    prepaidSecondsRef.current = session.prepaidSeconds;
    setAmountCharged(Number(session.charge));
    restoreTimeRef.current = savedSession.playbackTime;
    applyPendingPlaybackTime();

    if (session.status === "completed" || session.status === "capped") {
      if (sessionStorageKey) removeWatchSession(sessionStorageKey);
      setSessionState("capped");
      return;
    }

    setSessionState("authorized");
    setResumeAvailable(session.prepaidSeconds > 0);
    void refreshBlockQuote(session.sessionId);
  }, [
    restoreQuery.data,
    savedSession,
    stream,
    address,
    sessionStorageKey,
    setAmountCharged,
    setPrepaidSeconds,
    setResumeAvailable,
    setSecondsWatched,
    setSessionState,
    refreshBlockQuote,
  ]);

  useEffect(() => {
    if (restoreQuery.isError && savedSession) {
      setError(
        "Unable to restore the saved session. Try again or authorize a new session."
      );
    }
  }, [restoreQuery.isError, savedSession]);

  const currentCost = useMemo(() => {
    return amountCharged.toFixed(6);
  }, [amountCharged]);
  const durationSeconds = durationCount * DURATION_UNITS[durationUnit];
  const durationValid =
    Number.isInteger(durationCount) &&
    durationCount > 0 &&
    durationSeconds <= MAX_VIEWING_SECONDS;
  const durationAmount = useMemo(() => {
    if (!stream || !durationValid) return "0.000000";
    const perSecondAtomic = BigInt(
      Math.max(1, Math.round((stream.ratePerMinute / 60) * 1_000_000))
    );
    return formatUnits(perSecondAtomic * BigInt(durationSeconds), 6);
  }, [durationSeconds, durationValid, stream]);

  // Cleanup the pay interval on unmount.
  useEffect(() => {
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, []);

  const handleDeposit = async () => {
    if (!address) return;
    setError(null);
    try {
      if (!walletClient) throw new Error("Connect a wallet to deposit.");
      await gatewayDeposit.mutateAsync({ amount: depositAmount, walletClient });
    } catch (err) {
      console.error("Deposit failed", err);
      setError("Deposit failed. Make sure your wallet has testnet USDC.");
    }
  };

  const handleWithdraw = async () => {
    if (!address || !walletClient || !gatewayBalance) return;
    setError(null);
    try {
      const gatewaySigner: GatewayWithdrawalSigner = {
        address,
        signTypedData: (params) =>
          signTypedDataAsync({
            domain: params.domain,
            types: params.types,
            primaryType: params.primaryType,
            message: params.message,
          } as never),
      };
      await gatewayWithdrawal.mutateAsync({
        amount: depositAmount,
        recipient: address,
        walletClient,
        signer: gatewaySigner,
      });
    } catch (err) {
      console.error("Withdrawal failed", err);
      setError(
        err instanceof Error ? err.message : "Gateway withdrawal failed."
      );
    }
  };

  const handleVideoStart = () => {
    const sessionId = sessionIdRef.current;
    if (
      !sessionId ||
      !accessTokenRef.current ||
      !address ||
      prepaidSecondsRef.current <= 0
    ) {
      void controlPlayback("pause");
      setError(
        prepaidSecondsRef.current <= 0
          ? "Pay for a viewing block before playing."
          : "Authorize a viewing session before playing this stream."
      );
    }
  };

  const handleVideoPlaying = async () => {
    const sessionId = sessionIdRef.current;
    if (
      !sessionId ||
      !accessTokenRef.current ||
      !address ||
      prepaidSecondsRef.current <= 0
    ) {
      return;
    }
    if (watchIntervalRef.current || playbackStartPendingRef.current) return;

    playbackStartPendingRef.current = true;
    try {
      await pauseRequestRef.current;

      if (serverSessionStatusRef.current === "paused") {
        try {
          await sessionMutations.resume.mutateAsync({
            sessionId,
            accessToken: accessTokenRef.current,
          });
          serverSessionStatusRef.current = "playing";
        } catch (resumeError) {
          void controlPlayback("pause");
          setError(
            resumeError instanceof Error
              ? resumeError.message
              : "Unable to resume the watch session."
          );
          return;
        }
      }

      setError(null);
      setResumeAvailable(false);
      setSessionState("playing");
      watchIntervalRef.current = setInterval(async () => {
        if (paymentInFlightRef.current) return;
        paymentInFlightRef.current = true;
        try {
          const accessToken = accessTokenRef.current;
          if (!accessToken)
            throw new Error("Watch session authorization expired.");
          const session = await sessionMutations.heartbeat.mutateAsync({
            sessionId,
            accessToken,
          });
          serverSessionStatusRef.current =
            session.status === "paused" ? "paused" : "playing";
          setSecondsWatched(session.secondsWatched);
          prepaidSecondsRef.current = session.prepaidSeconds;
          setPrepaidSeconds(session.prepaidSeconds);
          if (session.prepaidSeconds <= 0) {
            if (watchIntervalRef.current)
              clearInterval(watchIntervalRef.current);
            watchIntervalRef.current = null;
            setSessionState("authorized");
            void controlPlayback("pause");
            setError(
              "Viewing block finished. Pay for the next block to continue."
            );
          }
        } catch (heartbeatError) {
          console.error("Watch heartbeat failed", heartbeatError);
          if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
          watchIntervalRef.current = null;
          setError(
            heartbeatError instanceof Error
              ? heartbeatError.message
              : "Unable to confirm prepaid viewing time. Playback has been paused."
          );
          void controlPlayback("pause");
          setSessionState("authorized");
        } finally {
          paymentInFlightRef.current = false;
        }
      }, 1000);
    } finally {
      playbackStartPendingRef.current = false;
    }
  };

  const handlePlayerProgress = ({
    playedSeconds,
  }: {
    playedSeconds: number;
  }) => {
    lastVideoTimeRef.current = playedSeconds;
    setPlaybackSeconds(playedSeconds);
    if (!sessionStorageKey || !sessionIdRef.current || !accessTokenRef.current)
      return;

    saveWatchSession(sessionStorageKey, {
      sessionId: sessionIdRef.current,
      accessToken: accessTokenRef.current,
      playbackTime: playedSeconds,
    });
  };

  const handlePlayerReady = () => {
    applyPendingPlaybackTime();
  };

  const handleTogglePlayback = async () => {
    if (!playerRef.current) return;
    if (sessionState === "playing") {
      await controlPlayback("pause");
      return;
    }
    if (prepaidSecondsRef.current <= 0) {
      setError("Pay for a viewing block before playing.");
      return;
    }
    try {
      const player = playerRef.current;
      const duration = player.getDuration();
      if (Number.isFinite(duration) && playbackSeconds >= duration) {
        lastVideoTimeRef.current = 0;
        setPlaybackSeconds(0);
        player.seekTo(0, "seconds");
      }
      await controlPlayback("play");
    } catch (playError) {
      setError(
        playError instanceof Error
          ? playError.message
          : "Playback could not start. Press Play to continue."
      );
    }
  };

  const handleVideoPause = () => {
    const wasPlaying = sessionState === "playing";
    if (watchIntervalRef.current) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }
    if (wasPlaying) {
      setSessionState("authorized");
      setResumeAvailable(prepaidSecondsRef.current > 0);
      const sessionId = sessionIdRef.current;
      const accessToken = accessTokenRef.current;
      if (
        sessionId &&
        accessToken &&
        serverSessionStatusRef.current === "playing"
      ) {
        pauseRequestRef.current = sessionMutations.pause
          .mutateAsync({ sessionId, accessToken })
          .then((session) => {
            serverSessionStatusRef.current = "paused";
            setPrepaidSeconds(session.prepaidSeconds);
            prepaidSecondsRef.current = session.prepaidSeconds;
            setSecondsWatched(session.secondsWatched);
          })
          .catch((pauseError) => {
            console.error("Pause session failed", pauseError);
          })
          .finally(() => {
            pauseRequestRef.current = null;
          });
      }
    }
  };

  const handlePayNextBlock = async (blockSeconds: number) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !address || prepaidSecondsRef.current > 0) return;

    setError(null);
    try {
      await refreshBlockQuote(sessionId);
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
      const result = await paidBlockMutation.mutateAsync({
        sessionId,
        blockSeconds,
        signer: gatewaySigner,
      });
      prepaidSecondsRef.current = result.data.prepaidSeconds;
      serverSessionStatusRef.current = "paused";
      setPrepaidSeconds(result.data.prepaidSeconds);
      setSecondsWatched(result.data.secondsWatched);
      setAmountCharged(Number(result.data.charge));
      setResumeAvailable(result.data.prepaidSeconds > 0);
      setShowPayModal(false);
      setError(null);
      try {
        await controlPlayback("play");
      } catch (playError) {
        setError(
          playError instanceof Error
            ? playError.message
            : "Block paid. Press Play to start playback."
        );
      }
      await refreshBlockQuote(sessionId);
      await queryClient.invalidateQueries({
        queryKey: ["creator", "balances"],
      });
    } catch (paymentError) {
      console.error("Viewing block payment failed", paymentError);
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Block payment failed."
      );
    }
  };

  const handleVideoError = () => {
    handleVideoPause();
    setError(
      "Playback could not be loaded. Check the URL, stream availability, embed permissions, and HLS CORS settings."
    );
  };

  const handleAuthorizeSession = async () => {
    if (!address || !stream || streamNotLive) return;

    setSessionState("pending");
    setError(null);

    try {
      const issuedAt = new Date().toISOString();

      // 1. Viewer signs the session identity authorization.
      const authorizationHash = await signMessageAsync({
        message: buildSessionAuthorizationMessage({
          streamId: stream.id,
          viewerWallet: address,
          issuedAt,
        }),
      });

      // 2. Backend validates the signature and creates the session,
      //    returning the one-time accessToken for session control.
      const session = await sessionMutations.create.mutateAsync({
        streamId: stream.id,
        viewerWallet: address,
        authorizationHash,
        issuedAt,
      });
      const accessToken = session.accessToken;
      if (!accessToken)
        throw new Error("Session authorization token was not returned.");
      sessionIdRef.current = session.sessionId;
      accessTokenRef.current = accessToken;

      // 3. Start the session server-side.
      await sessionMutations.start.mutateAsync({
        sessionId: session.sessionId,
        accessToken,
      });
      if (sessionStorageKey) {
        saveWatchSession(sessionStorageKey, {
          sessionId: session.sessionId,
          accessToken,
          playbackTime: 0,
        });
      }
      serverSessionStatusRef.current = "paused";
      setSessionState("authorized");
      setResumeAvailable(false);
      setSecondsWatched(0);
      setPrepaidSeconds(0);
      prepaidSecondsRef.current = 0;
      setAmountCharged(0);
      await refreshBlockQuote(session.sessionId);
    } catch (err) {
      console.error("Session authorization failed", err);
      setError(
        err instanceof Error ? err.message : "Session authorization failed"
      );
      setSessionState("idle");
    }
  };

  if (!stream) {
    return (
      <main className="min-h-screen px-6 py-10 text-slate-100">
        <div className="card mx-auto max-w-3xl p-8 text-center">
          <h1 className="text-2xl font-bold text-white">
            {streamError ?? "Loading stream..."}
          </h1>
          <a
            href="/"
            className="mt-4 inline-block text-brand-100 hover:text-white"
          >
            Return to streams
          </a>
        </div>
      </main>
    );
  }

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
          <div
            className={`rounded-full border px-3 py-1 text-sm ${
              streamNotLive
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {streamNotLive
              ? `Stream ${stream.status} · prepaid time only`
              : sessionState === "playing"
              ? "Payment active"
              : "Not watching"}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="card overflow-hidden">
            {stream.playbackUrl ? (
              <>
                <ReactPlayer
                  ref={playerRef}
                  url={stream.playbackUrl}
                  width="100%"
                  height="auto"
                  controls={false}
                  playsinline
                  playbackRate={1}
                  progressInterval={1000}
                  onReady={handlePlayerReady}
                  onPlay={() => {
                    handleVideoStart();
                    void handleVideoPlaying();
                  }}
                  onBuffer={handleVideoPause}
                  onBufferEnd={() => void handleVideoPlaying()}
                  onPause={handleVideoPause}
                  onProgress={handlePlayerProgress}
                  onError={handleVideoError}
                  config={{
                    file: { hlsVersion: "1.5.17" },
                    twitch: {
                      options: {
                        controls: false,
                        parent:
                          typeof window === "undefined"
                            ? ["localhost"]
                            : [window.location.hostname],
                      },
                    },
                    youtube: { playerVars: { controls: 0, disablekb: 1 } },
                  }}
                  className="aspect-video w-full bg-black"
                />
                <div className="flex items-center justify-between gap-4 border-t border-slate-700 bg-slate-950 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void handleTogglePlayback()}
                    disabled={prepaidSeconds <= 0}
                    aria-label={
                      sessionState === "playing"
                        ? "Pause playback"
                        : "Play video"
                    }
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sessionState === "playing"
                      ? "Pause"
                      : resumeAvailable
                      ? `Resume paid session (${prepaidSeconds}s left)`
                      : prepaidSeconds > 0
                      ? "Play"
                      : "Pay to play"}
                  </button>
                  <span className="text-sm tabular-nums text-slate-300">
                    {Math.floor(playbackSeconds / 60)}:
                    {String(Math.floor(playbackSeconds) % 60).padStart(2, "0")}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
                <div className="text-xl font-semibold text-white">
                  Playback source unavailable
                </div>
                <div className="max-w-md text-sm text-slate-400">
                  This stream was created before video sources were supported.
                </div>
              </div>
            )}
            <div className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-400">{stream.title}</div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    Creator {stream.creatorId}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="card p-5">
            <div className="mb-5 text-sm uppercase tracking-[0.18em] text-slate-400">
              Payment panel
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="text-slate-400">Paid time</div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {Math.floor(secondsWatched / 60)}:
                  {String(secondsWatched % 60).padStart(2, "0")}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                <div className="flex items-center justify-between text-emerald-100">
                  <span>Prepaid viewing time</span>
                  <span className="font-semibold">
                    {Math.floor(prepaidSeconds / 60)}:
                    {String(prepaidSeconds % 60).padStart(2, "0")}
                  </span>
                </div>
                {sessionState === "authorized" && prepaidSeconds === 0 && (
                  <div className="mt-2 text-emerald-100/80">
                    {blockQuote && blockQuote.seconds > 0
                      ? `Next block: ${blockQuote.seconds}s for $${blockQuote.amount} USDC`
                      : "Unable to quote the next block."}
                  </div>
                )}
                {prepaidSeconds > 0 && (
                  <div className="mt-2 text-emerald-200/80">
                    Playback is covered by this prepaid block.
                  </div>
                )}
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
                    ${stream.ratePerMinute.toFixed(3)}/min
                  </div>
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
                  <span>Arc wallet USDC</span>
                  <span className="font-semibold text-white">
                    {walletUsdcBalance === null
                      ? "\u2014"
                      : `${walletUsdcBalance} USDC`}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Gateway available</span>
                  <span className="font-semibold text-white">
                    {gatewayBalance === null
                      ? "\u2014"
                      : `${gatewayBalance} USDC`}
                  </span>
                </div>
                {address && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(event) => setDepositAmount(event.target.value)}
                      min="0.01"
                      step="0.01"
                      aria-label="Gateway transfer amount in USDC"
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={handleDeposit}
                      disabled={
                        gatewayDeposit.isPending ||
                        gatewayWithdrawal.isPending ||
                        !walletClient
                      }
                      className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {gatewayDeposit.isPending ? "Depositing..." : "Deposit"}
                    </button>
                    <button
                      type="button"
                      onClick={handleWithdraw}
                      disabled={
                        gatewayWithdrawal.isPending ||
                        gatewayDeposit.isPending ||
                        !walletClient ||
                        !gatewayBalance ||
                        Number(depositAmount) <= 0 ||
                        Number(depositAmount) > Number(gatewayBalance)
                      }
                      className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {gatewayWithdrawal.isPending
                        ? "Withdrawing..."
                        : "Withdraw"}
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3">
                <ConnectKitButton />
              </div>

              {!streamNotLive &&
                (sessionState === "idle" || sessionState === "capped") && (
                  <button
                    type="button"
                    onClick={handleAuthorizeSession}
                    disabled={isSigning || !address}
                    className="w-full rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSigning
                      ? "Authorizing..."
                      : address
                      ? sessionState === "capped"
                        ? "Authorize new session"
                        : "Authorize session"
                      : "Connect wallet to authorize"}
                  </button>
                )}

              {!streamNotLive &&
                sessionState === "authorized" &&
                prepaidSeconds === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setShowPayModal(true);
                    }}
                    disabled={
                      paidBlockMutation.isPending ||
                      !address ||
                      !blockQuote ||
                      blockQuote.seconds === 0
                    }
                    className="w-full rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Choose viewing duration
                  </button>
                )}

              {streamNotLive && prepaidSeconds === 0 && (
                <div className="text-center text-sm text-amber-200">
                  This stream is not live. No new viewing time can be purchased.
                </div>
              )}

              {streamNotLive && prepaidSeconds > 0 && (
                <div className="text-center text-sm text-amber-200">
                  Use your remaining prepaid time. Additional time is
                  unavailable.
                </div>
              )}

              {sessionState === "pending" && (
                <div className="text-center text-sm text-slate-400">
                  Authorizing session...
                </div>
              )}

              {sessionState === "playing" && (
                <div className="text-center text-sm text-emerald-300">
                  Playback is using prepaid time. Another signature is needed
                  when this block ends.
                </div>
              )}

              {sessionState === "authorized" && (
                <div className="text-center text-sm text-slate-300">
                  {prepaidSeconds > 0
                    ? "Block paid. Play the video when ready."
                    : "Pay for a viewing block before starting playback."}
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
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="payment-modal-title"
                  className="text-xl font-semibold text-white"
                >
                  Choose viewing duration
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  ${stream.ratePerMinute.toFixed(2)} per minute
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                disabled={paidBlockMutation.isPending}
                aria-label="Close payment dialog"
                className="rounded-md px-2 py-1 text-xl leading-none text-slate-400 hover:text-white disabled:opacity-50"
              >
                &times;
              </button>
            </div>
            <div className="mt-6 grid grid-cols-[1fr_1fr] gap-3">
              <label className="text-sm text-slate-300">
                Number
                <input
                  type="number"
                  min="1"
                  max={Math.floor(
                    MAX_VIEWING_SECONDS / DURATION_UNITS[durationUnit]
                  )}
                  step="1"
                  value={durationCount}
                  onChange={(event) =>
                    setDurationCount(Number(event.target.value))
                  }
                  disabled={paidBlockMutation.isPending}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-lg text-white"
                />
              </label>
              <label className="text-sm text-slate-300">
                Unit
                <select
                  value={durationUnit}
                  onChange={(event) => {
                    const nextUnit = event.target.value as DurationUnit;
                    const nextSeconds = Math.ceil(
                      durationSeconds / DURATION_UNITS[nextUnit]
                    );
                    const maxCount = Math.floor(
                      MAX_VIEWING_SECONDS / DURATION_UNITS[nextUnit]
                    );
                    setDurationUnit(nextUnit);
                    setDurationCount(
                      Math.min(maxCount, Math.max(1, nextSeconds))
                    );
                  }}
                  disabled={paidBlockMutation.isPending}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-lg text-white"
                >
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                </select>
              </label>
            </div>
            <div className="mt-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
              <div className="text-sm text-slate-400">Amount due</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-white">
                ${durationAmount}{" "}
                <span className="text-base font-normal text-slate-400">
                  USDC
                </span>
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {durationValid
                  ? `${durationSeconds} seconds of prepaid viewing`
                  : "Choose a duration up to 24 hours"}
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handlePayNextBlock(durationSeconds)}
              disabled={
                !durationValid || paidBlockMutation.isPending || !address
              }
              className="mt-6 w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {paidBlockMutation.isPending
                ? "Waiting for payment signature..."
                : `Pay $${durationAmount} USDC`}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
