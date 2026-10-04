import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type WatchSessionDocument = WatchSession & Document & { createdAt: Date; updatedAt: Date };

@Schema({ timestamps: true, collection: "watch_sessions" })
export class WatchSession {
  @Prop({ required: true, unique: true })
  declare sessionId: string;

  @Prop({ required: true, index: true })
  declare streamId: string;

  @Prop({ required: true, index: true })
  declare viewerWallet: string;

  @Prop({ required: true })
  declare maxCharge: string;

  @Prop({ required: true })
  declare authorizationHash: string;

  @Prop({ required: true, default: "authorized" })
  declare status: "authorized" | "playing" | "paused" | "completed" | "capped";

  @Prop({ default: 0 })
  declare secondsWatched: number;

  @Prop({ default: "0" })
  declare charge: string;

  @Prop()
  declare startedAt?: Date;

  @Prop()
  declare stoppedAt?: Date;

  @Prop()
  declare lastHeartbeatAt?: Date;

  @Prop()
  declare accessTokenHash?: string;
}

export const WatchSessionSchema = SchemaFactory.createForClass(WatchSession);
WatchSessionSchema.index({ viewerWallet: 1, streamId: 1 });
WatchSessionSchema.index({ status: 1 });