import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { SettlementModule } from "./settlement/settlement.module";
import { StreamsModule } from "./streams/streams.module";

@Module({
  imports: [StreamsModule, SettlementModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
