import { queryOptions } from "@tanstack/react-query";
import {
  getStreamById,
  listStreams,
  restoreSession,
  type StreamRecord,
} from "../prawr-api";
import { getSavedWatchSessions } from "../../store/watch/watch-session.store";

export const streamKeys = {
  all: ["streams"] as const,
  lists: () => [...streamKeys.all, "list"] as const,
  detail: (id: string) => [...streamKeys.all, "detail", id] as const,
  restoredSession: (sessionId: string) =>
    ["watch-session", "restore", sessionId] as const,
};

export const streamListQuery = () =>
  queryOptions({
    queryKey: streamKeys.lists(),
    queryFn: listStreams,
    staleTime: 20_000,
    gcTime: 10 * 60_000,
  });

export const streamDetailQuery = (id: string) =>
  queryOptions({
    queryKey: streamKeys.detail(id),
    queryFn: () => getStreamById(id),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

export const restoreWatchSessionQuery = (
  sessionId: string,
  accessToken: string
) =>
  queryOptions({
    queryKey: streamKeys.restoredSession(sessionId),
    queryFn: () => restoreSession(sessionId, accessToken),
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

export type DiscoverableStream = StreamRecord & { hasPrepaidTime?: boolean };

export function getOfflineSessionCredentials(streams: StreamRecord[]) {
  const offlineIds = new Set(
    streams.filter((stream) => stream.status !== "live").map(({ id }) => id)
  );
  return getSavedWatchSessions().filter(({ streamId }) =>
    offlineIds.has(streamId)
  );
}
