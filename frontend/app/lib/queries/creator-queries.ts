import { queryOptions } from "@tanstack/react-query";
import { getCreatorPayoutSummary } from "../prawr-api";
import { getGatewayBalances } from "../gateway-client";
import type { Address } from "viem";

export const creatorKeys = {
  all: ["creator"] as const,
  summary: (address: string) =>
    [...creatorKeys.all, "summary", address.toLowerCase()] as const,
  balances: (address: string) =>
    [...creatorKeys.all, "balances", address.toLowerCase()] as const,
};

export const creatorSummaryQuery = (address?: string) =>
  queryOptions({
    queryKey: creatorKeys.summary(address ?? ""),
    queryFn: () => getCreatorPayoutSummary(address!),
    enabled: Boolean(address),
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

export const gatewayBalancesQuery = (address?: Address) =>
  queryOptions({
    queryKey: creatorKeys.balances(address ?? ("" as Address)),
    queryFn: () => getGatewayBalances(address!),
    enabled: Boolean(address),
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
