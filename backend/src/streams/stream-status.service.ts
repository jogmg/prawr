import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Stream, StreamDocument } from "./schemas/stream.schema";
import { StreamStatus } from "./streams.service";

type YoutubeVideo = {
  id: string;
  liveStreamingDetails?: {
    actualStartTime?: string;
    actualEndTime?: string;
    scheduledStartTime?: string;
  };
};

@Injectable()
export class StreamStatusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamStatusService.name);
  private interval?: ReturnType<typeof setInterval>;
  private refreshPending = false;
  private twitchAccessToken?: string;
  private twitchTokenExpiresAt = 0;

  constructor(
    @InjectModel(Stream.name)
    private readonly streamModel: Model<StreamDocument>,
    private readonly config: ConfigService
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(
      this.config.get("STREAM_STATUS_CHECK_INTERVAL_MS", 60_000)
    );
    if (!Number.isFinite(intervalMs) || intervalMs < 10_000) {
      this.logger.warn("Stream status check interval must be at least 10000ms");
      return;
    }

    void this.refreshStatuses();
    this.interval = setInterval(() => void this.refreshStatuses(), intervalMs);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async refreshStatuses(): Promise<void> {
    if (this.refreshPending) return;

    const youtubeApiKey = this.config.get<string>("YOUTUBE_API_KEY");
    const twitchClientId = this.config.get<string>("TWITCH_CLIENT_ID");
    const twitchClientSecret = this.config.get<string>("TWITCH_CLIENT_SECRET");
    if (!youtubeApiKey && !(twitchClientId && twitchClientSecret)) return;

    this.refreshPending = true;
    try {
      const streams = await this.streamModel.find().exec();
      const statuses = new Map<string, StreamStatus>();

      if (youtubeApiKey) {
        const videoIds = new Map<string, string[]>();
        for (const stream of streams) {
          const videoId = getYoutubeVideoId(stream.playbackUrl);
          if (!videoId) continue;
          const streamIds = videoIds.get(videoId) ?? [];
          streamIds.push(stream.id);
          videoIds.set(videoId, streamIds);
        }

        const youtubeStatuses = await this.getYoutubeStatuses(
          [...videoIds.keys()],
          youtubeApiKey
        );
        for (const [videoId, streamIds] of videoIds) {
          const status = youtubeStatuses.get(videoId);
          if (status) {
            for (const streamId of streamIds) statuses.set(streamId, status);
          }
        }
      }

      if (twitchClientId && twitchClientSecret) {
        const channels = new Map<string, string[]>();
        for (const stream of streams) {
          const channel = getTwitchChannel(stream.playbackUrl);
          if (!channel) continue;
          const streamIds = channels.get(channel) ?? [];
          streamIds.push(stream.id);
          channels.set(channel, streamIds);
        }

        const twitchStatuses = await this.getTwitchStatuses(
          [...channels.keys()],
          twitchClientId,
          twitchClientSecret
        );
        for (const [channel, streamIds] of channels) {
          const status = twitchStatuses.get(channel);
          if (status) {
            for (const streamId of streamIds) statuses.set(streamId, status);
          }
        }
      }

      for (const stream of streams) {
        const status = statuses.get(stream.id);
        if (!status || status === stream.status) continue;
        await this.streamModel
          .updateOne({ id: stream.id }, { $set: { status } })
          .exec();
      }
    } catch (error) {
      this.logger.warn(
        "Unable to refresh provider stream statuses",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.refreshPending = false;
    }
  }

  private async getYoutubeStatuses(
    videoIds: string[],
    apiKey: string
  ): Promise<Map<string, StreamStatus>> {
    const statuses = new Map<string, StreamStatus>();
    for (let start = 0; start < videoIds.length; start += 50) {
      const batch = videoIds.slice(start, start + 50);
      const query = new URLSearchParams({
        part: "liveStreamingDetails",
        id: batch.join(","),
        key: apiKey,
      });
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${query}`
      );
      if (!response.ok) {
        throw new Error(`YouTube API returned ${response.status}`);
      }

      const result = (await response.json()) as { items?: YoutubeVideo[] };
      const foundIds = new Set<string>();
      for (const video of result.items ?? []) {
        foundIds.add(video.id);
        const details = video.liveStreamingDetails;
        statuses.set(
          video.id,
          details?.actualEndTime
            ? "offline"
            : details?.actualStartTime
            ? "live"
            : details?.scheduledStartTime
            ? "scheduled"
            : "offline"
        );
      }
      for (const videoId of batch) {
        if (!foundIds.has(videoId)) statuses.set(videoId, "offline");
      }
    }
    return statuses;
  }

  private async getTwitchStatuses(
    channels: string[],
    clientId: string,
    clientSecret: string
  ): Promise<Map<string, StreamStatus>> {
    const statuses = new Map<string, StreamStatus>();
    if (channels.length === 0) return statuses;

    const token = await this.getTwitchAccessToken(clientId, clientSecret);
    for (let start = 0; start < channels.length; start += 100) {
      const batch = channels.slice(start, start + 100);
      const query = new URLSearchParams();
      for (const channel of batch) query.append("user_login", channel);
      const response = await fetch(
        `https://api.twitch.tv/helix/streams?${query}`,
        { headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        throw new Error(`Twitch API returned ${response.status}`);
      }

      const result = (await response.json()) as {
        data?: Array<{ user_login: string }>;
      };
      const liveChannels = new Set(
        (result.data ?? []).map((stream) => stream.user_login.toLowerCase())
      );
      for (const channel of batch) {
        statuses.set(channel, liveChannels.has(channel) ? "live" : "offline");
      }
    }
    return statuses;
  }

  private async getTwitchAccessToken(
    clientId: string,
    clientSecret: string
  ): Promise<string> {
    if (this.twitchAccessToken && Date.now() < this.twitchTokenExpiresAt) {
      return this.twitchAccessToken;
    }

    const query = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });
    const response = await fetch(`https://id.twitch.tv/oauth2/token?${query}`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Twitch OAuth returned ${response.status}`);
    }

    const result = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.twitchAccessToken = result.access_token;
    this.twitchTokenExpiresAt = Date.now() + (result.expires_in - 60) * 1000;
    return this.twitchAccessToken;
  }
}

function getYoutubeVideoId(playbackUrl: string): string | undefined {
  try {
    const url = new URL(playbackUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0];
    if (host !== "youtube.com" && host !== "m.youtube.com") return undefined;

    const videoId =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:live|embed|shorts)\/([^/?]+)/)?.[1];
    return videoId;
  } catch {
    return undefined;
  }
}

function getTwitchChannel(playbackUrl: string): string | undefined {
  try {
    const url = new URL(playbackUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "player.twitch.tv") {
      const playerChannel = url.searchParams.get("channel")?.toLowerCase();
      return playerChannel || undefined;
    }
    if (host !== "twitch.tv") return undefined;
    const channel = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (
      !channel ||
      ["videos", "directory", "downloads", "p"].includes(channel)
    ) {
      return undefined;
    }
    return channel;
  } catch {
    return undefined;
  }
}
