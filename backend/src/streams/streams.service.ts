import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { SettlementService } from "../settlement/settlement.service";

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
  status: "authorized";
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
      creatorWallet: "0xCreatorWalletOne",
      category: "Finance",
      ratePerMinute: 0.02,
      status: "live",
      createdAt: new Date().toISOString(),
    },
    {
      id: "stream_creator_studio",
      title: "Creator Studio Setup",
      creatorId: "creator_2",
      creatorWallet: "0xCreatorWalletTwo",
      category: "Product",
      ratePerMinute: 0.015,
      status: "live",
      createdAt: new Date().toISOString(),
    },
  ];

  private readonly sessions: WatchSessionRecord[] = [];

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

    if (!creatorWallet) {
      throw new Error("Creator wallet is required.");
    }

    if (!category) {
      throw new Error("Category is required.");
    }

    if (!Number.isFinite(input.ratePerMinute) || input.ratePerMinute <= 0) {
      throw new Error("ratePerMinute must be a positive number.");
    }

    const stream: StreamRecord = {
      id: randomUUID(),
      title,
      creatorId,
      creatorWallet,
      category,
      ratePerMinute: Number(input.ratePerMinute.toFixed(3)),
      status: input.status ?? "live",
      createdAt: new Date().toISOString(),
    };

    this.streams.push(stream);

    return { ...stream };
  }

  async createSession(input: CreateSessionInput): Promise<WatchSessionRecord> {
    if (!input.streamId) {
      throw new Error("streamId is required.");
    }

    if (!this.getStreamById(input.streamId)) {
      throw new Error("Stream does not exist.");
    }

    if (!input.viewerWallet.trim()) {
      throw new Error("viewerWallet is required.");
    }

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

    const session: WatchSessionRecord = {
      sessionId: randomUUID(),
      streamId: input.streamId,
      viewerWallet: input.viewerWallet.trim(),
      maxCharge: input.maxCharge,
      authorizationHash: input.authorizationHash.trim(),
      createdAt: new Date().toISOString(),
      status: "authorized",
    };

    this.sessions.push(session);

    return { ...session };
  }

  getSessionById(sessionId: string): WatchSessionRecord | undefined {
    return this.sessions.find((session) => session.sessionId === sessionId);
  }
}
