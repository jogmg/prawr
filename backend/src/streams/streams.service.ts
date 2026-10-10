import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { Model } from "mongoose";
import { formatUnits, parseUnits } from "viem";
import {
  GatewayReceipt,
  GatewayReceiptDocument,
} from "../gateway/gateway-receipt.schema";
import { SettlementService } from "../settlement/settlement.service";
import { normalizeStreamRate } from "./stream.constants";
import { Stream, StreamDocument } from "./schemas/stream.schema";
import {
  WatchSession,
  WatchSessionDocument,
} from "./schemas/watch-session.schema";

export type StreamStatus = "live" | "scheduled" | "offline";

export const WATCH_BLOCK_SECONDS = 30;
export const MAX_WATCH_BLOCK_SECONDS = 24 * 60 * 60;

export function quoteWatchBlock(
  ratePerMinute: number,
  seconds = WATCH_BLOCK_SECONDS
): {
  seconds: number;
  amount: string;
} {
  if (
    !Number.isInteger(seconds) ||
    seconds <= 0 ||
    seconds > MAX_WATCH_BLOCK_SECONDS
  ) {
    throw new Error(
      `Viewing duration must be between 1 and ${MAX_WATCH_BLOCK_SECONDS} seconds.`
    );
  }
  const perSecondAtomic = BigInt(
    Math.max(1, Math.round((ratePerMinute / 60) * 1_000_000))
  );
  return {
    seconds,
    amount: formatUnits(perSecondAtomic * BigInt(seconds), 6),
  };
}

export interface StreamRecord {
  id: string;
  title: string;
  creatorId: string;
  creatorWallet: string;
  category: string;
  playbackUrl: string;
  ratePerMinute: number;
  status: StreamStatus;
  createdAt: string;
}

export interface WatchSessionRecord {
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  authorizationHash: string;
  createdAt: string;
  status: "authorized" | "playing" | "paused" | "completed" | "capped";
  secondsWatched: number;
  prepaidSeconds: number;
  charge: string;
  accessToken?: string;
  startedAt?: string;
  stoppedAt?: string;
  accessTokenHash?: string;
  lastHeartbeatAt?: string;
}

export interface CreateStreamInput {
  title: string;
  creatorId: string;
  creatorWallet: string;
  category: string;
  playbackUrl: string;
  ratePerMinute: number;
  status?: StreamStatus;
}

export interface CreateSessionInput {
  streamId: string;
  viewerWallet: string;
  authorizationHash: string;
  issuedAt?: string;
}

@Injectable()
export class StreamsService {
  constructor(
    @InjectModel(Stream.name) private streamModel: Model<StreamDocument>,
    @InjectModel(WatchSession.name)
    private sessionModel: Model<WatchSessionDocument>,
    @InjectModel(GatewayReceipt.name)
    private gatewayReceiptModel: Model<GatewayReceiptDocument>,
    private readonly settlementService: SettlementService
  ) {}

  async listStreams(): Promise<StreamRecord[]> {
    const streams = await this.streamModel.find().exec();
    return streams.map((stream) => ({
      id: stream.id,
      title: stream.title,
      creatorId: stream.creatorId,
      creatorWallet: stream.creatorWallet,
      category: stream.category,
      playbackUrl: stream.playbackUrl,
      ratePerMinute: stream.ratePerMinute,
      status: stream.status,
      createdAt: stream.createdAt.toISOString(),
    }));
  }

  async getStreamById(id: string): Promise<StreamRecord | undefined> {
    const stream = await this.streamModel.findOne({ id }).exec();
    if (!stream) return undefined;
    return {
      id: stream.id,
      title: stream.title,
      creatorId: stream.creatorId,
      creatorWallet: stream.creatorWallet,
      category: stream.category,
      playbackUrl: stream.playbackUrl,
      ratePerMinute: stream.ratePerMinute,
      status: stream.status,
      createdAt: stream.createdAt.toISOString(),
    };
  }

  async createStream(input: CreateStreamInput): Promise<StreamRecord> {
    const title = input.title.trim();
    const creatorId = input.creatorId.trim();
    const creatorWallet = input.creatorWallet.trim();
    const category = input.category.trim();
    const playbackUrl = input.playbackUrl.trim();

    if (!title) throw new Error("Stream title is required.");
    if (!creatorId) throw new Error("Creator id is required.");
    if (!creatorWallet) throw new Error("Creator wallet is required.");
    if (!category) throw new Error("Category is required.");
    if (!/^https?:\/\//i.test(playbackUrl)) {
      throw new Error("Playback URL must use HTTP or HTTPS.");
    }
    const ratePerMinute = normalizeStreamRate(input.ratePerMinute);

    const stream = new this.streamModel({
      id: randomUUID(),
      title,
      creatorId,
      creatorWallet,
      category,
      playbackUrl,
      ratePerMinute,
      status: input.status ?? "live",
      createdAt: new Date(),
    });

    await stream.save();

    return {
      id: stream.id,
      title: stream.title,
      creatorId: stream.creatorId,
      creatorWallet: stream.creatorWallet,
      category: stream.category,
      playbackUrl: stream.playbackUrl,
      ratePerMinute: stream.ratePerMinute,
      status: stream.status,
      createdAt: stream.createdAt.toISOString(),
    };
  }

  async createSession(input: CreateSessionInput): Promise<WatchSessionRecord> {
    if (!input.streamId) throw new Error("streamId is required.");

    const stream = await this.getStreamById(input.streamId);
    if (!stream) throw new Error("Stream does not exist.");
    if (stream.status !== "live") {
      throw new Error(
        "Cannot start a watch session for a stream that is not live."
      );
    }
    if (stream.status !== "live") {
      throw new Error(
        "Cannot start a watch session for a stream that is not live."
      );
    }

    if (!input.viewerWallet.trim())
      throw new Error("viewerWallet is required.");
    if (!input.authorizationHash.trim()) {
      throw new Error("authorizationHash is required.");
    }

    await this.settlementService.verifySessionAuthorization({
      streamId: input.streamId,
      viewerWallet: input.viewerWallet.trim(),
      authorizationHash: input.authorizationHash.trim(),
      issuedAt: input.issuedAt,
    });

    const accessToken = randomUUID();
    const accessTokenHash = createHash("sha256")
      .update(accessToken)
      .digest("hex");

    const session = new this.sessionModel({
      sessionId: randomUUID(),
      streamId: input.streamId,
      viewerWallet: input.viewerWallet.trim(),
      authorizationHash: input.authorizationHash.trim(),
      createdAt: new Date(),
      status: "authorized",
      secondsWatched: 0,
      prepaidSeconds: 0,
      charge: "0",
      accessTokenHash,
    });

    await session.save();

    return {
      sessionId: session.sessionId,
      streamId: session.streamId,
      viewerWallet: session.viewerWallet,
      authorizationHash: session.authorizationHash,
      createdAt: session.createdAt.toISOString(),
      status: session.status,
      secondsWatched: session.secondsWatched,
      prepaidSeconds: session.prepaidSeconds ?? 0,
      charge: session.charge,
      // Raw token returned ONCE at creation; only its SHA-256 hash is stored.
      accessToken,
    };
  }

  async getSessionById(
    sessionId: string
  ): Promise<WatchSessionRecord | undefined> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) return undefined;
    return {
      sessionId: session.sessionId,
      streamId: session.streamId,
      viewerWallet: session.viewerWallet,
      authorizationHash: session.authorizationHash,
      createdAt: session.createdAt.toISOString(),
      status: session.status,
      secondsWatched: session.secondsWatched,
      prepaidSeconds: session.prepaidSeconds ?? 0,
      charge: session.charge,
      startedAt: session.startedAt?.toISOString(),
      stoppedAt: session.stoppedAt?.toISOString(),
      lastHeartbeatAt: session.lastHeartbeatAt?.toISOString(),
      accessTokenHash: session.accessTokenHash,
    };
  }

  private validateAccessToken(
    session: WatchSessionDocument,
    accessToken: string
  ): boolean {
    if (!session.accessTokenHash) return false;
    const tokenHash = createHash("sha256").update(accessToken).digest("hex");
    return timingSafeEqual(
      Buffer.from(session.accessTokenHash),
      Buffer.from(tokenHash)
    );
  }

  async startSession(
    sessionId: string,
    accessToken: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");
    if (!this.validateAccessToken(session, accessToken)) {
      throw new Error("Invalid watch session token");
    }
    if (session.status !== "authorized") {
      throw new Error(`Cannot start session in status: ${session.status}`);
    }

    const stream = await this.getStreamById(session.streamId);
    if (!stream) throw new Error("Stream not found.");
    if (stream.status !== "live") {
      throw new Error(
        "Cannot start a watch session for a stream that is not live."
      );
    }

    session.status = "paused";
    session.startedAt = new Date();
    session.lastHeartbeatAt = new Date();
    await session.save();

    return this.mapSession(session);
  }

  async restoreSession(
    sessionId: string,
    accessToken: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");
    if (!this.validateAccessToken(session, accessToken)) {
      throw new Error("Invalid watch session token");
    }
    if (session.status === "playing") {
      this.consumePrepaidTime(session, new Date());
      session.status = "paused";
      session.lastHeartbeatAt = new Date();
      await session.save();
    }

    return this.mapSession(session);
  }

  async heartbeatSession(
    sessionId: string,
    accessToken: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");
    if (!this.validateAccessToken(session, accessToken)) {
      throw new Error("Invalid watch session token");
    }
    if (session.status !== "playing") {
      throw new Error(`Cannot heartbeat session in status: ${session.status}`);
    }

    this.consumePrepaidTime(session, new Date());
    await session.save();

    return this.mapSession(session);
  }

  async pauseSession(
    sessionId: string,
    accessToken: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");
    if (!this.validateAccessToken(session, accessToken)) {
      throw new Error("Invalid watch session token");
    }
    if (session.status !== "playing") {
      throw new Error(`Cannot pause session in status: ${session.status}`);
    }

    this.consumePrepaidTime(session, new Date());
    session.status = "paused";

    await session.save();

    return this.mapSession(session);
  }

  async resumeSession(
    sessionId: string,
    accessToken: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");
    if (!this.validateAccessToken(session, accessToken)) {
      throw new Error("Invalid watch session token");
    }
    if (session.status !== "paused") {
      throw new Error(`Cannot resume session in status: ${session.status}`);
    }

    session.status = "playing";
    session.lastHeartbeatAt = new Date();
    await session.save();

    return this.mapSession(session);
  }

  async stopSession(
    sessionId: string,
    accessToken: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");
    if (!this.validateAccessToken(session, accessToken)) {
      throw new Error("Invalid watch session token");
    }
    if (session.status !== "playing" && session.status !== "paused") {
      throw new Error(`Cannot stop session in status: ${session.status}`);
    }
    if (session.status === "playing") {
      this.consumePrepaidTime(session, new Date());
    }
    session.status = "completed";
    session.stoppedAt = new Date();
    await session.save();

    return this.mapSession(session);
  }

  async recordWatchBlock(
    sessionId: string,
    paidAmount: string,
    blockSeconds: number,
    transaction?: string,
    network?: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");

    if (session.status !== "playing" && session.status !== "paused") {
      throw new Error(
        `Cannot record payment for session in status: ${session.status}`
      );
    }
    if ((session.prepaidSeconds ?? 0) > 0) {
      throw new Error("The current prepaid viewing block has not been used.");
    }

    const amount = parseUnits(paidAmount, 6);
    if (amount <= 0n || !Number.isInteger(blockSeconds) || blockSeconds <= 0) {
      throw new Error("paidAmount must be a positive USDC amount.");
    }

    const stream = await this.getStreamById(session.streamId);
    if (!stream) throw new Error("Stream not found.");
    if (stream.status !== "live") {
      throw new Error("Cannot buy viewing time for a stream that is not live.");
    }
    const quote = quoteWatchBlock(stream.ratePerMinute, blockSeconds);
    if (
      blockSeconds !== quote.seconds ||
      amount !== parseUnits(quote.amount, 6)
    ) {
      throw new Error("Payment does not match the next viewing block.");
    }

    const newCharge = parseUnits(session.charge, 6) + amount;

    session.prepaidSeconds = (session.prepaidSeconds ?? 0) + blockSeconds;
    session.charge = formatUnits(newCharge, 6);
    session.status = "paused";
    session.lastHeartbeatAt = new Date();
    await session.save();

    await this.gatewayReceiptModel.create({
      receiptId: randomUUID(),
      sessionId: session.sessionId,
      streamId: session.streamId,
      viewerWallet: session.viewerWallet,
      creatorWallet: stream.creatorWallet,
      amount: formatUnits(amount, 6),
      transaction,
      network,
    });

    return this.mapSession(session);
  }

  private consumePrepaidTime(session: WatchSessionDocument, now: Date): void {
    const lastHeartbeat = session.lastHeartbeatAt ?? session.startedAt ?? now;
    const elapsedSeconds = Math.min(
      Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000),
      session.prepaidSeconds ?? 0
    );
    if (elapsedSeconds <= 0) return;
    const consumedSeconds = Math.min(
      Math.max(elapsedSeconds, 0),
      session.prepaidSeconds ?? 0
    );
    session.secondsWatched += consumedSeconds;
    session.prepaidSeconds = Math.max(
      (session.prepaidSeconds ?? 0) - consumedSeconds,
      0
    );
    session.lastHeartbeatAt = new Date(
      lastHeartbeat.getTime() + consumedSeconds * 1000
    );

    if (session.prepaidSeconds === 0) {
      session.lastHeartbeatAt = now;
      session.status = "paused";
    }
  }

  private mapSession(session: WatchSessionDocument): WatchSessionRecord {
    return {
      sessionId: session.sessionId,
      streamId: session.streamId,
      viewerWallet: session.viewerWallet,
      authorizationHash: session.authorizationHash,
      createdAt: session.createdAt.toISOString(),
      status: session.status,
      secondsWatched: session.secondsWatched,
      prepaidSeconds: session.prepaidSeconds ?? 0,
      charge: session.charge,
      startedAt: session.startedAt?.toISOString(),
      stoppedAt: session.stoppedAt?.toISOString(),
      lastHeartbeatAt: session.lastHeartbeatAt?.toISOString(),
    };
  }
}
