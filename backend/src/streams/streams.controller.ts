import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  CreateSessionDto,
  CreateStreamDto,
  WatchSessionControlDto,
} from "./stream.dto";
import { StreamsService } from "./streams.service";

@Controller("streams")
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

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
}
