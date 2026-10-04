jest.mock("./stream.schema", () => ({ Stream: { name: "Stream" } }));
jest.mock("./watch-session.schema", () => ({
  WatchSession: { name: "WatchSession" },
}));
jest.mock("./gateway-receipt.schema", () => ({
  GatewayReceipt: { name: "GatewayReceipt" },
}));

import { Model } from "mongoose";
import { SettlementService } from "../settlement/settlement.service";
import type { StreamDocument } from "./stream.schema";
import type { WatchSessionDocument } from "./watch-session.schema";
import { StreamsService } from "./streams.service";

describe("StreamsService paid watch accounting", () => {
  const makeService = (maxCharge = "0.01") => {
    const session = {
      sessionId: "session-1",
      streamId: "stream-1",
      viewerWallet: "0x1111111111111111111111111111111111111111",
      maxCharge,
      authorizationHash: "0xsignature",
      createdAt: new Date("2026-10-03T00:00:00.000Z"),
      status: "playing" as const,
      secondsWatched: 0,
      charge: "0",
      save: jest.fn().mockResolvedValue(undefined),
    };
    const stream = {
      id: "stream-1",
      title: "Test stream",
      creatorId: "creator-1",
      creatorWallet: "0x2222222222222222222222222222222222222222",
      category: "Test",
      ratePerMinute: 0.02,
      status: "live" as const,
      createdAt: new Date("2026-10-03T00:00:00.000Z"),
    };
    const sessionModel = {
      findOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(session) }),
    };
    const streamModel = {
      findOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(stream) }),
    };
    const gatewayReceiptModel = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StreamsService(
      streamModel as unknown as Model<StreamDocument>,
      sessionModel as unknown as Model<WatchSessionDocument>,
      gatewayReceiptModel as never,
      new SettlementService()
    );

    return { service, session, gatewayReceiptModel };
  };

  it("persists the paid charge and Gateway receipt metadata", async () => {
    const { service, session, gatewayReceiptModel } = makeService();

    const updated = await service.recordWatchSecond(
      "session-1",
      "0.000333",
      "0xtx",
      "eip155:5042002"
    );

    expect(session.secondsWatched).toBe(1);
    expect(session.charge).toBe("0.000333");
    expect(updated.charge).toBe("0.000333");
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(gatewayReceiptModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: expect.any(String),
        sessionId: "session-1",
        amount: "0.000333",
        transaction: "0xtx",
        network: "eip155:5042002",
      })
    );
  });

  it("marks a session capped when the settled payment reaches its maximum", async () => {
    const { service, session } = makeService("0.000333");

    const updated = await service.recordWatchSecond("session-1", "0.000333");

    expect(session.status).toBe("capped");
    expect(updated.stoppedAt).toBeTruthy();
    expect(updated.status).toBe("capped");
  });

  it("rejects an amount that would exceed the session maximum", async () => {
    const { service, session, gatewayReceiptModel } = makeService("0.000333");

    await expect(
      service.recordWatchSecond("session-1", "0.000334")
    ).rejects.toThrow("Session charge exceeds the authorization cap");
    expect(session.save).not.toHaveBeenCalled();
    expect(gatewayReceiptModel.create).not.toHaveBeenCalled();
  });
});
