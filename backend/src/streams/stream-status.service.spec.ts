jest.mock("./schemas/stream.schema", () => ({ Stream: { name: "Stream" } }));
jest.mock("@nestjs/mongoose", () => ({
  InjectModel: () => () => undefined,
}));

import { ConfigService } from "@nestjs/config";
import { Model } from "mongoose";
import type { StreamDocument } from "./schemas/stream.schema";
import { StreamStatusService } from "./stream-status.service";

describe("StreamStatusService", () => {
  const stream = {
    id: "youtube-live",
    playbackUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    status: "live" as const,
  };

  it("marks a YouTube broadcast offline after its actual end time", async () => {
    const update = { exec: jest.fn().mockResolvedValue({}) };
    const model = {
      find: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue([stream]) }),
      updateOne: jest.fn().mockReturnValue(update),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === "YOUTUBE_API_KEY" ? "test-key" : undefined
      ),
    };
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "abcdefghijk",
              liveStreamingDetails: {
                actualStartTime: "2026-10-08T12:00:00Z",
                actualEndTime: "2026-10-08T13:00:00Z",
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    try {
      const service = new StreamStatusService(
        model as unknown as Model<StreamDocument>,
        config as unknown as ConfigService
      );
      await service.refreshStatuses();

      expect(model.updateOne).toHaveBeenCalledWith(
        { id: "youtube-live" },
        { $set: { status: "offline" } }
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not alter statuses when provider credentials are unavailable", async () => {
    const model = { find: jest.fn(), updateOne: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new StreamStatusService(
      model as unknown as Model<StreamDocument>,
      config as unknown as ConfigService
    );

    await service.refreshStatuses();

    expect(model.find).not.toHaveBeenCalled();
    expect(model.updateOne).not.toHaveBeenCalled();
  });
});
