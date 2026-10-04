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
      maxCharge: "0.02",
      issuedAt: "2026-10-03T00:00:00.000Z",
    });

    expect(message).toContain("Prawr session authorization");
    expect(message).toContain("Stream: test_stream");
    expect(message).toContain("Viewer: 0x1234567890123456789012345678901234567890");
    expect(message).toContain("Max charge: 0.02 USDC");
    expect(message).toContain("Issued at: 2026-10-03T00:00:00.000Z");
  });

  it("calculates charge correctly", () => {
    const charge = service.calculateCharge({
      ratePerMinute: 0.02,
      secondsWatched: 60,
    });

    expect(charge).toBe("0.02");
  });

  it("validates authorization cap correctly", () => {
    const charge = service.validateAuthorizationCap({
      ratePerMinute: 0.02,
      secondsWatched: 120,
      maxCharge: "0.05",
    });

    expect(charge).toBe("0.04");
  });

  it("throws when charge exceeds authorization cap", () => {
    expect(() =>
      service.validateAuthorizationCap({
        ratePerMinute: 0.02,
        secondsWatched: 300,
        maxCharge: "0.05",
      })
    ).toThrow("Session charge exceeds the authorization cap");
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
    expect(receipt.viewerWallet).toBe("0x1111111111111111111111111111111111111111");
    expect(receipt.creatorWallet).toBe("0x2222222222222222222222222222222222222222");
    expect(receipt.charge).toBe("0.02");
    expect(receipt.createdAt).toBeTruthy();
  });

  it("creates a payout claim", () => {
    const claim = service.createPayoutClaim(
      "0x1111111111111111111111111111111111111111",
      "1.75"
    );

    expect(claim.claimId).toBeTruthy();
    expect(claim.creatorWallet).toBe("0x1111111111111111111111111111111111111111");
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

  it("aggregates creator payout summary", () => {
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
    expect(totals.receiptCount).toBe(2);
    expect(totals.receipts.length).toBe(2);
  });
});
