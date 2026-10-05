import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { formatUnits, parseUnits } from "viem";
import {
  CreateSessionDto,
  CreateStreamDto,
  WatchSessionControlDto,
} from "./stream.dto";
import { quoteWatchBlock, StreamsService } from "./streams.service";
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
    private readonly gateway: GatewayMiddleware,
    private readonly config: ConfigService
  ) {}

  @Get()
  listStreams() {
    return this.streamsService.listStreams();
  }

  @Get(":id")
  async getStream(@Param("id") id: string) {
    const stream = await this.streamsService.getStreamById(id);

    if (!stream) {
      throw new NotFoundException("Stream not found");
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

  @Post("sessions/:sessionId/restore")
  restoreSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: WatchSessionControlDto
  ) {
    return this.streamsService.restoreSession(sessionId, dto.accessToken);
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

    const block = quoteWatchBlock(stream.ratePerMinute);

    return {
      sessionId: session.sessionId,
      streamId: stream.id,
      ratePerMinute: stream.ratePerMinute,
      nextBlockSeconds: block.seconds,
      nextBlockAmount: block.amount,
      prepaidSeconds: session.prepaidSeconds ?? 0,
      charge: session.charge,
      // The GatewayClient resolves the full x402 requirements from the 402
      // PAYMENT-REQUIRED header when it hits the protected /watch endpoint;
      // this preview documents the price and network for the UI.
      paymentRequirements: {
        price: block.amount,
        description: `Watch ${stream.title} - $${stream.ratePerMinute}/min`,
        network: this.config.get<string>("GATEWAY_CHAIN", "eip155:5042002"),
      },
    };
  }

  /**
   * Prepaid viewing-block endpoint: protected by the Gateway x402 middleware.
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

    if (session.status !== "playing" && session.status !== "paused") {
      res.status(409).json({ message: "Session is not playing" });
      return;
    }

    if (session.prepaidSeconds > 0) {
      res.status(409).json({
        message: "A viewing block is already prepaid",
        prepaidSeconds: session.prepaidSeconds,
      });
      return;
    }

    const block = quoteWatchBlock(stream.ratePerMinute);

    const body = req.body as { blockSeconds?: number } | undefined;
    if (body?.blockSeconds !== block.seconds) {
      res.status(400).json({
        message: `The next block must be ${block.seconds} seconds`,
        blockSeconds: block.seconds,
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
      if (paidAmountAtomic !== parseUnits(block.amount, 6)) {
        res.status(402).json({
          message: "Gateway payment does not match the next viewing block",
        });
        return;
      }

      const updatedSession = await this.streamsService.recordWatchBlock(
        sessionId,
        formatUnits(paidAmountAtomic, 6),
        block.seconds,
        payment.transaction,
        payment.network
      );

      res.status(200).json({
        sessionId: updatedSession.sessionId,
        status: updatedSession.status === "capped" ? "capped" : "paid",
        message: `Prepaid ${block.seconds} seconds of viewing`,
        transaction: payment?.transaction ?? "",
        secondsGranted: block.seconds,
        prepaidSeconds: updatedSession.prepaidSeconds,
        secondsWatched: updatedSession.secondsWatched,
        charge: updatedSession.charge,
      });
    };

    // Charge upfront for the next 30-second block.
    const gate = this.gateway.require(
      block.amount,
      session.viewerWallet,
      stream.creatorWallet
    );
    this.activePayments.add(sessionId);
    try {
      await gate(req, res, handler);
    } finally {
      this.activePayments.delete(sessionId);
    }
  }
}
