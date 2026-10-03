import { generatePrivateKey, privateKeyToAccount, signMessage } from "viem/accounts";
import { StreamsService } from "./streams.service";

describe("StreamsService", () => {
  it("creates a stream with a valid rate and live status", () => {
    const service = new StreamsService();

    const stream = service.createStream({
      title: "Arc market briefing",
      creatorId: "creator_123",
      creatorWallet: "0xCreatorWallet",
      category: "Finance",
      ratePerMinute: 0.02,
      status: "live",
    });

    expect(stream.id).toBeTruthy();
    expect(stream.ratePerMinute).toBe(0.02);
    expect(stream.status).toBe("live");
  });

  it("creates a watch session that respects the spend cap", async () => {
    const service = new StreamsService();
    const stream = service.createStream({
      title: "Arc market briefing",
      creatorId: "creator_123",
      creatorWallet: "0xCreatorWallet",
      category: "Finance",
      ratePerMinute: 0.02,
      status: "live",
    });

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const issuedAt = new Date().toISOString();
    const authorizationHash = await signMessage({
      privateKey,
      message: service["settlementService"].buildAuthorizationMessage({
        streamId: stream.id,
        viewerWallet: account.address,
        maxCharge: "2000000",
        issuedAt,
      }),
    });

    const session = await service.createSession({
      streamId: stream.id,
      viewerWallet: account.address,
      maxCharge: "2000000",
      authorizationHash,
      issuedAt,
    });

    expect(session.sessionId).toBeTruthy();
    expect(session.maxCharge).toBe("2000000");
    expect(session.streamId).toBe(stream.id);
  });
});
