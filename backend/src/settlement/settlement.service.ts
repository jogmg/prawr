import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { recoverMessageAddress } from "viem";
import {
  GatewayReceipt,
  type GatewayReceiptDocument,
} from "../gateway/gateway-receipt.schema";

export interface CalculateChargeInput {
  ratePerMinute: number;
  secondsWatched: number;
}

export interface CreateReceiptInput {
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  creatorWallet: string;
  charge: string;
  transaction?: string;
  network?: string;
}

export interface ReceiptRecord {
  receiptId: string;
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  creatorWallet: string;
  charge: string;
  transaction?: string;
  network?: string;
  createdAt: string;
}

export interface SessionAuthorizationInput {
  streamId: string;
  viewerWallet: string;
  authorizationHash: string;
  issuedAt?: string;
}

export interface PayoutClaimRecord {
  claimId: string;
  creatorWallet: string;
  amount: string;
  status: "pending" | "claimed";
  createdAt: string;
}

export interface GatewayBalanceResponse {
  wallet: { balance: string; formatted: string };
  gateway: {
    available: string;
    formatted: string;
    pending: string;
    formattedPending: string;
  };
}

export interface GatewayWithdrawResponse {
  success: boolean;
  mintTxHash?: string;
  amount?: string;
}

/**
 * Circle Gateway balance shape returned by the SDK's getBalances() (bigint values)
 * or a serialized version of it (string values).
 */
export interface GatewaySdkBalances {
  wallet: { balance: bigint | string; formatted: string };
  gateway: {
    total: bigint | string;
    available: bigint | string;
    formattedTotal?: string;
    formattedAvailable?: string;
  };
}

@Injectable()
export class SettlementService {
  private readonly receipts: ReceiptRecord[] = [];
  private readonly payoutClaims: PayoutClaimRecord[] = [];

  constructor(
    @InjectModel(GatewayReceipt.name)
    private readonly gatewayReceiptModel?: Model<GatewayReceiptDocument>,
    private readonly configService?: ConfigService
  ) {}

  validateWalletAddress(address: string, label: string): void {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`Invalid ${label} wallet address`);
    }
  }

  buildAuthorizationMessage({
    streamId,
    viewerWallet,
    issuedAt,
  }: {
    streamId: string;
    viewerWallet: string;
    issuedAt?: string;
  }): string {
    const timestamp = issuedAt
      ? new Date(issuedAt).toISOString()
      : new Date().toISOString();

    return [
      "Prawr session authorization",
      `Stream: ${streamId}`,
      `Viewer: ${viewerWallet}`,
      `Issued at: ${timestamp}`,
    ].join("\n");
  }

  async verifySessionAuthorization({
    streamId,
    viewerWallet,
    authorizationHash,
    issuedAt,
  }: SessionAuthorizationInput): Promise<boolean> {
    if (!streamId?.trim()) {
      throw new Error("streamId is required");
    }

    this.validateWalletAddress(viewerWallet, "viewer");

    if (!authorizationHash?.trim()) {
      throw new Error("authorizationHash is required");
    }

    const normalizedIssuedAt = issuedAt ?? new Date().toISOString();
    const message = this.buildAuthorizationMessage({
      streamId,
      viewerWallet,
      issuedAt: normalizedIssuedAt,
    });

    try {
      const recoveredAddress = await recoverMessageAddress({
        message,
        signature: authorizationHash as `0x${string}`,
      });

      if (recoveredAddress.toLowerCase() !== viewerWallet.toLowerCase()) {
        throw new Error(
          "Session authorization signature does not match the viewer wallet"
        );
      }

      return true;
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : "Session authorization signature is invalid";
      throw new Error(messageText);
    }
  }

  calculateCharge({
    ratePerMinute,
    secondsWatched,
  }: CalculateChargeInput): string {
    if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
      throw new Error("ratePerMinute must be a positive number");
    }

    if (!Number.isFinite(secondsWatched) || secondsWatched < 0) {
      throw new Error("secondsWatched must be a non-negative number");
    }

    const minutes = secondsWatched / 60;
    const chargeValue = ratePerMinute * minutes;

    return (
      Number(chargeValue).toFixed(6).replace(/0+$/, "").replace(/\.$/, "") ||
      "0"
    );
  }

  createReceipt({
    sessionId,
    streamId,
    viewerWallet,
    creatorWallet,
    charge,
    transaction,
    network,
  }: CreateReceiptInput): ReceiptRecord {
    if (!sessionId || !streamId) {
      throw new Error("sessionId and streamId are required");
    }

    this.validateWalletAddress(viewerWallet, "viewer");
    this.validateWalletAddress(creatorWallet, "creator");

    const amount = Number(charge);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("charge must be a positive number");
    }

    const receipt: ReceiptRecord = {
      receiptId: `receipt_${Date.now()}_${Math.random()
        .toString(16)
        .slice(2, 10)}`,
      sessionId,
      streamId,
      viewerWallet,
      creatorWallet,
      charge: Number(amount).toFixed(6).replace(/0+$/, "").replace(/\.$/, ""),
      transaction,
      network,
      createdAt: new Date().toISOString(),
    };

    this.receipts.push(receipt);

    return { ...receipt };
  }

  getReceipts(): ReceiptRecord[] {
    return this.receipts.map((receipt) => ({ ...receipt }));
  }

  createPayoutClaim(creatorWallet: string, amount: string): PayoutClaimRecord {
    this.validateWalletAddress(creatorWallet, "creator");

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new Error("amount must be a positive decimal string");
    }

    const normalizedAmount = Number(amountValue)
      .toFixed(6)
      .replace(/0+$/, "")
      .replace(/\.$/, "")
      .replace(/^0+(?=\d)/, "");

    const claim: PayoutClaimRecord = {
      claimId: `claim_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
      creatorWallet,
      amount: normalizedAmount || "0",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.payoutClaims.push(claim);

    return { ...claim };
  }

  finalizePayoutClaim(
    creatorWallet: string,
    claimId: string
  ): PayoutClaimRecord {
    this.validateWalletAddress(creatorWallet, "creator");

    const claimIndex = this.payoutClaims.findIndex(
      (claim) =>
        claim.claimId === claimId &&
        claim.creatorWallet.toLowerCase() === creatorWallet.toLowerCase()
    );

    if (claimIndex === -1) {
      throw new Error("Payout claim not found");
    }

    const claim = this.payoutClaims[claimIndex];
    if (claim.status === "claimed") {
      return { ...claim };
    }

    this.payoutClaims[claimIndex] = {
      ...claim,
      status: "claimed",
    };

    return { ...this.payoutClaims[claimIndex] };
  }

  async getCreatorPayoutSummary(creatorWallet: string): Promise<{
    creatorWallet: string;
    totalReceived: string;
    receiptCount: number;
    receipts: ReceiptRecord[];
    pendingClaims: PayoutClaimRecord[];
  }> {
    this.validateWalletAddress(creatorWallet, "creator");

    const persistedReceipts = this.gatewayReceiptModel
      ? await this.gatewayReceiptModel
          .find({
            creatorWallet: { $regex: `^${creatorWallet}$`, $options: "i" },
          })
          .sort({ createdAt: 1 })
          .exec()
      : undefined;
    const receipts = persistedReceipts
      ? persistedReceipts.map((receipt) => ({
          receiptId: receipt.receiptId,
          sessionId: receipt.sessionId,
          streamId: receipt.streamId,
          viewerWallet: receipt.viewerWallet,
          creatorWallet: receipt.creatorWallet,
          charge: receipt.amount,
          transaction: receipt.transaction,
          network: receipt.network,
          createdAt: new Date(
            receipt.get("createdAt") as string | Date
          ).toISOString(),
        }))
      : this.receipts
          .filter(
            (receipt) =>
              receipt.creatorWallet.toLowerCase() ===
              creatorWallet.toLowerCase()
          )
          .map((receipt) => ({ ...receipt }));

    const pendingClaims = this.payoutClaims
      .filter(
        (claim) =>
          claim.creatorWallet.toLowerCase() === creatorWallet.toLowerCase()
      )
      .map((claim) => ({ ...claim }));

    const totalReceived = receipts.reduce((sum, receipt) => {
      return sum + Number(receipt.charge || "0");
    }, 0);

    return {
      creatorWallet,
      totalReceived:
        Number(totalReceived)
          .toFixed(6)
          .replace(/0+$/, "")
          .replace(/\.$/, "")
          .replace(/^0+(?=\d)/, "") || "0",
      receiptCount: receipts.length,
      receipts,
      pendingClaims,
    };
  }

  /**
   * Normalize the GatewayClient.getBalances() result (bigint or string fields)
   * into the GatewayBalanceResponse shape consumed by the frontend.
   */
  private normalizeSdkBalances(
    balances: GatewaySdkBalances
  ): GatewayBalanceResponse {
    const toStr = (value: bigint | string | undefined): string =>
      value === undefined
        ? "0"
        : typeof value === "bigint"
        ? value.toString()
        : String(value);

    return {
      wallet: {
        balance: toStr(balances.wallet?.balance),
        formatted: balances.wallet?.formatted ?? "0",
      },
      gateway: {
        available: toStr(balances.gateway?.available),
        formatted: balances.gateway?.formattedAvailable ?? "0",
        pending: "0",
        formattedPending: "0",
      },
    };
  }

  async getGatewayBalances(address: string): Promise<GatewayBalanceResponse> {
    this.validateWalletAddress(address, "creator");

    const apiKey = this.configService?.get<string>("GATEWAY_API_KEY");
    const facilitatorUrl = this.configService
      ?.get<string>(
        "GATEWAY_FACILITATOR_URL",
        "https://gateway-api-testnet.circle.com"
      )
      .replace(/\/$/, "");

    try {
      // Circle Gateway balances endpoint (same shape the SDK's
      // GatewayClient.getBalances() uses under the hood).
      const response = await fetch(`${facilitatorUrl}/v1/balances`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          token: "USDC",
          sources: [
            {
              depositor: address,
              // Arc Testnet Gateway domain (GATEWAY_DOMAINS.arcTestnet)
              domain: 26,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Gateway API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        balances?: Array<{
          balance?: string;
          withdrawing?: string;
          withdrawable?: string;
        }>;
      };

      const entry = data.balances?.[0];
      if (!entry) {
        // No Gateway balance yet for this depositor — return zeros.
        return {
          wallet: { balance: "0", formatted: "0" },
          gateway: {
            available: "0",
            formatted: "0",
            pending: "0",
            formattedPending: "0",
          },
        };
      }

      return {
        wallet: { balance: "0", formatted: "0" },
        gateway: {
          available: entry.balance ?? "0",
          formatted: entry.balance ?? "0",
          pending: entry.withdrawable ?? "0",
          formattedPending: entry.withdrawable ?? "0",
        },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load Gateway balances: ${detail}`);
    }
  }

  /**
   * Withdraw from Gateway. The actual withdrawal is signed client-side by the
   * creator's wallet via GatewayClient.withdraw() — this endpoint only
   * validates the request and records the payout claim for accounting.
   */
  async withdrawFromGateway(
    creatorWallet: string,
    amount: string
  ): Promise<GatewayWithdrawResponse> {
    this.validateWalletAddress(creatorWallet, "creator");

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new Error("amount must be a positive decimal string");
    }

    this.createPayoutClaim(creatorWallet, amount);

    return { success: true, amount };
  }
}
