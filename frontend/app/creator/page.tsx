"use client";

import { ConnectKitButton } from "connectkit";
import { useEffect, useState } from "react";
import { useAccount, useSignTypedData, useWalletClient } from "wagmi";
import {
  createStream,
  getCreatorPayoutSummary,
  listStreams,
  type CreatorPayoutSummary,
  type StreamRecord,
} from "../lib/prawr-api";
import {
  getGatewayBalances,
  withdrawFromGateway,
  type GatewayWithdrawalSigner,
} from "../lib/gateway-client";

const fallbackSummary: CreatorPayoutSummary = {
  creatorWallet: "",
  totalReceived: "0",
  receiptCount: 0,
  receipts: [],
  pendingClaims: [],
};

export default function CreatorDashboardPage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();
  const [summary, setSummary] = useState<CreatorPayoutSummary>(fallbackSummary);
  const [streams, setStreams] = useState<StreamRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [gatewayBalance, setGatewayBalance] = useState<string>("0");
  const [walletBalance, setWalletBalance] = useState<string>("0");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [ratePerMinute, setRatePerMinute] = useState("0.02");

  const creatorStreams = address
    ? streams.filter(
        (stream) => stream.creatorWallet.toLowerCase() === address.toLowerCase()
      )
    : [];

  useEffect(() => {
    if (!address) {
      setSummary(fallbackSummary);
      setError(null);
      setGatewayBalance("0");
      setWalletBalance("0");
      return;
    }

    let active = true;
    let initialLoad = true;
    let requestPending = false;
    const loadSummary = async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const data = await getCreatorPayoutSummary(address);
        if (active) setSummary(data);
      } catch (loadError) {
        console.error("Failed to load creator settlement summary", loadError);
        if (active && initialLoad) {
          setError("Unable to load settlement summary");
          setSummary(fallbackSummary);
        }
      } finally {
        requestPending = false;
        if (active && initialLoad) {
          setLoading(false);
          initialLoad = false;
        }
      }
    };

    setLoading(true);
    setError(null);
    void loadSummary();
    const intervalId = window.setInterval(() => void loadSummary(), 5_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadSummary();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [address]);

  useEffect(() => {
    if (!address) return;

    let active = true;
    const refreshBalances = async () => {
      try {
        const balances = await getGatewayBalances(address);
        if (!active) return;
        setGatewayBalance(balances.gateway.formattedAvailable || "0");
        if (balances.wallet.formatted !== null) {
          setWalletBalance(Number(balances.wallet.formatted).toFixed(2));
        }
      } catch (balanceError) {
        console.error("Failed to refresh creator balances", balanceError);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshBalances();
    };

    void refreshBalances();
    const intervalId = window.setInterval(() => void refreshBalances(), 15_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [address]);

  useEffect(() => {
    if (!address) {
      setStreams([]);
      return;
    }
    let active = true;
    setStreamsLoading(true);
    listStreams()
      .then((records) => {
        if (active) setStreams(records);
      })
      .catch((loadError) => {
        console.error("Failed to load creator streams", loadError);
        if (active) setError("Unable to load creator streams");
      })
      .finally(() => {
        if (active) setStreamsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [address]);

  const handleCreateStream = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!address) {
      setCreateError("Connect your wallet before creating a stream.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createStream({
        title,
        creatorId: address,
        creatorWallet: address,
        category,
        playbackUrl,
        ratePerMinute: Number(ratePerMinute),
      });
      setStreams((current) => [created, ...current]);
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
    } finally {
      setCreating(false);
    }
  };

  const gatewayClaimable = `$${Number(gatewayBalance).toFixed(2)}`;

  const settlementIndicator = loading
    ? "Loading payouts..."
    : withdrawMessage ?? error ?? "Settlement synced";

  const handleWithdraw = async () => {
    if (!address || !walletClient || Number(gatewayBalance) <= 0) {
      return;
    }

    setWithdrawing(true);
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
      const result = await withdrawFromGateway(
        gatewayBalance,
        address,
        walletClient,
        gatewaySigner
      );

      setWithdrawMessage(
        `Withdrawal of $${result.amount} initiated: ${result.mintTxHash?.slice(
          0,
          12
        )}`
      );

      // Refresh balances after withdrawal
      const balances = await getGatewayBalances(address);
      setGatewayBalance(balances.gateway.formattedAvailable || "0");
      if (balances.wallet.formatted !== null) {
        setWalletBalance(Number(balances.wallet.formatted).toFixed(2));
      }
    } catch (withdrawError) {
      console.error("Withdrawal failed", withdrawError);
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Withdrawal request failed"
      );
    } finally {
      setWithdrawing(false);
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
                withdrawing ||
                Number(gatewayBalance) <= 0
              }
              onClick={handleWithdraw}
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawing ? "Withdrawing..." : "Withdraw from Gateway"}
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
                Video URL (MP4 or WebM)
                <input
                  required
                  type="url"
                  pattern="https?://.+"
                  value={playbackUrl}
                  onChange={(event) => setPlaybackUrl(event.target.value)}
                  placeholder="https://media.example.com/video.mp4"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-slate-300">
                Price per minute (USDC)
                <input
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={ratePerMinute}
                  onChange={(event) => setRatePerMinute(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                />
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
                disabled={creating || !address}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create stream"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
