import { Module } from "@nestjs/common";
import { GatewayMiddleware } from "./gateway.middleware";

@Module({
  providers: [GatewayMiddleware],
  exports: [GatewayMiddleware],
})
export class GatewayModule {}