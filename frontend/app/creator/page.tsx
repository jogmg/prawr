"use client";

import { ConnectKitButton } from "connectkit";
import { useState } from "react";
import { useAccount, useSignTypedData, useWalletClient } from "wagmi";
import type { CreatorPayoutSummary } from "../lib/prawr-api";
import {
  useCreatorSummary,
  useWalletGatewayBalances,
} from "../lib/hooks/use-creator-queries";
import { useCreateStream, useStreams } from "../lib/hooks/use-stream-queries";
import type { GatewayWithdrawalSigner } from "../lib/gateway-client";
import { useGatewayWithdrawal } from "../lib/hooks/use-gateway-mutations";

const fallbackSummary: CreatorPayoutSummary = {
  creatorWallet: "",
  totalReceived: "0",
  receiptCount: 0,
  receipts: [],
  pendingClaims: [],
};
const MIN_STREAM_RATE_PER_MINUTE = 0.001;
const MAX_STREAM_RATE_PER_MINUTE = 100;

export default function CreatorDashboardPage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();
  const summaryQuery = useCreatorSummary(address);
  const streamsQuery = useStreams(Boolean(address));
  const balancesQuery = useWalletGatewayBalances(address);
  const createStreamMutation = useCreateStream();
  const withdrawalMutation = useGatewayWithdrawal();
  const summary = summaryQuery.data ?? fallbackSummary;
  const streams = streamsQuery.data ?? [];
  const balances = balancesQuery.data;
  const loading = Boolean(address) && summaryQuery.isPending;
  const streamsLoading = Boolean(address) && streamsQuery.isPending;
  const gatewayBalance = balances?.gateway.formattedAvailable ?? "0";
  const walletBalance =
    balances?.wallet.formatted == null
      ? "0"
      : Number(balances.wallet.formatted).toFixed(2);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [ratePerMinute, setRatePerMinute] = useState("0.02");

  const creatorStreams = address
    ? streams.filter(
        (stream) => stream.creatorWallet.toLowerCase() === address.toLowerCase()
      )
    : [];

  const handleCreateStream = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!address) {
      setCreateError("Connect your wallet before creating a stream.");
      return;
    }
    setCreateError(null);
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
    } catch (createFailure) {
      setCreateError(
        createFailure instanceof Error
          ? createFailure.message
          : "Unable to create stream."
      );
    }
  };

  const gatewayClaimable = `$${Number(gatewayBalance).toFixed(2)}`;

  const settlementIndicator = loading
    ? "Loading payouts..."
    : withdrawMessage ??
      error ??
      (summaryQuery.isError
        ? "Unable to load settlement summary"
        : "Settlement synced");

  const handleWithdraw = async () => {
    if (!address || !walletClient || Number(gatewayBalance) <= 0) {
      return;
    }

    setError(null);
    setWithdrawMessage(null);

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
      const result = await withdrawalMutation.mutateAsync({
        amount: gatewayBalance,
        recipient: address,
        walletClient,
        signer: gatewaySigner,
      });

      setWithdrawMessage(
        `Withdrawal of $${result.amount} initiated: ${result.mintTxHash?.slice(
          0,
          12
        )}`
      );
    } catch (withdrawError) {
      console.error("Withdrawal failed", withdrawError);
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Withdrawal request failed"
      );
    }
  };

  return (
    <main className="min-h-screen px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-brand-100">
              Creator dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">Prawr Studio</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-slate-600 px-3 py-2 text-sm text-slate-200">
              <ConnectKitButton />
            </div>
            <button
              type="button"
              disabled={!address}
              onClick={() => {
                setCreateError(null);
                setShowCreateForm(true);
              }}
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Create Stream
            </button>
          </div>
        </header>

        {streamsQuery.isError && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            <span>
              Unable to load creator streams: {streamsQuery.error.message}
            </span>
            <button
              type="button"
              onClick={() => void streamsQuery.refetch()}
              disabled={streamsQuery.isFetching}
              className="font-semibold text-white underline underline-offset-2 disabled:opacity-60"
            >
              {streamsQuery.isFetching ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}
        {balancesQuery.isError && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            <span>
              Unable to refresh wallet balances: {balancesQuery.error.message}
            </span>
            <button
              type="button"
              onClick={() => void balancesQuery.refetch()}
              disabled={balancesQuery.isFetching}
              className="font-semibold text-white underline underline-offset-2 disabled:opacity-60"
            >
              {balancesQuery.isFetching ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          {[
            [
              "Your streams",
              streamsLoading ? "..." : String(creatorStreams.length),
            ],
            [
              "Live streams",
              String(
                creatorStreams.filter((stream) => stream.status === "live")
                  .length
              ),
            ],
            ["Paid receipts", String(summary.receiptCount)],
            [
              "Lifetime receipts",
              `$${Number(summary.totalReceived || 0).toFixed(2)}`,
            ],
            ["Gateway Balance", gatewayClaimable],
            ["Wallet Balance", `$${walletBalance}`],
          ].map(([label, value]) => (
            <div key={label} className="card p-4">
              <div className="text-sm text-slate-400">{label}</div>
              <div className="mt-3 text-2xl font-bold text-white">{value}</div>
            </div>
          ))}
        </section>

        <section className="card mb-8 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-700 p-5">
            <div>
              <h2 className="text-xl font-semibold text-white">Your streams</h2>
              <p className="mt-1 text-sm text-slate-400">
                {address
                  ? `${creatorStreams.length} stream${
                      creatorStreams.length === 1 ? "" : "s"
                    }`
                  : "Connect a wallet to manage streams."}
              </p>
            </div>
            <button
              type="button"
              disabled={!address}
              onClick={() => setShowCreateForm(true)}
              className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50"
            >
              New stream
            </button>
          </div>
          {streamsLoading ? (
            <p className="p-6 text-sm text-slate-400">Loading streams...</p>
          ) : creatorStreams.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="p-4">Stream</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Rate</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Playback</th>
                  </tr>
                </thead>
                <tbody>
                  {creatorStreams.map((stream) => (
                    <tr key={stream.id} className="border-t border-slate-700">
                      <td className="p-4 font-medium text-white">
                        {stream.title}
                      </td>
                      <td className="p-4">{stream.category}</td>
                      <td className="p-4">
                        ${stream.ratePerMinute.toFixed(3)}/min
                      </td>
                      <td className="p-4 capitalize">{stream.status}</td>
                      <td className="p-4">
                        <a
                          className="text-brand-100 hover:text-white"
                          href={`/watch/${encodeURIComponent(stream.id)}`}
                        >
                          Open watch page
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-sm text-slate-400">
              No streams yet. Create one with a directly playable video URL.
            </p>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-700 p-5">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Settlement activity
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {settlementIndicator}
              </p>
            </div>
            <button
              type="button"
              disabled={
                !address ||
                !walletClient ||
                withdrawalMutation.isPending ||
                Number(gatewayBalance) <= 0
              }
              onClick={handleWithdraw}
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawalMutation.isPending
                ? "Withdrawing..."
                : "Withdraw from Gateway"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <th className="p-4">Receipt</th>
                  <th className="p-4">Session</th>
                  <th className="p-4">Viewer</th>
                  <th className="p-4">Charge</th>
                  <th className="p-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {summary.receipts.length > 0 ? (
                  summary.receipts.map((receipt) => (
                    <tr
                      key={receipt.receiptId}
                      className="border-t border-slate-700"
                    >
                      <td className="p-4 font-medium text-white">
                        {receipt.receiptId.slice(0, 12)}
                      </td>
                      <td className="p-4">{receipt.sessionId.slice(0, 12)}</td>
                      <td className="p-4">
                        {receipt.viewerWallet.slice(0, 6)}...
                        {receipt.viewerWallet.slice(-4)}
                      </td>
                      <td className="p-4 text-brand-100">
                        ${Number(receipt.charge).toFixed(2)}
                      </td>
                      <td className="p-4">
                        {new Date(receipt.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      {address
                        ? "No settlement receipts yet for this wallet."
                        : "Connect a wallet to view claimable settlement data."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleCreateStream}
            className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Create stream
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  The media URL must be publicly reachable.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close create stream form"
                onClick={() => setShowCreateForm(false)}
                className="px-2 text-xl text-slate-400 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Title
                <input
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-slate-300">
                Category
                <input
                  required
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-slate-300 sm:col-span-2">
                Stream URL (Twitch, YouTube, HLS, MP4, or WebM)
                <input
                  required
                  type="url"
                  pattern="https?://.+"
                  value={playbackUrl}
                  onChange={(event) => setPlaybackUrl(event.target.value)}
                  placeholder="https://media.example.com/live.m3u8 or a Twitch/YouTube link"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-slate-300">
                Price per minute (USDC)
                <input
                  required
                  type="number"
                  min={MIN_STREAM_RATE_PER_MINUTE}
                  max={MAX_STREAM_RATE_PER_MINUTE}
                  step="0.001"
                  value={ratePerMinute}
                  onChange={(event) => setRatePerMinute(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                />
                <span className="mt-1 block text-xs text-slate-400">
                  $0.001 to $100.00 USDC per minute
                </span>
              </label>
            </div>
            {createError && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {createError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createStreamMutation.isPending || !address}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
