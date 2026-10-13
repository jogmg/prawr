export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export function createGatewayPaymentRequirements({
  amount,
  payTo,
  resourceUrl,
  description = "Prawr stream access",
}: {
  amount: string; // USDC base units (6 decimals)
  payTo: string; // seller address
  resourceUrl: string;
  description?: string;
}): PaymentRequirements {
  return {
    scheme: "exact",
    network: process.env.GATEWAY_CHAIN ?? "eip155:5042",
    asset:
      process.env.USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000",
    amount,
    payTo,
    maxTimeoutSeconds: 604900, // 7 days + buffer (required for Gateway batching)
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract:
        process.env.GATEWAY_WALLET_ADDRESS ??
        "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    },
  };
}
