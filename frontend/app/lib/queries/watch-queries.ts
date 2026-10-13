import { queryOptions } from "@tanstack/react-query";
import { getPaymentRequirements } from "../prawr-api";
import { getGatewayBalances } from "../gateway-client";
import type { Address } from "viem";
import { creatorKeys } from "./creator-queries";

export const watchKeys = {
  paymentRequirements: (sessionId: string) =>
    ["watch-session", sessionId, "payment-requirements"] as const,
};

export const watchPaymentRequirementsQuery = (sessionId?: string) =>
  queryOptions({
    queryKey: watchKeys.paymentRequirements(sessionId ?? ""),
    queryFn: () => getPaymentRequirements(sessionId!),
    enabled: Boolean(sessionId),
    staleTime: 5_000,
    retry: false,
  });

export const watchGatewayBalancesQuery = (address?: Address) =>
  queryOptions({
    queryKey: creatorKeys.balances(address ?? ("" as Address)),
    queryFn: () => getGatewayBalances(address!),
    enabled: Boolean(address),
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
