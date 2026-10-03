import { Injectable } from "@nestjs/common";
import { recoverMessageAddress } from "viem";

export interface CalculateChargeInput {
  ratePerMinute: number;
  secondsWatched: number;
}

export interface ValidateAuthorizationCapInput {
  ratePerMinute: number;
  secondsWatched: number;
  maxCharge: string;
}

export interface CreateReceiptInput {
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  creatorWallet: string;
  charge: string;
}

export interface ReceiptRecord {
  receiptId: string;
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  creatorWallet: string;
  charge: string;
  createdAt: string;
}

export interface SessionAuthorizationInput {
  streamId: string;
  viewerWallet: string;
  maxCharge: string;
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

@Injectable()
export class SettlementService {
  private readonly receipts: ReceiptRecord[] = [];
  private readonly payoutClaims: PayoutClaimRecord[] = [];

  validateWalletAddress(address: string, label: string): void {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`Invalid ${label} wallet address`);
    }
  }

  buildAuthorizationMessage({
    streamId,
    viewerWallet,
    maxCharge,
    issuedAt,
  }: {
    streamId: string;
    viewerWallet: string;
    maxCharge: string;
    issuedAt?: string;
  }): string {
    const timestamp = issuedAt
      ? new Date(issuedAt).toISOString()
      : new Date().toISOString();

    return [
      "Prawr session authorization",
      `Stream: ${streamId}`,
      `Viewer: ${viewerWallet}`,
      `Max charge: ${maxCharge} USDC`,
      `Issued at: ${timestamp}`,
    ].join("\n");
  }

  async verifySessionAuthorization({
    streamId,
    viewerWallet,
    maxCharge,
    authorizationHash,
    issuedAt,
  }: SessionAuthorizationInput): Promise<boolean> {
    if (!streamId?.trim()) {
      throw new Error("streamId is required");
    }

    this.validateWalletAddress(viewerWallet, "viewer");

    if (!maxCharge || Number(maxCharge) <= 0) {
      throw new Error("maxCharge must be a positive decimal string");
    }

    if (!authorizationHash?.trim()) {
      throw new Error("authorizationHash is required");
    }

    const normalizedIssuedAt = issuedAt ?? new Date().toISOString();
    const message = this.buildAuthorizationMessage({
      streamId,
      viewerWallet,
      maxCharge,
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

  validateAuthorizationCap({
    ratePerMinute,
    secondsWatched,
    maxCharge,
  }: ValidateAuthorizationCapInput): string {
    const charge = this.calculateCharge({ ratePerMinute, secondsWatched });
    const maxChargeValue = Number(maxCharge);

    if (!Number.isFinite(maxChargeValue) || maxChargeValue <= 0) {
      throw new Error("maxCharge must be a positive numeric string");
    }

    if (Number(charge) > maxChargeValue) {
      throw new Error("Session charge exceeds the authorization cap");
    }

    return charge;
  }

  createReceipt({
    sessionId,
    streamId,
    viewerWallet,
    creatorWallet,
    charge,
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

  getCreatorPayoutSummary(creatorWallet: string): {
    creatorWallet: string;
    totalReceived: string;
    receiptCount: number;
    receipts: ReceiptRecord[];
    pendingClaims: PayoutClaimRecord[];
  } {
    this.validateWalletAddress(creatorWallet, "creator");

    const receipts = this.receipts
      .filter(
        (receipt) =>
          receipt.creatorWallet.toLowerCase() === creatorWallet.toLowerCase()
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
}
