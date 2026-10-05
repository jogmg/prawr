import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type GatewayReceiptDocument = GatewayReceipt & Document;

@Schema({ timestamps: true })
export class GatewayReceipt {
  @Prop({ required: true, unique: true })
  declare receiptId: string;

  @Prop({ required: true, index: true })
  declare sessionId: string;

  @Prop({ required: true, index: true })
  declare streamId: string;

  @Prop({ required: true, index: true })
  declare viewerWallet: string;

  @Prop({ required: true, index: true })
  declare creatorWallet: string;

  @Prop({ required: true })
  declare amount: string;

  @Prop()
  declare transaction?: string;

  @Prop()
  declare network?: string;
}

export const GatewayReceiptSchema =
  SchemaFactory.createForClass(GatewayReceipt);
GatewayReceiptSchema.index({ sessionId: 1, createdAt: 1 });
