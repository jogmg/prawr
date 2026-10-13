"use client";

import {
  useMutation,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createStream } from "../prawr-api";
import {
  getOfflineSessionCredentials,
  streamDetailQuery,
  streamListQuery,
  streamPagesQuery,
  streamKeys,
  type DiscoverableStream,
} from "../queries/stream-queries";
import { restoreWatchSessionQuery } from "../queries/stream-queries";

export function useStreams(enabled = true) {
  return useQuery({
    ...streamListQuery(),
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useDiscoverableStreams() {
  const streamsQuery = useInfiniteQuery(streamPagesQuery());
  const streams = streamsQuery.data?.pages.flatMap(({ items }) => items) ?? [];
  const credentials = getOfflineSessionCredentials(streams);
  const restoredSessions = useQueries({
    queries: credentials.map(({ sessionId, accessToken }) =>
      restoreWatchSessionQuery(sessionId, accessToken)
    ),
  });

  const prepaidStreamIds = new Set(
    restoredSessions.flatMap(({ data }) =>
      data &&
      data.prepaidSeconds > 0 &&
      data.status !== "completed" &&
      data.status !== "capped"
        ? [data.streamId]
        : []
    )
  );
  const data: DiscoverableStream[] = streams.flatMap((stream) => {
    if (stream.status === "live") return [stream];
    return prepaidStreamIds.has(stream.id)
      ? [{ ...stream, hasPrepaidTime: true }]
      : [];
  });

  return { ...streamsQuery, data };
}

export function useStream(id: string) {
  return useQuery(streamDetailQuery(id));
}

export function useCreateStream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createStream,
    onSuccess: async (created) => {
      queryClient.setQueryData(streamKeys.detail(created.id), created);
      await queryClient.invalidateQueries({ queryKey: streamKeys.lists() });
    },
  });
}
