"use client";

import { Copy, Info, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import ReactPlayer from "react-player/lazy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  useAccount,
  useSignMessage,
  useSignTypedData,
  useWalletClient,
} from "wagmi";
import { buildSessionAuthorizationMessage } from "../../lib/prawr-api";
import { shortenWalletAddress } from "../../lib/helpers/wallet";
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

function showWatchGuide(streamId: string) {
  toast.info("New to watching?", {
    id: `watch-start-guide-${streamId}`,
    description:
      "Connect your wallet, open Wallet funds, and use Add funds to deposit Arc USDC into your viewing balance. Then select Authorize watch session and sign the message (this does not charge you). Choose a viewing duration, approve the USDC payment, and press Play. Unused prepaid time is not refunded.",
    duration: Infinity,
  });
}

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
  const { isError: balancesFailed, refetch: refetchBalances } = balancesQuery;
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
  const [playerRetry, setPlayerRetry] = useState(0);
  const [showViewingPanel, setShowViewingPanel] = useState(true);

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
  const watchSessionKey =
    address && stream
      ? `prawr:watch-session:${stream.id}:${address.toLowerCase()}`
      : null;
  const streamNotLive = stream?.status !== "live";
  // const streamError =
  //   streamQuery.error instanceof Error
  //     ? streamQuery.error.message
  //     : "Unable to load stream.";

  useEffect(() => {
    if (!error) return;
    if (error.includes("Playback could not be loaded") && stream?.playbackUrl) {
      toast.error(error, {
        action: {
          label: "Retry video",
          onClick: () => setPlayerRetry((attempt) => attempt + 1),
        },
      });
    } else {
      toast.error(error);
    }
    setError(null);
  }, [error, stream?.playbackUrl]);

  useEffect(() => {
    if (!balancesFailed) return;
    toast.warning("Couldn’t load wallet funds.", {
      action: {
        label: "Retry",
        onClick: () => void refetchBalances(),
      },
    });
  }, [balancesFailed, refetchBalances]);

  useEffect(() => {
    if (!stream) return;
    showWatchGuide(stream.id);
  }, [stream?.id]);

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
    if (!watchSessionKey || !stream) {
      setSavedSession(null);
      return;
    }
    const saved = readWatchSession(watchSessionKey, stream.id);
    if (!saved && typeof window !== "undefined") {
      removeWatchSession(watchSessionKey);
    }
    setSavedSession(saved);
  }, [watchSessionKey, stream]);

  useEffect(() => {
    const session = restoreQuery.data;
    if (!session || !savedSession || !stream || !address) return;
    if (
      session.streamId !== stream.id ||
      session.viewerWallet.toLowerCase() !== address.toLowerCase()
    ) {
      if (watchSessionKey) removeWatchSession(watchSessionKey);
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
      if (watchSessionKey) removeWatchSession(watchSessionKey);
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
    watchSessionKey,
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
      toast.success("Funds added to your viewing balance.");
    } catch (err) {
      console.error("Deposit failed", err);
      setError("Deposit failed. Make sure your wallet has Arc USDC.");
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
      toast.success("Funds withdrawn to your connected wallet.");
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
          console.error("Watch session resume failed", resumeError);
          setError(
            "Couldn’t resume playback. Try Play again, or reconnect your wallet if needed."
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
            "We couldn’t confirm your remaining viewing time, so playback was paused. Retry when your connection is stable."
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
    if (!watchSessionKey || !sessionIdRef.current || !accessTokenRef.current)
      return;

    saveWatchSession(watchSessionKey, {
      sessionId: sessionIdRef.current,
      accessToken: accessTokenRef.current,
      playbackTime: playedSeconds,
    });
  };

  const handlePlayerReady = () => {
    applyPendingPlaybackTime();
  };

  const handleResumeSession = async () => {
    if (!playerRef.current) return;
    if (
      sessionState !== "authorized" ||
      !sessionIdRef.current ||
      !accessTokenRef.current ||
      prepaidSecondsRef.current <= 0
    ) {
      setError("An active session with prepaid time is required to resume.");
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
      console.error("Playback start failed", playError);
      setError(
        "Playback couldn’t start. Check that the stream is available, then try resuming the session again."
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
    if (!stream?.playbackUrl) {
      setError(
        "This stream has no available video source. No viewing time was charged."
      );
      return;
    }

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
      toast.success("Viewing time added.");
      try {
        await controlPlayback("play");
      } catch (playError) {
        console.error("Playback after payment failed", playError);
        setError(
          "Payment was completed, but playback didn’t start. Press Play to continue."
        );
      }
      await refreshBlockQuote(sessionId);
      await queryClient.invalidateQueries({
        queryKey: ["creator", "balances"],
      });
    } catch (paymentError) {
      console.error("Viewing block payment failed", paymentError);
      setError(
        "Payment wasn’t completed. Check your wallet funds or choose a different viewing duration."
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
    if (!stream.playbackUrl) {
      setError(
        "This stream has no available video source, so a viewing session cannot be started."
      );
      return;
    }

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
      if (watchSessionKey) {
        saveWatchSession(watchSessionKey, {
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
      toast.success("Watch session authorized.");
    } catch (err) {
      console.error("Session authorization failed", err);
      setError(
        "The watch session couldn’t be authorized. If you declined the wallet signature, try again when ready."
      );
      setSessionState("idle");
    }
  };

  if (!stream || streamQuery.isPending) {
    return (
      <main
        className="min-h-screen px-4 pb-12 sm:px-6"
        aria-busy="true"
        aria-label="Loading stream"
      >
        <div className="mx-auto max-w-[1440px] pt-5 sm:pt-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-40 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
              <div className="h-7 w-2/3 max-w-lg animate-pulse rounded-sm bg-[var(--surface-raised)] sm:h-8" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-24 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
              <div className="h-9 w-36 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
            </div>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-7">
            <section className="min-w-0" aria-hidden="true">
              <div className="relative aspect-video overflow-hidden rounded-sm bg-black">
                <div className="absolute inset-0 animate-pulse bg-[var(--surface-raised)]/60" />
                <div className="absolute bottom-4 left-4 h-10 w-10 animate-pulse rounded-full bg-white/15" />
                <div className="absolute inset-x-4 bottom-4 h-1 animate-pulse rounded-full bg-white/15" />
              </div>
              <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-x border-b border-[var(--panel-border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
                <div className="h-9 w-32 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
                <div className="h-4 w-32 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--panel-border)] py-4">
                <div className="h-4 w-28 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
                <div className="h-4 w-24 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
              </div>
            </section>

            <aside className="min-w-0 space-y-4" aria-hidden="true">
              <section className="rounded-sm border border-[var(--panel-border)] bg-[var(--surface)] p-4 sm:p-5">
                <div className="h-4 w-16 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
                <div className="mt-4 divide-y divide-[var(--panel-border)]">
                  {["w-28", "w-24", "w-24"].map((width, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="h-4 w-24 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
                      <div
                        className={`h-4 ${width} animate-pulse rounded-sm bg-[var(--surface-raised)]`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-5 h-11 w-full animate-pulse rounded-sm bg-[var(--surface-raised)]" />
              </section>
              <section className="rounded-sm border border-[var(--panel-border)] bg-[var(--surface)] p-4">
                <div className="h-4 w-24 animate-pulse rounded-sm bg-[var(--surface-raised)]" />
              </section>
            </aside>
          </div>
          <p className="sr-only" role="status">
            Loading stream…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-12 sm:px-6">
      <div className="mx-auto max-w-[1440px] pt-5 sm:pt-7">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>{stream.category}</span>
          <span aria-hidden="true">·</span>
          <span title={stream.creatorId}>
            Created by {shortenWalletAddress(stream.creatorId)}
          </span>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h1 className="min-w-0 flex-1 text-xl font-semibold text-[var(--text)] sm:text-2xl">
            {stream.title}
          </h1>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 text-xs font-medium ${
                streamNotLive
                  ? "border-[var(--panel-border)] text-[var(--muted)]"
                  : "border-red-400/40 text-red-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  streamNotLive ? "bg-slate-400" : "bg-red-400"
                }`}
                aria-hidden="true"
              />
              {streamNotLive ? `${stream.status} · prepaid time only` : "Live"}
            </span>
            <button
              type="button"
              onClick={() => setShowViewingPanel((visible) => !visible)}
              aria-expanded={showViewingPanel}
              aria-controls="watch-viewing-panel"
              className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-[var(--panel-border)] px-3 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--brand-hover)] hover:text-[var(--text)]"
            >
              {showViewingPanel ? (
                <PanelRightClose aria-hidden="true" size={15} />
              ) : (
                <PanelRightOpen aria-hidden="true" size={15} />
              )}
              {showViewingPanel ? "Hide viewing panel" : "Show viewing panel"}
            </button>
            <button
              type="button"
              onClick={() => showWatchGuide(stream.id)}
              aria-label="Show watching instructions"
              title="Show watching instructions"
              className="grid size-9 shrink-0 place-items-center rounded-sm border border-[var(--panel-border)] text-[var(--muted)] transition hover:border-[var(--brand-hover)] hover:text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            >
              <Info size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {showViewingPanel && (
          <button
            type="button"
            aria-label="Close viewing panel"
            onClick={() => setShowViewingPanel(false)}
            className="fixed inset-0 z-[65] bg-black/65 lg:hidden"
          />
        )}
        <div
          className={`relative grid items-start gap-5 transition-[grid-template-columns] duration-300 ease-out lg:overflow-x-clip ${
            showViewingPanel
              ? "lg:grid-cols-[minmax(0,1fr)_320px]"
              : "lg:grid-cols-1"
          } xl:gap-7`}
        >
          <section className="min-w-0">
            <div className="relative aspect-video overflow-hidden rounded-sm bg-black">
              {stream.playbackUrl ? (
                <ReactPlayer
                  key={playerRetry}
                  ref={playerRef}
                  url={stream.playbackUrl}
                  width="100%"
                  height="100%"
                  controls
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
                        controls: true,
                        parent:
                          typeof window === "undefined"
                            ? ["localhost"]
                            : [window.location.hostname],
                      },
                    },
                    youtube: { playerVars: { controls: 1 } },
                  }}
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  <h2 className="text-lg font-semibold">
                    Video source unavailable
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                    This stream has no public playback URL. No new viewing time
                    can be purchased.
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-x border-b border-[var(--panel-border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
              {sessionState === "authorized" &&
                resumeAvailable &&
                prepaidSeconds > 0 &&
                sessionIdRef.current &&
                accessTokenRef.current && (
                  <button
                    type="button"
                    onClick={() => void handleResumeSession()}
                    disabled={!stream.playbackUrl}
                    className="min-h-10 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Resume session
                  </button>
                )}
              <div className="flex flex-1 items-center justify-between gap-2">
                <p className="text-sm tabular-nums text-[var(--muted)]">
                  Video position {Math.floor(playbackSeconds / 60)}:
                  {String(Math.floor(playbackSeconds) % 60).padStart(2, "0")}
                </p>
                <button
                  type="button"
                  aria-label="Copy link"
                  title="Copy link"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/watch/${encodeURIComponent(
                          stream.id
                        )}`
                      );
                      toast.info("Link copied");
                    } catch {
                      toast.error("Could not copy link");
                    }
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-sm text-[var(--muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <span className="text-[var(--muted)]">Price per minute</span>
              <span className="font-medium text-[var(--text)]">
                ${stream.ratePerMinute.toFixed(3)} USDC
              </span>
            </div>
          </section>

          <aside
            id="watch-viewing-panel"
            aria-hidden={!showViewingPanel}
            inert={!showViewingPanel}
            className={`fixed inset-y-0 right-0 z-[70] w-[min(90vw,380px)] overflow-y-auto border-l border-[var(--panel-border)] bg-[var(--background)] p-4 transition-transform duration-300 ease-out sm:p-5 lg:inset-auto lg:top-0 lg:z-auto lg:w-[320px] lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 ${
              showViewingPanel
                ? "translate-x-0 lg:relative"
                : "pointer-events-none translate-x-full lg:absolute lg:right-0"
            } min-w-0 space-y-4`}
          >
            <div className="flex items-center justify-between border-b border-[var(--panel-border)] pb-3 lg:hidden">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Viewing panel
              </h2>
              <button
                type="button"
                onClick={() => setShowViewingPanel(false)}
                aria-label="Close viewing panel"
                className="grid size-9 place-items-center rounded-sm border border-[var(--panel-border)] text-[var(--muted)] hover:text-[var(--text)]"
              >
                <PanelRightClose size={16} aria-hidden="true" />
              </button>
            </div>
            <details className="rounded-sm border border-[var(--panel-border)] bg-[var(--surface)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--muted)] focus-visible:outline-offset-[-2px]">
                Wallet funds
              </summary>
              <div className="space-y-3 border-t border-[var(--panel-border)] p-4 text-sm">
                {!address ? (
                  <p className="text-[var(--muted)]">
                    Connect a wallet to view funds or add money for viewing.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)]">
                        Wallet balance
                      </span>
                      <span className="text-right text-[var(--text)]">
                        {balancesQuery.isPending
                          ? "Loading…"
                          : balancesQuery.isError
                          ? "Unavailable"
                          : walletUsdcBalance === null
                          ? "Unavailable"
                          : `${walletUsdcBalance} USDC`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)]">
                        Available for viewing
                      </span>
                      <span className="text-right text-[var(--text)]">
                        {balancesQuery.isPending
                          ? "Loading…"
                          : balancesQuery.isError
                          ? "Unavailable"
                          : gatewayBalance === null
                          ? "Unavailable"
                          : `${gatewayBalance} USDC`}
                      </span>
                    </div>
                    <label className="block text-xs text-[var(--muted)]">
                      Amount to add (USDC)
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(event) =>
                          setDepositAmount(event.target.value)
                        }
                        min="0.01"
                        step="0.01"
                        className="mt-1 min-h-10 w-full rounded-sm border border-[var(--panel-border)] bg-[var(--background)] px-3 text-sm text-[var(--text)]"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDeposit}
                        disabled={
                          gatewayDeposit.isPending ||
                          gatewayWithdrawal.isPending ||
                          !walletClient ||
                          Number(depositAmount) <= 0
                        }
                        className="min-h-10 rounded-sm bg-[var(--brand)] px-3 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)] disabled:opacity-50"
                      >
                        {gatewayDeposit.isPending ? "Adding…" : "Add funds"}
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
                        className="min-h-10 rounded-sm border border-[var(--panel-border)] px-3 text-sm text-[var(--text)] transition hover:border-[var(--brand-hover)] disabled:opacity-50"
                      >
                        {gatewayWithdrawal.isPending
                          ? "Withdrawing…"
                          : "Withdraw"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </details>
            <section className="rounded-sm border border-[var(--panel-border)] bg-[var(--surface)] p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Viewing
              </h2>
              <dl className="mt-4 divide-y divide-[var(--panel-border)] text-sm">
                <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                  <dt className="text-[var(--muted)]">Time remaining</dt>
                  <dd className="font-semibold tabular-nums text-[var(--text)]">
                    {Math.floor(prepaidSeconds / 60)}:
                    {String(prepaidSeconds % 60).padStart(2, "0")}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-[var(--muted)]">Time watched</dt>
                  <dd className="font-medium tabular-nums text-[var(--text)]">
                    {Math.floor(secondsWatched / 60)}:
                    {String(secondsWatched % 60).padStart(2, "0")}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
                  <dt className="text-[var(--muted)]">Amount spent</dt>
                  <dd className="font-medium tabular-nums text-[var(--text)]">
                    ${currentCost} USDC
                  </dd>
                </div>
              </dl>

              {streamNotLive && (
                <p className="mt-4 border-l-2 border-[var(--brand-hover)] pl-3 text-sm text-[var(--muted)]">
                  {prepaidSeconds > 0
                    ? "This stream is offline. You can use the prepaid time shown above, but cannot buy more while it is offline."
                    : "This stream is offline. A saved session with prepaid time is required to watch; new time cannot be purchased."}
                </p>
              )}
              {!streamNotLive && sessionState === "idle" && (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Connect your wallet to continue. Signing authorizes a watch
                  session; it does not approve a payment.
                </p>
              )}
              {sessionState === "pending" && (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Waiting for your wallet signature…
                </p>
              )}
              {sessionState === "authorized" && prepaidSeconds > 0 && (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Your prepaid time is ready. Press Play when you’re ready to
                  watch.
                </p>
              )}
              {sessionState === "authorized" && prepaidSeconds === 0 && (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Choose and pay for a viewing duration before playback.
                </p>
              )}
              {sessionState === "playing" && (
                <p className="mt-4 text-sm text-[var(--success)]">
                  Prepaid time is being used while playback is active.
                </p>
              )}
              {sessionState === "capped" && (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  This watch session has ended. Start a new one to continue.
                </p>
              )}

              {!streamNotLive &&
                (sessionState === "idle" || sessionState === "capped") && (
                  <button
                    type="button"
                    onClick={handleAuthorizeSession}
                    disabled={isSigning || !address || !stream.playbackUrl}
                    className="mt-5 min-h-11 w-full rounded-sm bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSigning
                      ? "Check your wallet…"
                      : !address
                      ? "Connect wallet to continue"
                      : sessionState === "capped"
                      ? "Start a new session"
                      : "Authorize watch session"}
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
                      blockQuote.seconds === 0 ||
                      !stream.playbackUrl
                    }
                    className="mt-5 min-h-11 w-full rounded-sm bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Choose viewing time
                  </button>
                )}
              {sessionState === "authorized" &&
                prepaidSeconds === 0 &&
                blockQuote && (
                  <p className="mt-2 text-center text-xs text-[var(--muted)]">
                    Next available block: {blockQuote.seconds} seconds · $
                    {blockQuote.amount} USDC
                  </p>
                )}
              {prepaidSeconds === 0 && secondsWatched > 0 && (
                <p className="mt-3 text-center text-sm text-[var(--muted)]">
                  Viewing time has run out. Buy another block to continue.
                </p>
              )}
              {prepaidSeconds > 0 && (
                <p className="mt-3 text-center text-xs text-[var(--muted)]">
                  Unused prepaid time is not refunded.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
      {showPayModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4"
          onClick={() => setShowPayModal(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="my-auto w-full max-w-md rounded-sm border border-[var(--panel-border)] bg-[var(--surface)] p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="payment-modal-title"
                  className="text-lg font-semibold text-[var(--text)]"
                >
                  Choose viewing time
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Price per minute: ${stream.ratePerMinute.toFixed(3)} USDC
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                disabled={paidBlockMutation.isPending}
                aria-label="Close payment dialog"
                className="grid size-9 shrink-0 place-items-center rounded-sm text-[var(--muted)] hover:text-white disabled:opacity-50"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-sm text-[var(--muted)]">
                Duration
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
                  className="mt-1 min-h-11 w-full rounded-sm border border-[var(--panel-border)] bg-[var(--background)] px-3 text-lg text-[var(--text)]"
                />
              </label>
              <label className="text-sm text-[var(--muted)]">
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
                  className="mt-1 min-h-11 w-full rounded-sm border border-[var(--panel-border)] bg-[var(--background)] px-3 text-base text-[var(--text)]"
                >
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                </select>
              </label>
            </div>
            <div className="mt-5 border-y border-[var(--panel-border)] py-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--muted)]">Selected time</span>
                <span className="font-medium text-[var(--text)]">
                  {durationValid
                    ? `${durationCount} ${durationUnit}${
                        durationCount === 1 ? "" : "s"
                      } (${durationSeconds} sec)`
                    : "Choose up to 24 hours"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--muted)]">Amount due</span>
                <span className="text-xl font-semibold tabular-nums text-[var(--text)]">
                  ${durationAmount} USDC
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Review the duration and total before approving in your wallet.
              Unused prepaid time is not refunded.
            </p>
            <button
              type="button"
              onClick={() => void handlePayNextBlock(durationSeconds)}
              disabled={
                !durationValid || paidBlockMutation.isPending || !address
              }
              className="mt-5 min-h-11 w-full rounded-sm bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paidBlockMutation.isPending
                ? "Waiting for wallet approval…"
                : `Approve $${durationAmount} USDC`}
            </button>
            <button
              type="button"
              onClick={() => setShowPayModal(false)}
              disabled={paidBlockMutation.isPending}
              className="mt-2 min-h-10 w-full text-sm text-[var(--muted)] hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
