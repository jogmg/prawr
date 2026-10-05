jest.mock("@nestjs/mongoose", () => ({
  InjectModel: () => () => undefined,
}));
jest.mock("./../gateway/gateway-receipt.schema", () => ({
  GatewayReceipt: { name: "GatewayReceipt" },
}));

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
        issuedAt,
      }),
    });

    await expect(
      service.verifySessionAuthorization({
        streamId: "stream_123",
        viewerWallet: account.address,
        authorizationHash: signature,
        issuedAt,
      })
    ).resolves.toBe(true);
  });

  it("aggregates claimable creator payouts from in-memory receipt history", async () => {
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

    const totals = await service.getCreatorPayoutSummary(creatorWallet);

    expect(totals.totalReceived).toBe("1.75");
    expect(totals.receipts.length).toBe(2);
  });

  it("builds creator payout summaries from persisted Gateway receipts", async () => {
    const creatorWallet = "0x1111111111111111111111111111111111111111";
    const createdAt = new Date("2026-10-03T00:00:00.000Z");
    const receipt = {
      receiptId: "receipt-1",
      sessionId: "session-1",
      streamId: "stream-1",
      viewerWallet: "0x2222222222222222222222222222222222222222",
      creatorWallet,
      amount: "0.000333",
      transaction: "0xtx",
      network: "eip155:5042002",
      get: jest.fn().mockReturnValue(createdAt),
    };
    const gatewayReceiptModel = {
      find: jest.fn().mockReturnValue({
        sort: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue([receipt]) }),
      }),
    };
    const service = new SettlementService(gatewayReceiptModel as never);

    const summary = await service.getCreatorPayoutSummary(creatorWallet);

    expect(gatewayReceiptModel.find).toHaveBeenCalledWith({
      creatorWallet: { $regex: `^${creatorWallet}$`, $options: "i" },
    });
    expect(summary.totalReceived).toBe("0.000333");
    expect(summary.receiptCount).toBe(1);
    expect(summary.receipts[0]).toMatchObject({
      receiptId: "receipt-1",
      charge: "0.000333",
      transaction: "0xtx",
    });
    expect(summary.receipts[0]?.createdAt).toBe(createdAt.toISOString());
  });

  it("creates a pending withdrawal claim for the creator wallet", async () => {
    const service = new SettlementService();
    const creatorWallet = "0x1111111111111111111111111111111111111111";

    const claim = service.createPayoutClaim(creatorWallet, "1.75");

    expect(claim.creatorWallet).toBe(creatorWallet);
    expect(claim.amount).toBe("1.75");
    expect(claim.status).toBe("pending");
    expect(
      (await service.getCreatorPayoutSummary(creatorWallet)).pendingClaims
        .length
    ).toBe(1);
  });

  it("finalizes a pending claim and marks it claimed", async () => {
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
      (await service.getCreatorPayoutSummary(creatorWallet)).pendingClaims[0]
        ?.status
    ).toBe("claimed");
  });
});
