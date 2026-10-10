"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { useState } from "react";
import { arcTestnet } from "viem/chains";
import { WagmiProvider, createConfig, http } from "wagmi";
import { createAppQueryClient } from "./lib/queries/query-config";

const config = createConfig(
  getDefaultConfig({
    chains: [arcTestnet],
    transports: {
      [arcTestnet.id]: http(
        process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.io"
      ),
    },
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo-project-id",
    appName: "Prawr",
    appDescription: "Decentralized micropayment streaming on Arc",
    appUrl: "https://prawr.app",
    appIcon: "https://prawr.app/icon.png",
  })
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
