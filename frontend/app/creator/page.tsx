"use client";

import { ConnectKitButton } from "connectkit";
import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import {
  PRAWR_SETTLEMENT_ABI,
  PRAWR_SETTLEMENT_ADDRESS,
  claimPayout,
  finalizePayoutClaim,
  getCreatorPayoutSummary,
  type CreatorPayoutSummary,
} from "../lib/prawr-api";

const fallbackSummary: CreatorPayoutSummary = {
  creatorWallet: "",
  totalReceived: "0",
  receiptCount: 0,
  receipts: [],
  pendingClaims: [],
};

export default function CreatorDashboardPage() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [summary, setSummary] = useState<CreatorPayoutSummary>(fallbackSummary);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setSummary(fallbackSummary);
      setError(null);
      return;
    }

    const loadSummary = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getCreatorPayoutSummary(address);
        setSummary(data);
      } catch (loadError) {
        console.error("Failed to load creator settlement summary", loadError);
        setError("Unable to load settlement summary");
        setSummary(fallbackSummary);
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, [address]);

  const claimable = summary.totalReceived
    ? `$${Number(summary.totalReceived).toFixed(2)}`
    : "$0.00";
  const settlementIndicator = !PRAWR_SETTLEMENT_ADDRESS
    ? "Settlement contract not configured"
    : loading
    ? "Loading payouts..."
    : claimMessage ?? error ?? "Settlement synced";

  const handleWithdraw = async () => {
    if (
      !address ||
      !PRAWR_SETTLEMENT_ADDRESS ||
      !summary.totalReceived ||
      Number(summary.totalReceived) <= 0
    ) {
      return;
    }

    setClaiming(true);
    setError(null);
    setClaimMessage(null);

    try {
      const queuedClaim = await claimPayout({
        creatorWallet: address,
        amount: summary.totalReceived,
      });

      const claimAmount = parseUnits(summary.totalReceived, 18);

      await writeContractAsync({
        abi: PRAWR_SETTLEMENT_ABI,
        address: PRAWR_SETTLEMENT_ADDRESS,
        functionName: "claim",
        args: [address, claimAmount],
      });

      const finalizedClaim = await finalizePayoutClaim({
        creatorWallet: address,
        claimId: queuedClaim.claimId,
      });

      setClaimMessage(`Claim executed: ${finalizedClaim.claimId.slice(0, 12)}`);
      setSummary((current) => ({
        ...current,
        pendingClaims: [
          ...(current.pendingClaims ?? []),
          {
            claimId: finalizedClaim.claimId,
            creatorWallet: finalizedClaim.creatorWallet,
            amount: finalizedClaim.amount,
            status: finalizedClaim.status,
            createdAt: finalizedClaim.createdAt,
          },
        ],
        totalReceived: "0",
      }));
    } catch (claimError) {
      console.error("Withdrawal claim failed", claimError);
      setError("Withdrawal request failed");
    } finally {
      setClaiming(false);
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
            <button className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              + Create Stream
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          {[
            ["Active streams", String(Math.max(summary.receiptCount, 1))],
            ["Current viewers", "1.4k"],
            [
              "Earnings today",
              `$${Number(summary.totalReceived || 0).toFixed(2)}`,
            ],
            ["Claimable", claimable],
          ].map(([label, value]) => (
            <div key={label} className="card p-4">
              <div className="text-sm text-slate-400">{label}</div>
              <div className="mt-3 text-2xl font-bold text-white">{value}</div>
            </div>
          ))}
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
                !PRAWR_SETTLEMENT_ADDRESS ||
                claiming ||
                !summary.totalReceived ||
                Number(summary.totalReceived) <= 0
              }
              onClick={handleWithdraw}
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {claiming ? "Requesting..." : "Withdraw"}
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
    </main>
  );
}
