import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { formatUnits, parseUnits } from "viem";
import { SettlementService } from "../settlement/settlement.service";

export type StreamStatus = "live" | "scheduled" | "offline";
export type WatchSessionStatus =
  | "authorized"
  | "playing"
  | "paused"
  | "completed"
  | "capped";

const MAX_HEARTBEAT_GAP_MS = 30_000;

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
  creatorWallet: string;
  ratePerMinute: number;
  maxCharge: string;
  authorizationHash: string;
  createdAt: string;
  status: WatchSessionStatus;
  billableMilliseconds: number;
  charge: string;
  startedAt?: string;
  stoppedAt?: string;
}

interface StoredWatchSession extends WatchSessionRecord {
  controlTokenHash: string;
  lastHeartbeatAtMs?: number;
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
  private readonly settlementService = new SettlementService();
  private readonly streams: StreamRecord[] = [
    {
      id: "stream_arc_briefing",
      title: "Arc Market Briefing",
      creatorId: "creator_1",
      creatorWallet: "0x1111111111111111111111111111111111111111",
      category: "Finance",
      ratePerMinute: 0.02,
      status: "live",
      createdAt: new Date().toISOString(),
    },
    {
      id: "stream_creator_studio",
      title: "Creator Studio Setup",
      creatorId: "creator_2",
      creatorWallet: "0x2222222222222222222222222222222222222222",
      category: "Product",
      ratePerMinute: 0.015,
      status: "live",
      createdAt: new Date().toISOString(),
    },
  ];

  private readonly sessions: StoredWatchSession[] = [];

  listStreams(): StreamRecord[] {
    return this.streams.map((stream) => ({ ...stream }));
  }

  getStreamById(id: string): StreamRecord | undefined {
    return this.streams.find((stream) => stream.id === id);
  }

  createStream(input: CreateStreamInput): StreamRecord {
    const title = input.title.trim();
    const creatorId = input.creatorId.trim();
    const creatorWallet = input.creatorWallet.trim();
    const category = input.category.trim();

    if (!title) {
      throw new Error("Stream title is required.");
    }

    if (!creatorId) {
      throw new Error("Creator id is required.");
    }

    if (!category) {
      throw new Error("Category is required.");
    }

    this.settlementService.validateWalletAddress(creatorWallet, "creator");

    if (!Number.isFinite(input.ratePerMinute) || input.ratePerMinute <= 0) {
      throw new Error("ratePerMinute must be a positive number.");
    }

    const stream: StreamRecord = {
      id: randomUUID(),
      title,
      creatorId,
      creatorWallet,
      category,
      ratePerMinute: Number(input.ratePerMinute.toFixed(6)),
      status: input.status ?? "live",
      createdAt: new Date().toISOString(),
    };

    this.streams.push(stream);

    return { ...stream };
  }

  async createSession(
    input: CreateSessionInput
  ): Promise<WatchSessionRecord & { accessToken: string }> {
    if (!input.streamId) {
      throw new Error("streamId is required.");
    }

    const stream = this.getStreamById(input.streamId);
    if (!stream) {
      throw new Error("Stream does not exist.");
    }

    if (!input.viewerWallet.trim()) {
      throw new Error("viewerWallet is required.");
    }

    let capMicros: bigint;
    try {
      capMicros = parseUnits(input.maxCharge, 6);
    } catch {
      throw new Error(
        "maxCharge must be a decimal amount with at most 6 decimals."
      );
    }
    if (capMicros <= 0n) {
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

    const accessToken = randomBytes(32).toString("hex");
    const session: StoredWatchSession = {
      sessionId: randomUUID(),
      streamId: input.streamId,
      viewerWallet: input.viewerWallet.trim(),
      creatorWallet: stream.creatorWallet,
      ratePerMinute: stream.ratePerMinute,
      maxCharge: formatUnits(capMicros, 6),
      authorizationHash: input.authorizationHash.trim(),
      createdAt: new Date().toISOString(),
      status: "authorized",
      billableMilliseconds: 0,
      charge: "0",
      controlTokenHash: this.hashToken(accessToken),
    };

    this.sessions.push(session);

    return { ...this.toPublicSession(session), accessToken };
  }

  startSession(sessionId: string, accessToken: string): WatchSessionRecord {
    const session = this.getAuthorizedSession(sessionId, accessToken);
    if (session.status === "playing") {
      return this.toPublicSession(session);
    }
    if (session.status !== "authorized") {
      throw new Error("Only an authorized session can be started.");
    }

    const now = Date.now();
    session.status = "playing";
    session.startedAt = new Date(now).toISOString();
    session.lastHeartbeatAtMs = now;

    return this.toPublicSession(session);
  }

  heartbeatSession(sessionId: string, accessToken: string): WatchSessionRecord {
    const session = this.getAuthorizedSession(sessionId, accessToken);
    if (
      session.status !== "playing" ||
      session.lastHeartbeatAtMs === undefined
    ) {
      throw new Error("Session is not playing.");
    }

    this.accrueServerElapsedTime(session, Date.now());
    return this.toPublicSession(session);
  }

  pauseSession(sessionId: string, accessToken: string): WatchSessionRecord {
    const session = this.getAuthorizedSession(sessionId, accessToken);
    if (session.status !== "playing") {
      throw new Error("Only a playing session can be paused.");
    }

    this.accrueServerElapsedTime(session, Date.now());
    if (session.status === "playing") {
      session.status = "paused";
      session.lastHeartbeatAtMs = undefined;
    }

    return this.toPublicSession(session);
  }

  resumeSession(sessionId: string, accessToken: string): WatchSessionRecord {
    const session = this.getAuthorizedSession(sessionId, accessToken);
    if (session.status !== "paused") {
      throw new Error("Only a paused session can be resumed.");
    }

    session.status = "playing";
    session.lastHeartbeatAtMs = Date.now();

    return this.toPublicSession(session);
  }

  stopSession(sessionId: string, accessToken: string): WatchSessionRecord {
    const session = this.getAuthorizedSession(sessionId, accessToken);
    if (session.status === "completed" || session.status === "capped") {
      return this.toPublicSession(session);
    }

    const capped =
      session.status === "playing"
        ? this.accrueServerElapsedTime(session, Date.now())
        : false;

    if (!capped) {
      session.status = "completed";
      session.stoppedAt = new Date().toISOString();
      session.lastHeartbeatAtMs = undefined;
    }

    return this.toPublicSession(session);
  }

  getSessionById(sessionId: string): WatchSessionRecord | undefined {
    const session = this.sessions.find(
      (record) => record.sessionId === sessionId
    );
    return session ? this.toPublicSession(session) : undefined;
  }

  private accrueServerElapsedTime(
    session: StoredWatchSession,
    now: number
  ): boolean {
    const previousHeartbeat = session.lastHeartbeatAtMs;
    if (previousHeartbeat === undefined) {
      throw new Error("Session heartbeat state is missing.");
    }

    const elapsedMs = Math.max(0, now - previousHeartbeat);
    const acceptedElapsedMs = Math.min(elapsedMs, MAX_HEARTBEAT_GAP_MS);
    session.lastHeartbeatAtMs = now;
    session.billableMilliseconds += acceptedElapsedMs;

    const chargeMicros = this.calculateSessionChargeMicros(session);
    const capMicros = parseUnits(session.maxCharge, 6);
    if (chargeMicros >= capMicros) {
      session.charge = session.maxCharge;
      session.status = "capped";
      session.stoppedAt = new Date(now).toISOString();
      session.lastHeartbeatAtMs = undefined;
      return true;
    }

    session.charge = formatUnits(chargeMicros, 6);
    return false;
  }

  private calculateSessionChargeMicros(session: StoredWatchSession): bigint {
    const rateMicros = parseUnits(session.ratePerMinute.toFixed(6), 6);
    return (rateMicros * BigInt(session.billableMilliseconds)) / 60_000n;
  }

  private getAuthorizedSession(
    sessionId: string,
    accessToken: string
  ): StoredWatchSession {
    const session = this.sessions.find(
      (record) => record.sessionId === sessionId
    );
    if (!session) {
      throw new Error("Watch session not found.");
    }

    const expectedHash = Buffer.from(session.controlTokenHash, "hex");
    const providedHash = Buffer.from(this.hashToken(accessToken), "hex");
    if (!timingSafeEqual(expectedHash, providedHash)) {
      throw new Error("Invalid watch session token.");
    }

    return session;
  }

  private hashToken(accessToken: string): string {
    return createHash("sha256").update(accessToken).digest("hex");
  }

  private toPublicSession(session: StoredWatchSession): WatchSessionRecord {
    const {
      controlTokenHash: _controlTokenHash,
      lastHeartbeatAtMs: _lastHeartbeatAtMs,
      ...publicSession
    } = session;
    return { ...publicSession };
  }
}
