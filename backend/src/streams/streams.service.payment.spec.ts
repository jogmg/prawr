jest.mock("./schemas/stream.schema", () => ({ Stream: { name: "Stream" } }));
jest.mock("./schemas/watch-session.schema", () => ({
  WatchSession: { name: "WatchSession" },
}));
jest.mock("../gateway/gateway-receipt.schema", () => ({
  GatewayReceipt: { name: "GatewayReceipt" },
}));
jest.mock("@nestjs/mongoose", () => ({
  InjectModel: () => () => undefined,
}));

import { Model } from "mongoose";
import { createHash } from "crypto";
import { SettlementService } from "../settlement/settlement.service";
import type { StreamDocument } from "./schemas/stream.schema";
import type { WatchSessionDocument } from "./schemas/watch-session.schema";
import { quoteWatchBlock, StreamsService } from "./streams.service";
import { normalizeStreamRate } from "./stream.constants";

describe("StreamsService paid watch accounting", () => {
  it("accepts creator rates within the configured range", () => {
    expect(normalizeStreamRate(0.001)).toBe(0.001);
    expect(normalizeStreamRate(100)).toBe(100);
    expect(normalizeStreamRate(0.1234)).toBe(0.123);
  });

  it.each([0, 0.0009, 100.001, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid creator rate: %s",
    (rate) => {
      expect(() => normalizeStreamRate(rate)).toThrow(
        "ratePerMinute must be between 0.001 and 100 USDC."
      );
    }
  );

  const makeService = () => {
    const session = {
      sessionId: "session-1",
      streamId: "stream-1",
      viewerWallet: "0x1111111111111111111111111111111111111111",
      authorizationHash: "0xsignature",
      createdAt: new Date("2026-10-03T00:00:00.000Z"),
      startedAt: new Date("2026-10-03T00:00:00.000Z"),
      lastHeartbeatAt: new Date("2026-10-03T00:00:00.000Z"),
      status: "playing" as const,
      secondsWatched: 0,
      prepaidSeconds: 0,
      charge: "0",
      accessTokenHash: createHash("sha256")
        .update("access-token")
        .digest("hex"),
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

    return { service, session, stream, gatewayReceiptModel };
  };

  it("quotes a full 30-second viewing block", () => {
    expect(quoteWatchBlock(0.02)).toEqual({
      seconds: 30,
      amount: "0.00999",
    });
  });

  it("quotes a custom viewing duration using the stream rate", () => {
    expect(quoteWatchBlock(0.02, 60)).toEqual({
      seconds: 60,
      amount: "0.01998",
    });
  });

  it("records a paid block as prepaid credit and persists its Gateway receipt", async () => {
    const { service, session, gatewayReceiptModel } = makeService();

    const updated = await service.recordWatchBlock(
      "session-1",
      "0.00999",
      30,
      "0xtx",
      "eip155:5042002"
    );

    expect(session.secondsWatched).toBe(0);
    expect(session.prepaidSeconds).toBe(30);
    expect(session.charge).toBe("0.00999");
    expect(updated.prepaidSeconds).toBe(30);
    expect(updated.charge).toBe("0.00999");
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(gatewayReceiptModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: expect.any(String),
        sessionId: "session-1",
        amount: "0.00999",
        transaction: "0xtx",
        network: "eip155:5042002",
      })
    );
  });

  it("records a custom paid duration as prepaid credit", async () => {
    const { service, session } = makeService();

    const updated = await service.recordWatchBlock("session-1", "0.01998", 60);

    expect(updated.prepaidSeconds).toBe(60);
    expect(updated.charge).toBe("0.01998");
  });

  it("continues granting blocks after cumulative charges exceed two USDC", async () => {
    const { service, session } = makeService();
    session.charge = "2";

    const updated = await service.recordWatchBlock("session-1", "0.00999", 30);

    expect(session.status).toBe("paused");
    expect(updated.prepaidSeconds).toBe(30);
    expect(updated.charge).toBe("2.00999");
  });

  it("consumes prepaid time on heartbeats and pauses at the block boundary", async () => {
    const { service, session } = makeService();
    session.prepaidSeconds = 30;
    session.startedAt = new Date("2026-10-03T00:00:00.000Z");
    session.lastHeartbeatAt = session.startedAt;
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-03T00:00:05.000Z"));

    try {
      const partial = await service.heartbeatSession(
        "session-1",
        "access-token"
      );
      expect(partial.prepaidSeconds).toBe(25);
      expect(partial.secondsWatched).toBe(5);
      expect(partial.status).toBe("playing");

      jest.setSystemTime(new Date("2026-10-03T00:00:30.000Z"));
      const exhausted = await service.heartbeatSession(
        "session-1",
        "access-token"
      );
      expect(exhausted.prepaidSeconds).toBe(0);
      expect(exhausted.secondsWatched).toBe(30);
      expect(exhausted.status).toBe("paused");
    } finally {
      jest.useRealTimers();
    }
  });

  it("restores an interrupted playing session as paused with elapsed prepaid time consumed", async () => {
    const { service, session } = makeService();
    session.prepaidSeconds = 30;
    session.lastHeartbeatAt = new Date("2026-10-03T00:00:00.000Z");
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-03T00:00:08.000Z"));

    try {
      const restored = await service.restoreSession(
        "session-1",
        "access-token"
      );

      expect(restored.status).toBe("paused");
      expect(restored.prepaidSeconds).toBe(22);
      expect(restored.secondsWatched).toBe(8);
      expect(restored).not.toHaveProperty("accessTokenHash");
      expect(session.save).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("consumes custom-duration prepaid time after a longer interruption", async () => {
    const { service, session } = makeService();
    session.prepaidSeconds = 60;
    session.lastHeartbeatAt = new Date("2026-10-03T00:00:00.000Z");
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-03T00:00:45.000Z"));

    try {
      const restored = await service.restoreSession(
        "session-1",
        "access-token"
      );

      expect(restored.status).toBe("paused");
      expect(restored.prepaidSeconds).toBe(15);
      expect(restored.secondsWatched).toBe(45);
    } finally {
      jest.useRealTimers();
    }
  });

  it("rejects payment that does not match the quoted block", async () => {
    const { service, session, gatewayReceiptModel } = makeService();

    await expect(
      service.recordWatchBlock("session-1", "0.01", 30)
    ).rejects.toThrow("Payment does not match the next viewing block");
    expect(session.save).not.toHaveBeenCalled();
    expect(gatewayReceiptModel.create).not.toHaveBeenCalled();
  });

  it("rejects purchasing another block while prepaid time remains", async () => {
    const { service, session } = makeService();
    session.prepaidSeconds = 10;

    await expect(
      service.recordWatchBlock("session-1", "0.00999", 30)
    ).rejects.toThrow("The current prepaid viewing block has not been used");
    expect(session.save).not.toHaveBeenCalled();
  });

  it("rejects purchasing more viewing time after a stream goes offline", async () => {
    const { service, session, stream, gatewayReceiptModel } = makeService();
    stream.status = "offline" as never;

    await expect(
      service.recordWatchBlock("session-1", "0.00999", 30)
    ).rejects.toThrow("Cannot buy viewing time for a stream that is not live.");
    expect(session.save).not.toHaveBeenCalled();
    expect(gatewayReceiptModel.create).not.toHaveBeenCalled();
  });
});
