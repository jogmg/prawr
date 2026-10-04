import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { formatUnits, parseUnits } from "viem";
import {
  CreateSessionDto,
  CreateStreamDto,
  WatchSessionControlDto,
} from "./stream.dto";
import { StreamsService } from "./streams.service";
import { GatewayMiddleware } from "../gateway/gateway.middleware";

/** Express request augmented by the Gateway middleware after settlement. */
interface PaidRequest extends Request {
  payment?: {
    verified: boolean;
    payer: string;
    amount: string;
    network: string;
    transaction?: string;
  };
}

@Controller("streams")
export class StreamsController {
  private readonly activePayments = new Set<string>();

  constructor(
    private readonly streamsService: StreamsService,
    private readonly gateway: GatewayMiddleware
  ) {}

  /**
   * Per-second price for a stream rate, in USDC dollars (decimal string).
   * e.g. $0.02/min => 0.02 / 60 = 0.000333... => rounded to whole base units.
   */
  private chargePerSecondDollars(ratePerMinute: number): string {
    const perSecond = ratePerMinute / 60;
    // Round to whole USDC base units (6 decimals) to match Gateway amounts.
    const baseUnits = Math.max(1, Math.round(perSecond * 1_000_000));
    return (baseUnits / 1_000_000).toFixed(6);
  }

  @Get()
  listStreams() {
    return this.streamsService.listStreams();
  }

  @Get(":id")
  getStream(@Param("id") id: string) {
    const stream = this.streamsService.getStreamById(id);

    if (!stream) {
      return { message: "Stream not found" };
    }

    return stream;
  }

  @Post()
  createStream(@Body() dto: CreateStreamDto) {
    return this.streamsService.createStream(dto);
  }

  @Post("sessions")
  createSession(@Body() dto: CreateSessionDto) {
    return this.streamsService.createSession(dto);
  }

  @Post("sessions/:sessionId/start")
  startSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: WatchSessionControlDto
  ) {
    return this.streamsService.startSession(sessionId, dto.accessToken);
  }

  @Post("sessions/:sessionId/heartbeat")
  heartbeatSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: WatchSessionControlDto
  ) {
    return this.streamsService.heartbeatSession(sessionId, dto.accessToken);
  }

  @Post("sessions/:sessionId/pause")
  pauseSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: WatchSessionControlDto
  ) {
    return this.streamsService.pauseSession(sessionId, dto.accessToken);
  }

  @Post("sessions/:sessionId/resume")
  resumeSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: WatchSessionControlDto
  ) {
    return this.streamsService.resumeSession(sessionId, dto.accessToken);
  }

  @Post("sessions/:sessionId/stop")
  stopSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: WatchSessionControlDto
  ) {
    return this.streamsService.stopSession(sessionId, dto.accessToken);
  }

  @Get("sessions/:sessionId/payment-requirements")
  async getPaymentRequirements(@Param("sessionId") sessionId: string) {
    const session = await this.streamsService.getSessionById(sessionId);
    if (!session) {
      return { message: "Session not found" };
    }

    const stream = await this.streamsService.getStreamById(session.streamId);
    if (!stream) {
      return { message: "Stream not found" };
    }

    const chargePerSecond = this.chargePerSecondDollars(stream.ratePerMinute);

    return {
      sessionId: session.sessionId,
      streamId: stream.id,
      ratePerMinute: stream.ratePerMinute,
      chargePerSecond,
      // The GatewayClient resolves the full x402 requirements from the 402
      // PAYMENT-REQUIRED header when it hits the protected /watch endpoint;
      // this preview documents the price and network for the UI.
      paymentRequirements: {
        price: chargePerSecond,
        description: `Watch ${stream.title} - $${stream.ratePerMinute}/min`,
        network: process.env.GATEWAY_CHAIN ?? "eip155:5042002",
      },
    };
  }

  /**
   * Watch-second endpoint: protected by the Gateway x402 middleware.
   * Unpaid requests get 402 + PAYMENT-REQUIRED; paid requests run the handler
   * with req.payment populated by the middleware after verify + settle.
   */
  @Post("sessions/:sessionId/watch")
  async watchSecond(
    @Param("sessionId") sessionId: string,
    @Req() req: PaidRequest,
    @Res() res: Response
  ) {
    const session = await this.streamsService.getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const stream = await this.streamsService.getStreamById(session.streamId);
    if (!stream) {
      res.status(404).json({ message: "Stream not found" });
      return;
    }

    const price = this.chargePerSecondDollars(stream.ratePerMinute);
    if (session.status !== "playing") {
      res.status(409).json({ message: "Session is not playing" });
      return;
    }

    if (Number(session.charge) + Number(price) > Number(session.maxCharge)) {
      res.status(402).json({
        status: 402,
        message: "Session charge exceeds the authorization cap",
        sessionId: session.sessionId,
      });
      return;
    }

    if (this.activePayments.has(sessionId)) {
      res
        .status(409)
        .json({ message: "A payment is already in progress for this session" });
      return;
    }

    const handler = async () => {
      const payment = req.payment;
      if (!payment?.verified || !payment.amount) {
        res.status(402).json({ message: "Gateway payment was not verified" });
        return;
      }

      if (payment.payer.toLowerCase() !== session.viewerWallet.toLowerCase()) {
        res
          .status(403)
          .json({ message: "Gateway payer does not own this watch session" });
        return;
      }

      const paidAmountAtomic = BigInt(payment.amount);
      if (paidAmountAtomic !== parseUnits(price, 6)) {
        res
          .status(402)
          .json({
            message: "Gateway payment amount does not match the stream rate",
          });
        return;
      }

      const updatedSession = await this.streamsService.recordWatchSecond(
        sessionId,
        formatUnits(paidAmountAtomic, 6),
        payment.transaction,
        payment.network
      );

      res.status(200).json({
        sessionId: updatedSession.sessionId,
        status: updatedSession.status === "capped" ? "capped" : "paid",
        message: "Access granted for 1 second",
        transaction: payment?.transaction ?? "",
        secondsWatched: updatedSession.secondsWatched,
        charge: updatedSession.charge,
      });
    };

    // Run the Gateway x402 middleware with this stream's per-second price.
    const gate = this.gateway.require(price, session.viewerWallet);
    this.activePayments.add(sessionId);
    try {
      await gate(req, res, handler);
    } finally {
      this.activePayments.delete(sessionId);
    }
  }
}
