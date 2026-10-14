"use client";

import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { useQueries, type Query } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount, useSignTypedData, useWalletClient } from "wagmi";
import type { GatewayWithdrawalSigner } from "../lib/gateway-client";
import {
  useCreatorSummary,
  useWalletGatewayBalances,
} from "../lib/hooks/use-creator-queries";
import { useGatewayWithdrawal } from "../lib/hooks/use-gateway-mutations";
import { useCreateStream, useStreams } from "../lib/hooks/use-stream-queries";
import {
  getGatewayReceiptTransaction,
  type CreatorPayoutSummary,
  type GatewayReceiptTransaction,
} from "../lib/prawr-api";

const ARC_EXPLORER_URLS: Record<string, string> = {
  [`eip155:${CHAIN_CONFIGS.arc.chain.id}`]:
    CHAIN_CONFIGS.arc.chain.blockExplorers?.default?.url ??
    "https://explorer.arc.io",
  [`eip155:${CHAIN_CONFIGS.arcTestnet.chain.id}`]:
    CHAIN_CONFIGS.arcTestnet.chain.blockExplorers?.default?.url ??
    "https://testnet.arcscan.app",
};
const fallbackSummary: CreatorPayoutSummary = {
  creatorWallet: "",
  totalReceived: "0",
  receiptCount: 0,
  receipts: [],
  pendingClaims: [],
};
const GATEWAY_TRANSFER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_STREAM_RATE_PER_MINUTE = 0.001;
const MAX_STREAM_RATE_PER_MINUTE = 100;
const STREAMS_PER_PAGE = 8;
const EARNINGS_PER_PAGE = 10;

function ListPagination({
  label,
  page,
  pageCount,
  onPageChange,
}: {
  label: string;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex items-center justify-end gap-3 border-t border-[var(--panel-border)] py-3"
    >
      <button
        type="button"
        aria-label={`Previous ${label} page`}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex min-h-9 items-center gap-1 rounded-sm border border-[var(--panel-border)] px-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Previous
      </button>
      <span className="text-sm tabular-nums text-[var(--muted)]">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        aria-label={`Next ${label} page`}
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex min-h-9 items-center gap-1 rounded-sm border border-[var(--panel-border)] px-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

export default function CreatorDashboardPage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();
  const summaryQuery = useCreatorSummary(address);
  const streamsQuery = useStreams(Boolean(address));
  const balancesQuery = useWalletGatewayBalances(address);
  const { refetch: refetchStreams, isError: streamsFailed } = streamsQuery;
  const { refetch: refetchBalances, isError: balancesFailed } = balancesQuery;
  const { refetch: refetchSummary, isError: summaryFailed } = summaryQuery;
  const createStreamMutation = useCreateStream();
  const withdrawalMutation = useGatewayWithdrawal();
  const summary = summaryQuery.data ?? fallbackSummary;
  const streams = streamsQuery.data ?? [];
  const balances = balancesQuery.data;
  const streamsLoading = Boolean(address) && streamsQuery.isPending;
  const gatewayBalance = balances?.gateway.formattedAvailable ?? null;
  const walletBalance =
    balances?.wallet.formatted == null
      ? null
      : Number(balances.wallet.formatted).toFixed(2);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [ratePerMinute, setRatePerMinute] = useState("0.02");
  const [streamsPage, setStreamsPage] = useState(1);
  const [earningsPage, setEarningsPage] = useState(1);

  const creatorStreams = address
    ? streams.filter(
        (stream) => stream.creatorWallet.toLowerCase() === address.toLowerCase()
      )
    : [];
  const streamPageCount = Math.max(
    1,
    Math.ceil(creatorStreams.length / STREAMS_PER_PAGE)
  );
  const activeStreamsPage = Math.min(streamsPage, streamPageCount);
  const visibleCreatorStreams = creatorStreams.slice(
    (activeStreamsPage - 1) * STREAMS_PER_PAGE,
    activeStreamsPage * STREAMS_PER_PAGE
  );
  const earningsPageCount = Math.max(
    1,
    Math.ceil(summary.receipts.length / EARNINGS_PER_PAGE)
  );
  const activeEarningsPage = Math.min(earningsPage, earningsPageCount);
  const visibleReceipts = summary.receipts.slice(
    (activeEarningsPage - 1) * EARNINGS_PER_PAGE,
    activeEarningsPage * EARNINGS_PER_PAGE
  );
  const receiptTransactionQueries = useQueries({
    queries: visibleReceipts.map((payment) => ({
      queryKey: ["creator", "receipt-transaction", payment.receiptId],
      queryFn: () => getGatewayReceiptTransaction(payment.receiptId),
      enabled: GATEWAY_TRANSFER_ID_PATTERN.test(payment.transaction ?? ""),
      staleTime: 15_000,
      refetchInterval: (query: Query<GatewayReceiptTransaction, Error>) => {
        const result = query.state.data;
        return result?.transactionHash ||
          result?.status === "failed" ||
          result?.status === "unavailable"
          ? false
          : 15_000;
      },
      refetchIntervalInBackground: false,
    })),
  });

  useEffect(() => {
    if (streamsFailed)
      toast.error(
        "Creator streams couldn’t load. Your streams were not changed.",
        {
          action: { label: "Retry", onClick: () => void refetchStreams() },
        }
      );
  }, [streamsFailed, refetchStreams]);

  useEffect(() => {
    if (balancesFailed)
      toast.warning(
        "Available balance couldn’t be loaded. Withdrawals are disabled.",
        {
          action: { label: "Retry", onClick: () => void refetchBalances() },
        }
      );
  }, [balancesFailed, refetchBalances]);

  useEffect(() => {
    if (summaryFailed)
      toast.error("Earnings couldn’t be loaded.", {
        action: { label: "Retry", onClick: () => void refetchSummary() },
      });
  }, [summaryFailed, refetchSummary]);

  const handleCreateStream = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!address) {
      toast.error("Connect your wallet before creating a stream.");
      return;
    }
    try {
      await createStreamMutation.mutateAsync({
        title,
        creatorId: address,
        creatorWallet: address,
        category,
        playbackUrl,
        ratePerMinute: Number(ratePerMinute),
      });
      setTitle("");
      setCategory("");
      setPlaybackUrl("");
      setRatePerMinute("0.02");
      setShowCreateForm(false);
      toast.success("Stream created successfully.");
    } catch (createFailure) {
      toast.error(
        createFailure instanceof Error
          ? createFailure.message
          : "Unable to create stream."
      );
    }
  };

  const gatewayClaimable =
    gatewayBalance === null ? null : `$${Number(gatewayBalance).toFixed(2)}`;

  const handleWithdraw = async () => {
    if (
      !address ||
      !walletClient ||
      gatewayBalance === null ||
      Number(gatewayBalance) <= 0
    ) {
      return;
    }

    try {
      // Withdraw from Gateway to wallet
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
      await withdrawalMutation.mutateAsync({
        amount: gatewayBalance,
        recipient: address,
        walletClient,
        signer: gatewaySigner,
      });

      toast.success("Withdrawal submitted to your connected wallet.");
    } catch (withdrawError) {
      console.error("Withdrawal failed", withdrawError);
      toast.error(
        "Withdrawal couldn’t be completed. Check your wallet and try again."
      );
    }
  };

  return (
    <main className="min-h-screen px-4 py-8 text-[var(--text)] sm:px-6">
      <div className="mx-auto max-w-7xl">
        <section
          aria-label="Earnings summary"
          className="mb-8 grid gap-0 border-y border-[var(--panel-border)] sm:grid-cols-4"
        >
          <div className="py-4 sm:pl-5">
            <div className="text-sm text-[var(--muted)]">Wallet balance</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {!address
                ? "—"
                : balancesQuery.isPending
                ? "Loading…"
                : balancesQuery.isError || walletBalance === null
                ? "Unavailable"
                : `$${walletBalance}`}
            </div>
          </div>
          <div className="border-t border-[var(--panel-border)] py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div className="text-sm text-[var(--muted)]">Earnings</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {!address
                ? "—"
                : summaryQuery.isPending
                ? "Loading…"
                : summaryQuery.isError
                ? "Unavailable"
                : `$${Number(summary.totalReceived || 0).toFixed(2)}`}
            </div>
          </div>
          <div className="border-t border-[var(--panel-border)] py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div className="text-sm text-[var(--muted)]">
              Unclaimed earnings
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {!address
                ? "Connect wallet"
                : balancesQuery.isPending
                ? "Loading…"
                : balancesQuery.isError || gatewayClaimable === null
                ? "Unavailable"
                : gatewayClaimable}
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {!address
                ? "Connect to check what is available to withdraw."
                : "Available to withdraw to your connected wallet."}
            </p>
          </div>
          <div className="border-t border-[var(--panel-border)] py-4 sm:border-l sm:border-t-0 sm:pl-5">
            <div className="text-sm text-[var(--muted)]">Your streams</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {!address
                ? "—"
                : streamsLoading
                ? "Loading…"
                : streamsQuery.isError
                ? "Unavailable"
                : creatorStreams.length}
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {!address
                ? "Connect a wallet to manage streams."
                : `${
                    creatorStreams.filter((stream) => stream.status === "live")
                      .length
                  } live`}
            </p>
          </div>
        </section>

        <section className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Your streams
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Manage published streams and their viewing rates.
              </p>
            </div>
            <button
              type="button"
              disabled={!address}
              onClick={() => {
                setShowCreateForm(true);
              }}
              className="min-h-10 rounded-sm border border-[var(--panel-border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--brand-hover)] disabled:opacity-50"
            >
              New stream
            </button>
          </div>
          {!address ? (
            <p className="border-t border-[var(--panel-border)] py-5 text-sm text-[var(--muted)]">
              Connect a wallet to load and manage your streams.
            </p>
          ) : streamsLoading ? (
            <div
              className="space-y-3 border-t border-[var(--panel-border)] py-5"
              aria-label="Loading streams"
            >
              <div className="h-5 w-1/3 animate-pulse rounded bg-[var(--surface-raised)]" />
              <div className="h-12 animate-pulse rounded bg-[var(--surface-raised)]" />
            </div>
          ) : streamsQuery.isError ? (
            <p className="border-t border-[var(--panel-border)] py-5 text-sm text-[var(--muted)]">
              Streams are unavailable until the request succeeds. Use Retry
              above.
            </p>
          ) : creatorStreams.length ? (
            <div className="overflow-x-auto border-t border-[var(--panel-border)]">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Stream</th>
                    <th className="py-3 pr-4 font-medium">Category</th>
                    <th className="py-3 pr-4 font-medium">Price per minute</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 font-medium">Page</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCreatorStreams.map((stream) => {
                    const watchPath = `/watch/${encodeURIComponent(stream.id)}`;
                    return (
                      <tr
                        key={stream.id}
                        className="border-t border-[var(--panel-border)]"
                      >
                        <td className="py-3 pr-4 font-medium text-[var(--text)]">
                          {stream.title}
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted)]">
                          {stream.category}
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-[var(--text)]">
                          ${stream.ratePerMinute.toFixed(3)} USDC
                        </td>
                        <td className="py-3 pr-4 capitalize text-[var(--muted)]">
                          {stream.status}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              className="text-[var(--brand)] hover:text-[var(--brand-hover)]"
                              href={watchPath}
                            >
                              Open
                            </Link>
                            <button
                              type="button"
                              aria-label={`Copy link for ${stream.title}`}
                              title="Copy link"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    `${window.location.origin}${watchPath}`
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ListPagination
                label="streams"
                page={activeStreamsPage}
                pageCount={streamPageCount}
                onPageChange={setStreamsPage}
              />
            </div>
          ) : (
            <p className="border-t border-[var(--panel-border)] py-5 text-sm text-[var(--muted)]">
              No streams yet. Create one to publish a publicly accessible
              playback URL.
            </p>
          )}
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Recent earnings
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={
                  !address ||
                  !walletClient ||
                  withdrawalMutation.isPending ||
                  gatewayBalance === null ||
                  Number(gatewayBalance) <= 0 ||
                  balancesQuery.isError
                }
                onClick={handleWithdraw}
                className="min-h-10 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {withdrawalMutation.isPending
                  ? "Check your wallet…"
                  : "Withdraw Earnings"}
              </button>
            </div>
          </div>
          {summaryQuery.isPending && address ? (
            <div
              className="space-y-3 border-t border-[var(--panel-border)] py-4"
              aria-label="Loading earnings"
            >
              <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-raised)]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--surface-raised)]" />
            </div>
          ) : summaryQuery.isError ? null : !address ? (
            <p className="border-t border-[var(--panel-border)] py-5 text-sm text-[var(--muted)]">
              Connect a wallet to view earnings activity and available
              withdrawals.
            </p>
          ) : summary.receipts.length ? (
            <div className="overflow-x-auto border-t border-[var(--panel-border)]">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs text-[var(--muted)]">
                  <tr>
                    <th className="w-[55%] py-3 pr-4 font-medium">Stream</th>
                    <th className="w-[25%] py-3 pr-4 font-medium">Date</th>
                    <th className="w-[15%] py-3 text-right font-medium">
                      Earnings
                    </th>
                    <th className="py-3 pl-4 text-right font-medium">
                      <span className="sr-only">Arc explorer</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReceipts.map((payment, index) => {
                    const paidStream = streams.find(
                      (stream) => stream.id === payment.streamId
                    );
                    const transactionHash =
                      receiptTransactionQueries[index]?.data?.transactionHash ??
                      payment.transactionHash ??
                      null;
                    const explorerUrl = payment.network
                      ? ARC_EXPLORER_URLS[payment.network]
                      : undefined;
                    const transactionUrl =
                      explorerUrl &&
                      transactionHash &&
                      /^0x[a-fA-F0-9]{64}$/.test(transactionHash)
                        ? `${explorerUrl}/tx/${transactionHash}`
                        : null;
                    return (
                      <tr
                        key={payment.receiptId}
                        className="border-t border-[var(--panel-border)]"
                      >
                        <td className="py-3 pr-4 font-medium text-[var(--text)]">
                          {paidStream?.title ?? "Stream payment"}
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted)]">
                          <time dateTime={payment.createdAt}>
                            {format(
                              new Date(payment.createdAt),
                              "MMM d, yyyy, h:mm a"
                            )}
                          </time>
                        </td>
                        <td className="py-3 text-right font-medium tabular-nums text-[var(--text)]">
                          ${Number(payment.charge).toFixed(3)} USDC
                        </td>
                        <td className="py-3 pl-4 text-right">
                          {transactionUrl ? (
                            <Link
                              href={transactionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="View transaction on Arc explorer"
                              title="View transaction on Arc explorer"
                              className="inline-flex size-9 items-center justify-center rounded-sm text-[var(--muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
                            >
                              <ExternalLink size={16} aria-hidden="true" />
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border-t border-[var(--panel-border)] py-5 text-sm text-[var(--muted)]">
              No earnings recorded yet.
            </p>
          )}
          {address && !summaryQuery.isPending && !summaryQuery.isError && (
            <ListPagination
              label="earnings"
              page={activeEarningsPage}
              pageCount={earningsPageCount}
              onPageChange={setEarningsPage}
            />
          )}
        </section>
      </div>
      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4"
          onClick={() => setShowCreateForm(false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-stream-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleCreateStream}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !createStreamMutation.isPending)
                setShowCreateForm(false);
            }}
            className="my-auto w-full max-w-xl rounded-sm border border-[var(--panel-border)] bg-[var(--surface)] p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="create-stream-title"
                  className="text-lg font-semibold text-[var(--text)]"
                >
                  Create stream
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Add a public video link. Prawr does not host video.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close create stream form"
                onClick={() => setShowCreateForm(false)}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-[var(--muted)] hover:text-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-[var(--muted)]">
                Title
                <input
                  autoFocus
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-sm border border-[var(--panel-border)] bg-[var(--background)] px-3 py-2 text-[var(--text)]"
                />
              </label>
              <label className="text-sm text-[var(--muted)]">
                Category
                <input
                  required
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-sm border border-[var(--panel-border)] bg-[var(--background)] px-3 py-2 text-[var(--text)]"
                />
              </label>
              <label className="text-sm text-[var(--muted)] sm:col-span-2">
                Public playback URL (Twitch, YouTube, HLS, MP4, or WebM)
                <input
                  required
                  type="url"
                  pattern="https?://.+"
                  value={playbackUrl}
                  onChange={(event) => setPlaybackUrl(event.target.value)}
                  placeholder="https://media.example.com/live.m3u8 or a Twitch/YouTube link"
                  className="mt-1 min-h-10 w-full rounded-sm border border-[var(--panel-border)] bg-[var(--background)] px-3 py-2 text-[var(--text)]"
                />
              </label>
              <label className="text-sm text-[var(--muted)]">
                Price per minute (USDC)
                <input
                  required
                  type="number"
                  min={MIN_STREAM_RATE_PER_MINUTE}
                  max={MAX_STREAM_RATE_PER_MINUTE}
                  step="0.001"
                  value={ratePerMinute}
                  onChange={(event) => setRatePerMinute(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-sm border border-[var(--panel-border)] bg-[var(--background)] px-3 py-2 text-[var(--text)]"
                />
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  $0.001 to $100.00 USDC per minute
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="min-h-10 rounded-sm border border-[var(--panel-border)] px-4 py-2 text-sm text-[var(--text)] transition hover:border-[var(--brand-hover)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createStreamMutation.isPending || !address}
                className="min-h-10 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#1c1f1e] transition hover:bg-[var(--brand-hover)] disabled:opacity-50"
              >
                {createStreamMutation.isPending
                  ? "Creating..."
                  : "Create stream"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
