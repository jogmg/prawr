"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { restoreWatchSessionQuery } from "../queries/stream-queries";
import {
  watchGatewayBalancesQuery,
  watchPaymentRequirementsQuery,
} from "../queries/watch-queries";

export function useRestoredWatchSession(
  sessionId?: string,
  accessToken?: string
) {
  return useQuery({
    ...restoreWatchSessionQuery(sessionId ?? "", accessToken ?? ""),
    enabled: Boolean(sessionId && accessToken),
  });
}

export function useWatchPaymentRequirements(sessionId?: string) {
  return useQuery(watchPaymentRequirementsQuery(sessionId));
}

export function useWatchGatewayBalances(address?: Address) {
  return useQuery(watchGatewayBalancesQuery(address));
}
