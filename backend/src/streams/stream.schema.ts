import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type StreamDocument = Stream & Document & { createdAt: Date; updatedAt: Date };

@Schema({ timestamps: true, collection: "streams" })
export class Stream {
  @Prop({ required: true, unique: true })
  declare id: string;

  @Prop({ required: true })
  declare title: string;

  @Prop({ required: true })
  declare creatorId: string;

  @Prop({ required: true })
  declare creatorWallet: string;

  @Prop({ required: true })
  declare category: string;

  @Prop({ required: true })
  declare ratePerMinute: number;

  @Prop({ required: true, enum: ["live", "scheduled", "offline"], default: "live" })
  declare status: "live" | "scheduled" | "offline";

  @Prop()
  declare createdAt: Date;
}

export const StreamSchema = SchemaFactory.createForClass(Stream);
StreamSchema.index({ creatorId: 1 });
StreamSchema.index({ status: 1 });