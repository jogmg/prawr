"use client";

import { ConnectKitButton } from "connectkit";
import { useEffect, useState } from "react";
import { useAccount, useSignTypedData, useWalletClient } from "wagmi";
import {
  getCreatorPayoutSummary,
  type CreatorPayoutSummary,
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
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [gatewayBalance, setGatewayBalance] = useState<string>("0");
  const [walletBalance, setWalletBalance] = useState<string>("0");

  useEffect(() => {
    if (!address) {
      setSummary(fallbackSummary);
      setError(null);
      setGatewayBalance("0");
      setWalletBalance("0");
      return;
    }

    const loadSummary = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getCreatorPayoutSummary(address);
        setSummary(data);

        // Also fetch Gateway balances
        const balances = await getGatewayBalances(address);
        setGatewayBalance(
          Number(balances.gateway.formattedAvailable || 0).toFixed(2)
        );
        setWalletBalance(Number(balances.wallet.formatted || 0).toFixed(2));
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

  const gatewayClaimable = `$${gatewayBalance}`;

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
        `Withdrawal initiated: ${result.mintTxHash?.slice(0, 12)}`
      );

      // Refresh balances after withdrawal
      const balances = await getGatewayBalances(address);
      setGatewayBalance(
        Number(balances.gateway.formattedAvailable || 0).toFixed(2)
      );
      setWalletBalance(Number(balances.wallet.formatted || 0).toFixed(2));
    } catch (withdrawError) {
      console.error("Withdrawal failed", withdrawError);
      setError("Withdrawal request failed");
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
            ["Gateway Balance", gatewayClaimable],
            ["Wallet Balance", `$${walletBalance}`],
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
    </main>
  );
}
