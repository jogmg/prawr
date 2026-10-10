"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import {
  creatorSummaryQuery,
  gatewayBalancesQuery,
} from "../queries/creator-queries";

export function useCreatorSummary(address?: Address) {
  return useQuery(creatorSummaryQuery(address));
}

export function useWalletGatewayBalances(address?: Address) {
  return useQuery(gatewayBalancesQuery(address));
}
