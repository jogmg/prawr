import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  GatewayReceipt,
  GatewayReceiptSchema,
} from "../gateway/gateway-receipt.schema";
import { GatewayModule } from "../gateway/gateway.module";
import { SettlementController } from "./settlement.controller";
import { SettlementService } from "./settlement.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GatewayReceipt.name, schema: GatewayReceiptSchema },
    ]),
    GatewayModule,
  ],
  controllers: [SettlementController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
