import { create } from "zustand";

export type StoredWatchSession = {
  streamId: string;
  sessionId: string;
  accessToken: string;
  playbackTime: number;
};

type SessionState = "idle" | "pending" | "authorized" | "playing" | "capped";

type WatchSessionStore = {
  streamId: string | null;
  secondsWatched: number;
  prepaidSeconds: number;
  amountCharged: number;
  sessionState: SessionState;
  resumeAvailable: boolean;
  setStreamId: (streamId: string) => void;
  setSecondsWatched: (seconds: number) => void;
  setPrepaidSeconds: (seconds: number) => void;
  setAmountCharged: (amount: number) => void;
  setSessionState: (state: SessionState) => void;
  setResumeAvailable: (available: boolean) => void;
};

export const useWatchSessionStore = create<WatchSessionStore>((set) => ({
  streamId: null,
  secondsWatched: 0,
  prepaidSeconds: 0,
  amountCharged: 0,
  sessionState: "idle",
  resumeAvailable: false,
  setStreamId: (streamId) =>
    set((state) =>
      state.streamId === streamId
        ? state
        : {
            streamId,
            secondsWatched: 0,
            prepaidSeconds: 0,
            amountCharged: 0,
            sessionState: "idle",
            resumeAvailable: false,
          }
    ),
  setSecondsWatched: (secondsWatched) => set({ secondsWatched }),
  setPrepaidSeconds: (prepaidSeconds) => set({ prepaidSeconds }),
  setAmountCharged: (amountCharged) => set({ amountCharged }),
  setSessionState: (sessionState) => set({ sessionState }),
  setResumeAvailable: (resumeAvailable) => set({ resumeAvailable }),
}));

export function getSavedWatchSessions(
  streamIds?: string[]
): StoredWatchSession[] {
  if (typeof window === "undefined") return [];
  const idFilter = streamIds ? new Set(streamIds) : null;
  const sessions: StoredWatchSession[] = [];

  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith("prawr:watch-session:")) continue;
    const streamId = key.split(":")[2];
    if (!streamId || (idFilter && !idFilter.has(streamId))) continue;
    try {
      const value = sessionStorage.getItem(key);
      if (!value) continue;
      const saved = JSON.parse(value) as Partial<StoredWatchSession>;
      if (!saved.sessionId || !saved.accessToken) continue;
      sessions.push({
        streamId,
        sessionId: saved.sessionId,
        accessToken: saved.accessToken,
        playbackTime: Number.isFinite(saved.playbackTime)
          ? Number(saved.playbackTime)
          : 0,
      });
    } catch {
      continue;
    }
  }

  return sessions;
}

export function saveWatchSession(
  key: string,
  session: Omit<StoredWatchSession, "streamId">
) {
  if (typeof window === "undefined") return;
  const streamId = key.split(":")[2];
  sessionStorage.setItem(key, JSON.stringify({ ...session, streamId }));
}

export function readWatchSession(
  key: string,
  streamId: string
): StoredWatchSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    const saved = JSON.parse(value) as Partial<StoredWatchSession>;
    if (!saved.sessionId || !saved.accessToken) return null;
    return {
      streamId,
      sessionId: saved.sessionId,
      accessToken: saved.accessToken,
      playbackTime: Number.isFinite(saved.playbackTime)
        ? Number(saved.playbackTime)
        : 0,
    };
  } catch {
    return null;
  }
}

export function removeWatchSession(key: string) {
  if (typeof window !== "undefined") sessionStorage.removeItem(key);
}
