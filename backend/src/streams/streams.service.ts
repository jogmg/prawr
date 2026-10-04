import { Injectable, Inject } from "@nestjs/common";
import { Model } from "mongoose";
import { randomUUID, createHash, timingSafeEqual } from "crypto";
import { SettlementService } from "../settlement/settlement.service";
import { Stream, StreamDocument } from "./stream.schema";
import { WatchSession, WatchSessionDocument } from "./watch-session.schema";
import {
  GatewayReceipt,
  GatewayReceiptDocument,
} from "./gateway-receipt.schema";

export type StreamStatus = "live" | "scheduled" | "offline";

export interface StreamRecord {
  id: string;
  title: string;
  creatorId: string;
  creatorWallet: string;
  category: string;
  ratePerMinute: number;
  status: StreamStatus;
  createdAt: string;
}

export interface WatchSessionRecord {
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  maxCharge: string;
  authorizationHash: string;
  createdAt: string;
  status: "authorized" | "playing" | "paused" | "completed" | "capped";
  secondsWatched: number;
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
  ratePerMinute: number;
  status?: StreamStatus;
}

export interface CreateSessionInput {
  streamId: string;
  viewerWallet: string;
  maxCharge: string;
  authorizationHash: string;
  issuedAt?: string;
}

@Injectable()
export class StreamsService {
  constructor(
    @Inject(Stream.name) private streamModel: Model<StreamDocument>,
    @Inject(WatchSession.name)
    private sessionModel: Model<WatchSessionDocument>,
    @Inject(GatewayReceipt.name)
    private gatewayReceiptModel: Model<GatewayReceiptDocument>,
    private readonly settlementService = new SettlementService()
  ) {}

  async listStreams(): Promise<StreamRecord[]> {
    const streams = await this.streamModel.find().exec();
    return streams.map((stream) => ({
      id: stream.id,
      title: stream.title,
      creatorId: stream.creatorId,
      creatorWallet: stream.creatorWallet,
      category: stream.category,
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

    if (!title) throw new Error("Stream title is required.");
    if (!creatorId) throw new Error("Creator id is required.");
    if (!creatorWallet) throw new Error("Creator wallet is required.");
    if (!category) throw new Error("Category is required.");
    if (!Number.isFinite(input.ratePerMinute) || input.ratePerMinute <= 0) {
      throw new Error("ratePerMinute must be a positive number.");
    }

    const stream = new this.streamModel({
      id: randomUUID(),
      title,
      creatorId,
      creatorWallet,
      category,
      ratePerMinute: Number(input.ratePerMinute.toFixed(3)),
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
      ratePerMinute: stream.ratePerMinute,
      status: stream.status,
      createdAt: stream.createdAt.toISOString(),
    };
  }

  async createSession(input: CreateSessionInput): Promise<WatchSessionRecord> {
    if (!input.streamId) throw new Error("streamId is required.");

    const stream = await this.getStreamById(input.streamId);
    if (!stream) throw new Error("Stream does not exist.");

    if (!input.viewerWallet.trim())
      throw new Error("viewerWallet is required.");
    if (!input.maxCharge || Number(input.maxCharge) <= 0) {
      throw new Error("maxCharge must be a positive decimal string.");
    }
    if (!input.authorizationHash.trim()) {
      throw new Error("authorizationHash is required.");
    }

    await this.settlementService.verifySessionAuthorization({
      streamId: input.streamId,
      viewerWallet: input.viewerWallet.trim(),
      maxCharge: input.maxCharge,
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
      maxCharge: input.maxCharge,
      authorizationHash: input.authorizationHash.trim(),
      createdAt: new Date(),
      status: "authorized",
      secondsWatched: 0,
      charge: "0",
      accessTokenHash,
    });

    await session.save();

    return {
      sessionId: session.sessionId,
      streamId: session.streamId,
      viewerWallet: session.viewerWallet,
      maxCharge: session.maxCharge,
      authorizationHash: session.authorizationHash,
      createdAt: session.createdAt.toISOString(),
      status: session.status,
      secondsWatched: session.secondsWatched,
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
      maxCharge: session.maxCharge,
      authorizationHash: session.authorizationHash,
      createdAt: session.createdAt.toISOString(),
      status: session.status,
      secondsWatched: session.secondsWatched,
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

    session.status = "playing";
    session.startedAt = new Date();
    session.lastHeartbeatAt = new Date();
    await session.save();

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

    const stream = await this.getStreamById(session.streamId);
    if (!stream) throw new Error("Stream not found.");

    const now = new Date();
    const lastHeartbeat = session.lastHeartbeatAt ?? session.startedAt ?? now;
    const elapsedMs = now.getTime() - lastHeartbeat.getTime();
    const cappedElapsedMs = Math.min(elapsedMs, 30_000); // Cap at 30 seconds

    session.secondsWatched += Math.floor(cappedElapsedMs / 1000);
    session.lastHeartbeatAt = now;

    // Calculate charge
    const ratePerMinute = stream.ratePerMinute;
    const charge = this.settlementService.calculateCharge({
      ratePerMinute,
      secondsWatched: session.secondsWatched,
    });

    // Validate against max charge
    const maxCharge = Number(session.maxCharge);
    if (Number(charge) > maxCharge) {
      session.status = "capped";
      session.charge = session.maxCharge;
      session.stoppedAt = new Date();
      await session.save();
      return this.mapSession(session);
    }

    session.charge = charge;
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

    const stream = await this.getStreamById(session.streamId);
    if (!stream) throw new Error("Stream not found.");

    const now = new Date();
    const lastHeartbeat = session.lastHeartbeatAt ?? session.startedAt ?? now;
    const elapsedMs = now.getTime() - lastHeartbeat.getTime();
    const cappedElapsedMs = Math.min(elapsedMs, 30_000);

    session.secondsWatched += Math.floor(cappedElapsedMs / 1000);
    session.status = "paused";

    const charge = this.settlementService.calculateCharge({
      ratePerMinute: stream.ratePerMinute,
      secondsWatched: session.secondsWatched,
    });
    session.charge = charge;

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

    const stream = await this.getStreamById(session.streamId);
    if (!stream) throw new Error("Stream not found.");

    if (session.status === "playing") {
      const now = new Date();
      const lastHeartbeat = session.lastHeartbeatAt ?? session.startedAt ?? now;
      const elapsedMs = now.getTime() - lastHeartbeat.getTime();
      const cappedElapsedMs = Math.min(elapsedMs, 30_000);
      session.secondsWatched += Math.floor(cappedElapsedMs / 1000);
    }

    const charge = this.settlementService.calculateCharge({
      ratePerMinute: stream.ratePerMinute,
      secondsWatched: session.secondsWatched,
    });

    session.status =
      Number(charge) >= Number(session.maxCharge) ? "capped" : "completed";
    session.charge = charge;
    session.stoppedAt = new Date();
    await session.save();

    return this.mapSession(session);
  }

  async recordWatchSecond(
    sessionId: string,
    paidAmount: string,
    transaction?: string,
    network?: string
  ): Promise<WatchSessionRecord> {
    const session = await this.sessionModel.findOne({ sessionId }).exec();
    if (!session) throw new Error("Session not found.");

    if (session.status !== "playing") {
      throw new Error(
        `Cannot record payment for session in status: ${session.status}`
      );
    }

    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("paidAmount must be a positive USDC amount.");
    }

    const newCharge = Number((Number(session.charge) + amount).toFixed(6));
    if (newCharge > Number(session.maxCharge)) {
      throw new Error("Session charge exceeds the authorization cap.");
    }

    session.secondsWatched += 1;
    session.charge =
      newCharge.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
    if (newCharge >= Number(session.maxCharge)) {
      session.status = "capped";
      session.stoppedAt = new Date();
    }
    await session.save();

    const stream = await this.getStreamById(session.streamId);
    if (!stream) throw new Error("Stream not found.");
    await this.gatewayReceiptModel.create({
      receiptId: randomUUID(),
      sessionId: session.sessionId,
      streamId: session.streamId,
      viewerWallet: session.viewerWallet,
      creatorWallet: stream.creatorWallet,
      amount: paidAmount,
      transaction,
      network,
    });

    return this.mapSession(session);
  }

  private mapSession(session: WatchSessionDocument): WatchSessionRecord {
    return {
      sessionId: session.sessionId,
      streamId: session.streamId,
      viewerWallet: session.viewerWallet,
      maxCharge: session.maxCharge,
      authorizationHash: session.authorizationHash,
      createdAt: session.createdAt.toISOString(),
      status: session.status,
      secondsWatched: session.secondsWatched,
      charge: session.charge,
      startedAt: session.startedAt?.toISOString(),
      stoppedAt: session.stoppedAt?.toISOString(),
      lastHeartbeatAt: session.lastHeartbeatAt?.toISOString(),
      accessTokenHash: session.accessTokenHash,
    };
  }
}
