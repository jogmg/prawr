import {
  generatePrivateKey,
  privateKeyToAccount,
  signMessage,
} from "viem/accounts";
import { SettlementService } from "./settlement.service";

describe("SettlementService", () => {
  it("calculates an Arc-compatible USDC charge from watched seconds", () => {
    const service = new SettlementService();

    const charge = service.calculateCharge({
      ratePerMinute: 0.02,
      secondsWatched: 60,
    });

    expect(charge).toBe("0.02");
  });

  it("rejects a session when the calculated charge exceeds the viewer authorization cap", () => {
    const service = new SettlementService();

    expect(() =>
      service.validateAuthorizationCap({
        ratePerMinute: 0.02,
        secondsWatched: 240,
        maxCharge: "0.03",
      })
    ).toThrow("Session charge exceeds the authorization cap");
  });

  it("rejects invalid wallet addresses before creating a receipt", () => {
    const service = new SettlementService();

    expect(() =>
      service.createReceipt({
        sessionId: "session_123",
        streamId: "stream_123",
        viewerWallet: "not-a-wallet",
        creatorWallet: "0x1111111111111111111111111111111111111111",
        charge: "0.02",
      })
    ).toThrow("Invalid viewer wallet address");
  });

  it("accepts a wallet-signed authorization for a session", async () => {
    const service = new SettlementService();
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const issuedAt = new Date().toISOString();
    const signature = await signMessage({
      privateKey,
      message: service.buildAuthorizationMessage({
        streamId: "stream_123",
        viewerWallet: account.address,
        maxCharge: "0.08",
        issuedAt,
      }),
    });

    await expect(
      service.verifySessionAuthorization({
        streamId: "stream_123",
        viewerWallet: account.address,
        maxCharge: "0.08",
        authorizationHash: signature,
        issuedAt,
      })
    ).resolves.toBe(true);
  });

  it("aggregates claimable creator payouts from receipt history", () => {
    const service = new SettlementService();
    const creatorWallet = "0x1111111111111111111111111111111111111111";

    service.createReceipt({
      sessionId: "session_1",
      streamId: "stream_1",
      viewerWallet: "0x2222222222222222222222222222222222222222",
      creatorWallet,
      charge: "0.5",
    });

    service.createReceipt({
      sessionId: "session_2",
      streamId: "stream_2",
      viewerWallet: "0x3333333333333333333333333333333333333333",
      creatorWallet,
      charge: "1.25",
    });

    const totals = service.getCreatorPayoutSummary(creatorWallet);

    expect(totals.totalReceived).toBe("1.75");
    expect(totals.receipts.length).toBe(2);
  });

  it("creates a pending withdrawal claim for the creator wallet", () => {
    const service = new SettlementService();
    const creatorWallet = "0x1111111111111111111111111111111111111111";

    const claim = service.createPayoutClaim(creatorWallet, "1.75");

    expect(claim.creatorWallet).toBe(creatorWallet);
    expect(claim.amount).toBe("1.75");
    expect(claim.status).toBe("pending");
    expect(
      service.getCreatorPayoutSummary(creatorWallet).pendingClaims.length
    ).toBe(1);
  });

  it("finalizes a pending claim and marks it claimed", () => {
    const service = new SettlementService();
    const creatorWallet = "0x1111111111111111111111111111111111111111";
    const claim = service.createPayoutClaim(creatorWallet, "1.75");

    const executedClaim = service.finalizePayoutClaim(
      creatorWallet,
      claim.claimId
    );

    expect(executedClaim.status).toBe("claimed");
    expect(executedClaim.claimId).toBe(claim.claimId);
    expect(
      service.getCreatorPayoutSummary(creatorWallet).pendingClaims[0]?.status
    ).toBe("claimed");
  });
});
