"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import ReactPlayer from "react-player/lazy";
import { toast } from "sonner";
import { useDiscoverableStreams } from "./lib/hooks/use-stream-queries";

function StreamPreview({ playbackUrl }: { playbackUrl?: string }) {
  const playerRef = useRef<ReactPlayer | null>(null);
  const isTwitch = playbackUrl?.includes("twitch.tv");

  useEffect(() => {
    if (!isTwitch) return;
    const interval = setInterval(() => {
      const player = playerRef.current?.getInternalPlayer();
      if (
        player &&
        typeof player.getCurrentTime === "function" &&
        player.getCurrentTime() >= 60
      ) {
        playerRef.current?.seekTo(0, "seconds");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isTwitch, playbackUrl]);

  if (!playbackUrl) {
    return (
      <div className="flex aspect-video items-center justify-center bg-black text-sm text-slate-400">
        Preview unavailable
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <ReactPlayer
        className="absolute inset-0"
        ref={playerRef}
        url={playbackUrl}
        width="100%"
        height="100%"
        controls={false}
        playing
        muted
        playsinline
        progressInterval={1000}
        onProgress={({ playedSeconds }) => {
          if (!isTwitch && playedSeconds >= 60)
            playerRef.current?.seekTo(0, "seconds");
        }}
        config={{
          file: {
            hlsVersion: "1.5.17",
            attributes: { allow: "autoplay; encrypted-media" },
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
      <div
        className="absolute inset-0 z-10 bg-transparent"
        aria-hidden="true"
      />
    </div>
  );
}

function StreamSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-md border border-[var(--panel-border)] bg-[var(--surface)]"
      aria-hidden="true"
    >
      <div className="aspect-video animate-pulse bg-[var(--surface-raised)]" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-raised)]" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--surface-raised)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-raised)]" />
      </div>
    </div>
  );
}

function formatRate(ratePerMinute: number) {
  return `$${ratePerMinute
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "")}/min`;
}

export default function HomePage() {
  const streamsQuery = useDiscoverableStreams();
  const { isError: streamsFailed, refetch: refetchStreams } = streamsQuery;
  const streams = streamsQuery.data ?? [];
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } =
    streamsQuery;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage || isError) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage]);

  useEffect(() => {
    if (!streamsFailed) return;
    toast.error("Streams couldn’t load. Check your connection and try again.", {
      action: {
        label: "Retry",
        onClick: () => void refetchStreams(),
      },
    });
  }, [streamsFailed, refetchStreams]);

  return (
    <main className="min-h-screen px-4 pb-12 sm:px-6">
      <section id="streams" className="mx-auto max-w-7xl pt-8 sm:pt-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--panel-border)] pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-hover)]">
              Browse
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--text)] sm:text-3xl">
              Streams
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Browse and choose a stream to begin watching.
            </p>
          </div>
        </div>

        {streamsFailed ? null : streamsQuery.isPending ? (
          <div
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Loading streams"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <StreamSkeleton key={index} />
            ))}
          </div>
        ) : streams.length === 0 ? (
          <div className="rounded-md border border-[var(--panel-border)] bg-[var(--surface)] px-5 py-12 text-center">
            <h2 className="text-lg font-medium">No streams available</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Live streams and streams with your remaining prepaid time will
              appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {streams.map((stream) => {
              const offline = stream.status !== "live";
              const href = `/watch/${encodeURIComponent(stream.id)}`;
              return (
                <article key={stream.id} className="min-w-0">
                  <Link
                    href={href}
                    className="group relative block overflow-hidden rounded-md bg-black focus-visible:outline-offset-4"
                    aria-label={`Open ${stream.title}`}
                  >
                    <StreamPreview playbackUrl={stream.playbackUrl} />
                    <span
                      className={`absolute left-3 top-3 rounded-sm px-2 py-1 text-xs font-semibold uppercase tracking-wide ${
                        offline
                          ? "bg-[#2b302e] text-slate-100"
                          : "bg-red-900/90 text-white"
                      }`}
                    >
                      {offline ? "Offline · time remaining" : "Live"}
                    </span>
                  </Link>
                  <div className="pt-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                      <span className="truncate">{stream.title}</span>
                      <span className="shrink-0">
                        {formatRate(stream.ratePerMinute)}
                      </span>
                    </div>
                    {/* <h2 className="mt-1 truncate text-base font-semibold text-[var(--text)]">
                      <Link href={href} className="hover:text-[var(--action)]">
                        {stream.title}
                      </Link>
                    </h2> */}
                    {/* <div className="mt-1 flex items-start justify-between gap-3 text-sm">
                      <span className="truncate text-[var(--muted)]">
                        Creator
                      </span>
                      {offline && (
                        <span className="max-w-[45%] text-right text-xs text-[var(--muted)]">
                          Use prepaid time; no new time can be bought offline.
                        </span>
                      )}
                    </div> */}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div ref={loadMoreRef} className="min-h-1" aria-hidden="true" />
        {isFetchingNextPage && (
          <div
            className="flex items-center justify-center gap-1 py-8 text-sm text-[var(--muted)]"
            role="status"
            aria-label="Loading more streams"
          >
            <span className="sr-only">Loading more streams</span>
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                aria-hidden="true"
                className="size-2 animate-bounce rounded-full bg-[var(--action)]"
                style={{ animationDelay: `${dot * 140}ms` }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
