"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address, WalletClient } from "viem";
import {
  depositToGateway,
  withdrawFromGateway,
  type GatewayWithdrawalSigner,
} from "../gateway-client";
import { creatorKeys } from "../queries/creator-queries";

export function useGatewayDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      amount,
      walletClient,
    }: {
      amount: string;
      walletClient: WalletClient;
    }) => depositToGateway(amount, walletClient),
    onSuccess: async (_result, { walletClient }) => {
      const address = walletClient.account?.address;
      if (address) {
        await queryClient.invalidateQueries({
          queryKey: creatorKeys.balances(address),
        });
      }
    },
  });
}

export function useGatewayWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      amount,
      recipient,
      walletClient,
      signer,
    }: {
      amount: string;
      recipient: Address;
      walletClient: WalletClient;
      signer: GatewayWithdrawalSigner;
    }) => withdrawFromGateway(amount, recipient, walletClient, signer),
    onSuccess: async (_result, { recipient }) => {
      await queryClient.invalidateQueries({
        queryKey: creatorKeys.balances(recipient),
      });
    },
  });
}
