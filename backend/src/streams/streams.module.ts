import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StreamsController } from "./streams.controller";
import { StreamsService } from "./streams.service";
import { Stream, StreamSchema } from "./stream.schema";
import { WatchSession, WatchSessionSchema } from "./watch-session.schema";
import { GatewayReceipt, GatewayReceiptSchema } from "./gateway-receipt.schema";
import { GatewayModule } from "../gateway/gateway.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stream.name, schema: StreamSchema },
      { name: WatchSession.name, schema: WatchSessionSchema },
      { name: GatewayReceipt.name, schema: GatewayReceiptSchema },
    ]),
    GatewayModule,
  ],
  controllers: [StreamsController],
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsModule {}
