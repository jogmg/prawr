"use client";

import { ConnectKitButton } from "connectkit";
import { useEffect, useMemo, useRef } from "react";
import ReactPlayer from "react-player/lazy";
import { useDiscoverableStreams } from "./lib/hooks/use-stream-queries";

function StreamPreview({ playbackUrl }: { playbackUrl?: string }) {
  const playerRef = useRef<ReactPlayer | null>(null);
  const isTwitch = playbackUrl?.includes("twitch.tv");

  // Fix loop for Twitch by manually polling the player time
  useEffect(() => {
    if (!isTwitch) return; // Ensure we only poll for Twitch streams

    const interval = setInterval(() => {
      const internalPlayer = playerRef.current?.getInternalPlayer();
      if (
        internalPlayer &&
        typeof internalPlayer.getCurrentTime === "function"
      ) {
        const currentTime = internalPlayer.getCurrentTime();
        if (currentTime >= 60) {
          playerRef.current?.seekTo(0, "seconds");
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isTwitch, playbackUrl]);

  return (
    <div className="relative h-60 w-full bg-black">
      <ReactPlayer
        className="aspect-video w-full bg-black"
        ref={playerRef}
        url={playbackUrl}
        width="100%"
        height="100%"
        controls={false}
        playing={true}
        muted={true}
        playsinline={true}
        progressInterval={1000}
        onProgress={({ playedSeconds }) => {
          if (!isTwitch && playedSeconds >= 60) {
            playerRef.current?.seekTo(0, "seconds");
          }
        }}
        // FIX: Pass the iframe attribute straight down through standard HTML layout attributes
        // This bypasses strict inner config checks while embedding 'allow' rules perfectly
        config={{
          file: {
            hlsVersion: "1.5.17",
            attributes: {
              allow: "autoplay; encrypted-media",
            },
          },
          twitch: {
            options: {
              autoplay: true,
              muted: true,
              controls: false,
              parent:
                typeof window !== "undefined" &&
                window.location.hostname !== "localhost"
                  ? [window.location.hostname]
                  : ["localhost"],
            },
          },
          youtube: { playerVars: { controls: 0, disablekb: 1 } },
        }}
      />
      {/* Absolute overlay ensures user clicks map to navigation instead of the player iframe */}
      <div className="absolute inset-0 z-10 bg-transparent" />
    </div>
  );
}

export default function HomePage() {
  const streamsQuery = useDiscoverableStreams();
  const streams = streamsQuery.data;

  const streamCards = useMemo(
    () =>
      streams
        .filter(
          (stream) =>
            stream.status === "live" ||
            (stream.status === "offline" && stream.hasPrepaidTime)
        )
        .map((stream) => ({
          ...stream,
          rate: `$${stream.ratePerMinute
            .toFixed(3)
            .replace(/0+$/, "")
            .replace(/\.$/, "")}/min`,
          status: stream.status.toUpperCase(),
        })),
    [streams]
  );
  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white shadow-glow">
              P
            </div>
            <div>
              <div className="text-xl font-bold">Prawr</div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#streams" className="hover:text-white">
              Browse
            </a>
            <a href="#streams" className="hover:text-white">
              Streams
            </a>
            <a href="/creator" className="hover:text-white">
              Creator
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white">
              <ConnectKitButton />
            </div>
            <a
              href="/creator"
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Become a Creator
            </a>
          </div>
        </header>

        <section className="mb-14 grid items-center gap-8 rounded-[32px] border border-slate-700 bg-slate-950/60 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-12">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-brand-100">
              Micropayment streaming
            </div>
            <h1 className="mb-5 max-w-xl text-4xl font-black tracking-tight text-white md:text-6xl">
              Watch what you want. Pay only for what you watch.
            </h1>
            <p className="max-w-xl text-lg text-slate-300">
              Prawr streams on Arc with live USDC billing based on validated
              viewing time, so creators earn while viewers stay in control of
              their spend.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#streams"
                className="rounded-full bg-brand-500 px-6 py-3 font-semibold text-white shadow-glow transition hover:bg-brand-600"
              >
                Watch Live
              </a>
              <a
                href="/creator"
                className="rounded-full border border-slate-600 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white"
              >
                Become a Creator
              </a>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
              <span>Live now</span>
              <span className="inline-flex items-center gap-2 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                24 streams
              </span>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Creator wallet</span>
                  <span>Arc Testnet</span>
                </div>
                <div className="text-2xl font-bold">$42.18</div>
                <div className="mt-1 text-sm text-slate-300">
                  Creator earnings this week
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                <div className="rounded-2xl bg-slate-900 p-4">
                  <div className="text-slate-400">Rate</div>
                  <div className="mt-2 text-xl font-semibold">$0.02/min</div>
                </div>
                <div className="rounded-2xl bg-slate-900 p-4">
                  <div className="text-slate-400">Viewer count</div>
                  <div className="mt-2 text-xl font-semibold">1.4k</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="streams" className="mb-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-brand-100">
                Live now
              </p>
              <h2 className="mt-2 text-3xl font-bold text-white">
                Discover live streams
              </h2>
            </div>
            <a
              href="/creator"
              className="text-sm text-brand-100 hover:text-white"
            >
              Manage creator dashboard →
            </a>
          </div>

          {streamsQuery.isError && (
            <p role="alert" className="mb-4 text-sm text-red-300">
              Unable to load streams. Please try again shortly.
            </p>
          )}
          <div className="grid gap-5 md:grid-cols-3">
            {streamCards.map((stream) => (
              <article key={stream.id} className="card overflow-hidden">
                <div className="relative">
                  <a
                    href={`/watch/${encodeURIComponent(stream.id)}`}
                    aria-label={`Watch ${stream.title}`}
                    className="block"
                  >
                    <StreamPreview playbackUrl={stream.playbackUrl} />
                    <div className="absolute left-3 top-3 inline-flex rounded-full bg-red-500 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
                      {stream.status === "OFFLINE"
                        ? "ENDED · PAID TIME LEFT"
                        : stream.status}
                    </div>
                  </a>
                </div>
                <div className="p-5">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>{stream.creatorId}</span>
                    <span>{stream.category}</span>
                  </div>
                  <h3 className="mb-3 text-xl font-semibold text-white">
                    {stream.title}
                  </h3>
                  <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
                    <span>{stream.creatorId}</span>
                    <span>{stream.rate}</span>
                  </div>
                  <a
                    href={`/watch/${encodeURIComponent(stream.id)}`}
                    className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
                  >
                    {stream.status === "OFFLINE"
                      ? "Use paid time"
                      : "Watch Live"}
                  </a>
                </div>
              </article>
            ))}
            {streamsQuery.isPending && streamCards.length === 0 && (
              <p className="col-span-full py-10 text-center text-slate-400">
                Loading streams...
              </p>
            )}
            {!streamsQuery.isPending && streamCards.length === 0 && (
              <p className="col-span-full py-10 text-center text-slate-400">
                No live streams are available right now.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
