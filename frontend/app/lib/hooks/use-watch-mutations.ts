"use client";

import { useMutation } from "@tanstack/react-query";
import type { BatchEvmSigner } from "@circle-fin/x402-batching";
import {
  createSession,
  heartbeatSession,
  pauseSession,
  resumeSession,
  startSession,
} from "../prawr-api";
import { payForStream } from "../gateway-client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export function useWatchSessionMutations() {
  const create = useMutation({ mutationFn: createSession });
  const start = useMutation({
    mutationFn: ({
      sessionId,
      accessToken,
    }: {
      sessionId: string;
      accessToken: string;
    }) => startSession(sessionId, accessToken),
  });
  const heartbeat = useMutation({
    mutationFn: ({
      sessionId,
      accessToken,
    }: {
      sessionId: string;
      accessToken: string;
    }) => heartbeatSession(sessionId, accessToken),
  });
  const pause = useMutation({
    mutationFn: ({
      sessionId,
      accessToken,
    }: {
      sessionId: string;
      accessToken: string;
    }) => pauseSession(sessionId, accessToken),
  });
  const resume = useMutation({
    mutationFn: ({
      sessionId,
      accessToken,
    }: {
      sessionId: string;
      accessToken: string;
    }) => resumeSession(sessionId, accessToken),
  });

  return { create, start, heartbeat, pause, resume };
}

type PaidBlockResult = {
  status: string;
  prepaidSeconds: number;
  secondsWatched: number;
  charge: string;
};

export function usePayForWatchBlock() {
  return useMutation({
    mutationFn: ({
      sessionId,
      blockSeconds,
      signer,
    }: {
      sessionId: string;
      blockSeconds: number;
      signer: BatchEvmSigner;
    }) =>
      payForStream<PaidBlockResult>(
        `${API_BASE_URL}/streams/sessions/${sessionId}/watch`,
        { method: "POST", body: { blockSeconds } },
        signer
      ),
  });
}
