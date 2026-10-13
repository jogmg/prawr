import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { SettlementService } from "./settlement.service";

@Controller("settlement")
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get("receipts")
  getReceipts() {
    return this.settlementService.getReceipts();
  }

  @Get("summary/:creatorWallet")
  getCreatorSummary(@Param("creatorWallet") creatorWallet: string) {
    return this.settlementService.getCreatorPayoutSummary(creatorWallet);
  }

  @Post("claim")
  createPayoutClaim(@Body() body: { creatorWallet: string; amount: string }) {
    return this.settlementService.createPayoutClaim(
      body.creatorWallet,
      body.amount
    );
  }

  @Post("claim/finalize")
  finalizePayoutClaim(
    @Body() body: { creatorWallet: string; claimId: string }
  ) {
    return this.settlementService.finalizePayoutClaim(
      body.creatorWallet,
      body.claimId
    );
  }

  @Get("gateway/balances/:address")
  async getGatewayBalances(@Param("address") address: string) {
    return this.settlementService.getGatewayBalances(address);
  }

  @Post("gateway/withdraw")
  async withdrawFromGateway(
    @Body() body: { creatorWallet: string; amount: string }
  ) {
    return this.settlementService.withdrawFromGateway(
      body.creatorWallet,
      body.amount
    );
  }
}
