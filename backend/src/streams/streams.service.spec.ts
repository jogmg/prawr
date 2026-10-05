jest.mock("@nestjs/mongoose", () => ({
  InjectModel: () => () => undefined,
}));
jest.mock("../gateway/gateway-receipt.schema", () => ({
  GatewayReceipt: { name: "GatewayReceipt" },
}));

import { SettlementService } from "../settlement/settlement.service";

describe("SettlementService - Unit Tests", () => {
  let service: SettlementService;

  beforeEach(() => {
    service = new SettlementService();
  });

  it("builds authorization message correctly", () => {
    const message = service.buildAuthorizationMessage({
      streamId: "test_stream",
      viewerWallet: "0x1234567890123456789012345678901234567890",
      issuedAt: "2026-10-03T00:00:00.000Z",
    });

    expect(message).toContain("Prawr session authorization");
    expect(message).toContain("Stream: test_stream");
    expect(message).toContain(
      "Viewer: 0x1234567890123456789012345678901234567890"
    );
    expect(message).not.toContain("Max charge");
    expect(message).toContain("Issued at: 2026-10-03T00:00:00.000Z");
  });

  it("calculates charge correctly", () => {
    const charge = service.calculateCharge({
      ratePerMinute: 0.02,
      secondsWatched: 60,
    });

    expect(charge).toBe("0.02");
  });

  it("calculates cumulative charge without imposing a session limit", () => {
    const charge = service.calculateCharge({
      ratePerMinute: 0.02,
      secondsWatched: 6_000,
    });

    expect(charge).toBe("2");
  });

  it("creates a receipt with valid input", () => {
    const receipt = service.createReceipt({
      sessionId: "session_123",
      streamId: "stream_123",
      viewerWallet: "0x1111111111111111111111111111111111111111",
      creatorWallet: "0x2222222222222222222222222222222222222222",
      charge: "0.02",
    });

    expect(receipt.receiptId).toBeTruthy();
    expect(receipt.sessionId).toBe("session_123");
    expect(receipt.streamId).toBe("stream_123");
    expect(receipt.viewerWallet).toBe(
      "0x1111111111111111111111111111111111111111"
    );
    expect(receipt.creatorWallet).toBe(
      "0x2222222222222222222222222222222222222222"
    );
    expect(receipt.charge).toBe("0.02");
    expect(receipt.createdAt).toBeTruthy();
  });

  it("creates a payout claim", () => {
    const claim = service.createPayoutClaim(
      "0x1111111111111111111111111111111111111111",
      "1.75"
    );

    expect(claim.claimId).toBeTruthy();
    expect(claim.creatorWallet).toBe(
      "0x1111111111111111111111111111111111111111"
    );
    expect(claim.amount).toBe("1.75");
    expect(claim.status).toBe("pending");
  });

  it("finalizes a payout claim", () => {
    const claim = service.createPayoutClaim(
      "0x1111111111111111111111111111111111111111",
      "1.75"
    );

    const executedClaim = service.finalizePayoutClaim(
      "0x1111111111111111111111111111111111111111",
      claim.claimId
    );

    expect(executedClaim.status).toBe("claimed");
    expect(executedClaim.claimId).toBe(claim.claimId);
  });

  it("aggregates creator payout summary", async () => {
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
    expect(totals.receiptCount).toBe(2);
    expect(totals.receipts.length).toBe(2);
  });
});
