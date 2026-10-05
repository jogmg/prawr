import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StreamsController } from "./streams.controller";
import { StreamsService } from "./streams.service";
import { Stream, StreamSchema } from "./schemas/stream.schema";
import { WatchSession, WatchSessionSchema } from "./schemas/watch-session.schema";
import { GatewayReceipt, GatewayReceiptSchema } from "../gateway/gateway-receipt.schema";
import { GatewayModule } from "../gateway/gateway.module";
import { SettlementModule } from "../settlement/settlement.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stream.name, schema: StreamSchema },
      { name: WatchSession.name, schema: WatchSessionSchema },
      { name: GatewayReceipt.name, schema: GatewayReceiptSchema },
    ]),
    GatewayModule,
    SettlementModule,
  ],
  controllers: [StreamsController],
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsModule {}
