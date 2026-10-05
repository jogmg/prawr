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
  getPaymentRequirements,
  getStreamById,
  heartbeatSession,
  pauseSession,
  resumeSession,
  restoreSession,
  startSession,
  type StreamRecord,
} from "../../lib/prawr-api";
import {
  depositToGateway,
  payForStream,
  getGatewayBalances,
  withdrawFromGateway,
  type GatewayWithdrawalSigner,
} from "../../lib/gateway-client";
import type { BatchEvmSigner } from "@circle-fin/x402-batching";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export default function WatchPage({ params }: { params: { slug: string } }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();

  const [secondsWatched, setSecondsWatched] = useState(0);
  const [prepaidSeconds, setPrepaidSeconds] = useState(0);
  const [amountCharged, setAmountCharged] = useState(0);
  const [payingBlock, setPayingBlock] = useState(false);
  const [blockQuote, setBlockQuote] = useState<{
    seconds: number;
    amount: string;
  } | null>(null);
  const [sessionState, setSessionState] = useState<
    "idle" | "pending" | "authorized" | "playing" | "capped"
  >("idle");
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayBalance, setGatewayBalance] = useState<string | null>(null);
  const [walletUsdcBalance, setWalletUsdcBalance] = useState<string | null>(
    null
  );
  const [depositAmount, setDepositAmount] = useState("5");
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [stream, setStream] = useState<StreamRecord | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Session refs - avoids stale closures inside the pay interval.
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentInFlightRef = useRef(false);
  const prepaidSecondsRef = useRef(0);
  const serverSessionStatusRef = useRef<"playing" | "paused">("playing");
  const pauseRequestRef = useRef<Promise<void> | null>(null);
  const restoreTimeRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionStorageKey =
    address && stream
      ? `prawr:watch-session:${stream.id}:${address.toLowerCase()}`
      : null;

  const applyPendingPlaybackTime = () => {
    const video = videoRef.current;
    const playbackTime = restoreTimeRef.current;
    if (!video || playbackTime === null || video.readyState < 1) return;

    video.currentTime = Math.min(
      playbackTime,
      Number.isFinite(video.duration) ? video.duration : playbackTime
    );
    lastVideoTimeRef.current = video.currentTime;
    restoreTimeRef.current = null;
  };

  useEffect(() => {
    let mounted = true;
    getStreamById(decodeURIComponent(params.slug))
      .then((record) => {
        if (mounted) setStream(record);
      })
      .catch((loadError) => {
        if (mounted) {
          setStreamError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load stream."
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [params.slug]);

  useEffect(() => {
    if (!sessionStorageKey || !address || !stream) return;

    let active = true;
    const savedValue = sessionStorage.getItem(sessionStorageKey);
    if (!savedValue) return;

    try {
      const saved = JSON.parse(savedValue) as {
        sessionId: string;
        accessToken: string;
        playbackTime: number;
      };
      if (!saved.sessionId || !saved.accessToken) {
        sessionStorage.removeItem(sessionStorageKey);
        return;
      }

      void restoreSession(saved.sessionId, saved.accessToken)
        .then(async (session) => {
          if (!active) return;
          if (
            session.streamId !== stream.id ||
            session.viewerWallet.toLowerCase() !== address.toLowerCase()
          ) {
            sessionStorage.removeItem(sessionStorageKey);
            return;
          }

          sessionIdRef.current = session.sessionId;
          accessTokenRef.current = saved.accessToken;
          serverSessionStatusRef.current = "paused";
          setSecondsWatched(session.secondsWatched);
          setPrepaidSeconds(session.prepaidSeconds);
          prepaidSecondsRef.current = session.prepaidSeconds;
          setAmountCharged(Number(session.charge));
          restoreTimeRef.current = Number.isFinite(saved.playbackTime)
            ? saved.playbackTime
            : 0;
          applyPendingPlaybackTime();

          if (session.status === "completed" || session.status === "capped") {
            sessionStorage.removeItem(sessionStorageKey);
            setSessionState("capped");
            return;
          }

          setSessionState("authorized");
          setResumeAvailable(session.prepaidSeconds > 0);
          await refreshBlockQuote(session.sessionId);
        })
        .catch((restoreError) => {
          console.error("Session restore failed", restoreError);
          if (active) {
            setError(
              "Unable to restore the saved session. Try again or authorize a new session."
            );
          }
        });
    } catch (restoreError) {
      console.error("Saved session data is invalid", restoreError);
      sessionStorage.removeItem(sessionStorageKey);
    }

    return () => {
      active = false;
    };
  }, [address, sessionStorageKey, stream]);

  const currentCost = useMemo(() => {
    return amountCharged.toFixed(6);
  }, [amountCharged]);

  const refreshGatewayBalance = async () => {
    if (!address) return;
    try {
      const balances = await getGatewayBalances(address);
      setGatewayBalance(balances.gateway.formattedAvailable);
      setWalletUsdcBalance(balances.wallet.formatted);
    } catch {
      // Gateway API unreachable - leave balance unknown rather than showing 0.
      setGatewayBalance(null);
      setWalletUsdcBalance(null);
    }
  };

  const refreshBlockQuote = async (sessionId: string) => {
    const quote = await getPaymentRequirements(sessionId);
    setBlockQuote({
      seconds: quote.nextBlockSeconds,
      amount: quote.nextBlockAmount,
    });
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

  const handleWithdraw = async () => {
    if (!address || !walletClient || !gatewayBalance) return;
    setWithdrawing(true);
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
      await withdrawFromGateway(
        depositAmount,
        address,
        walletClient,
        gatewaySigner
      );
      await refreshGatewayBalance();
    } catch (err) {
      console.error("Withdrawal failed", err);
      setError(
        err instanceof Error ? err.message : "Gateway withdrawal failed."
      );
    } finally {
      setWithdrawing(false);
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
      videoRef.current?.pause();
      setError(
        prepaidSecondsRef.current <= 0
          ? "Pay for a viewing block before playing."
          : "Authorize a viewing session before playing this stream."
      );
    }
  };

  const handleVideoPlaying = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !accessTokenRef.current || !address) return;
    if (watchIntervalRef.current) return;

    await pauseRequestRef.current;

    if (serverSessionStatusRef.current === "paused") {
      try {
        await resumeSession(sessionId, accessTokenRef.current);
        serverSessionStatusRef.current = "playing";
      } catch (resumeError) {
        videoRef.current?.pause();
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
        const session = await heartbeatSession(sessionId, accessToken);
        serverSessionStatusRef.current =
          session.status === "paused" ? "paused" : "playing";
        setSecondsWatched(session.secondsWatched);
        prepaidSecondsRef.current = session.prepaidSeconds;
        setPrepaidSeconds(session.prepaidSeconds);
        if (session.prepaidSeconds <= 0) {
          if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
          watchIntervalRef.current = null;
          setSessionState("authorized");
          videoRef.current?.pause();
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
        videoRef.current?.pause();
        setSessionState("authorized");
      } finally {
        paymentInFlightRef.current = false;
      }
    }, 1000);
  };

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    lastVideoTimeRef.current = video.currentTime;
    video.playbackRate = 1;
    if (!sessionStorageKey || !sessionIdRef.current || !accessTokenRef.current)
      return;

    sessionStorage.setItem(
      sessionStorageKey,
      JSON.stringify({
        sessionId: sessionIdRef.current,
        accessToken: accessTokenRef.current,
        playbackTime: video.currentTime,
      })
    );
  };

  const handleVideoMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 1;
    applyPendingPlaybackTime();
  };

  const handleVideoSeeking = () => {
    const video = videoRef.current;
    const lastAllowedTime = lastVideoTimeRef.current;
    if (!video || lastAllowedTime === null) return;
    if (Math.abs(video.currentTime - lastAllowedTime) > 0.25) {
      video.currentTime = lastAllowedTime;
    }
  };

  const handleVideoRateChange = () => {
    const video = videoRef.current;
    if (video && video.playbackRate !== 1) video.playbackRate = 1;
  };

  const handleTogglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (prepaidSecondsRef.current <= 0) {
      setError("Pay for a viewing block before playing.");
      return;
    }
    try {
      if (video.ended) {
        lastVideoTimeRef.current = 0;
        video.currentTime = 0;
      }
      await video.play();
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
        pauseRequestRef.current = pauseSession(sessionId, accessToken)
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

  const handlePayNextBlock = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !address || prepaidSecondsRef.current > 0) return;

    setPayingBlock(true);
    setError(null);
    try {
      const quote = await getPaymentRequirements(sessionId);
      setBlockQuote({
        seconds: quote.nextBlockSeconds,
        amount: quote.nextBlockAmount,
      });
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
      const result = await payForStream<{
        status: string;
        prepaidSeconds: number;
        secondsWatched: number;
        charge: string;
      }>(
        `${API_BASE_URL}/streams/sessions/${sessionId}/watch`,
        {
          method: "POST",
          body: { blockSeconds: quote.nextBlockSeconds },
        },
        gatewaySigner
      );
      prepaidSecondsRef.current = result.data.prepaidSeconds;
      serverSessionStatusRef.current = "paused";
      setPrepaidSeconds(result.data.prepaidSeconds);
      setSecondsWatched(result.data.secondsWatched);
      setAmountCharged(Number(result.data.charge));
      setResumeAvailable(result.data.prepaidSeconds > 0);
      setError(null);
      try {
        await videoRef.current?.play();
      } catch (playError) {
        setError(
          playError instanceof Error
            ? playError.message
            : "Block paid. Press Play to start playback."
        );
      }
      await refreshBlockQuote(sessionId);
      await refreshGatewayBalance();
    } catch (paymentError) {
      console.error("Viewing block payment failed", paymentError);
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Block payment failed."
      );
    } finally {
      setPayingBlock(false);
    }
  };

  const handleVideoError = () => {
    handleVideoPause();
    setError(
      "The video could not be loaded. Check that the URL is public and serves a browser-compatible MP4 or WebM file."
    );
  };

  const handleAuthorizeSession = async () => {
    if (!address || !stream) return;

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
      const session = await createSession({
        streamId: stream.id,
        viewerWallet: address,
        authorizationHash,
        issuedAt,
      });
      sessionIdRef.current = session.sessionId;
      accessTokenRef.current = session.accessToken ?? null;

      // 3. Start the session server-side.
      await startSession(session.sessionId, session.accessToken ?? "");
      if (sessionStorageKey) {
        sessionStorage.setItem(
          sessionStorageKey,
          JSON.stringify({
            sessionId: session.sessionId,
            accessToken: session.accessToken,
            playbackTime: 0,
          })
        );
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
            {stream.playbackUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={stream.playbackUrl}
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={handleVideoMetadata}
                  onSeeking={handleVideoSeeking}
                  onRateChange={handleVideoRateChange}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onPlay={handleVideoStart}
                  onPlaying={handleVideoPlaying}
                  onPause={handleVideoPause}
                  onWaiting={handleVideoPause}
                  onError={handleVideoError}
                  className="aspect-video w-full bg-black"
                >
                  Your browser does not support HTML video playback.
                </video>
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
                    {Math.floor((videoRef.current?.currentTime ?? 0) / 60)}:
                    {String(
                      Math.floor(videoRef.current?.currentTime ?? 0) % 60
                    ).padStart(2, "0")}
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
                    ${stream.ratePerMinute.toFixed(2)}/min
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
                      disabled={depositing || withdrawing || !walletClient}
                      className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {depositing ? "Depositing..." : "Deposit"}
                    </button>
                    <button
                      type="button"
                      onClick={handleWithdraw}
                      disabled={
                        withdrawing ||
                        depositing ||
                        !walletClient ||
                        !gatewayBalance ||
                        Number(depositAmount) <= 0 ||
                        Number(depositAmount) > Number(gatewayBalance)
                      }
                      className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {withdrawing ? "Withdrawing..." : "Withdraw"}
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3">
                <ConnectKitButton />
              </div>

              {(sessionState === "idle" || sessionState === "capped") && (
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

              {sessionState === "authorized" && prepaidSeconds === 0 && (
                <button
                  type="button"
                  onClick={handlePayNextBlock}
                  disabled={
                    payingBlock || !address || blockQuote?.seconds === 0
                  }
                  className="w-full rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {payingBlock
                    ? "Waiting for payment signature..."
                    : blockQuote && blockQuote.seconds > 0
                    ? `Pay $${blockQuote.amount} for ${blockQuote.seconds}s`
                    : "Unable to quote the next block"}
                </button>
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
    </main>
  );
}
