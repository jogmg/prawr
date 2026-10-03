import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateSessionDto, CreateStreamDto } from "./stream.dto";
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
}
