"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { ARC_CHAIN, ARC_RPC_URL } from "./lib/arc-network";

const config = createConfig(
  getDefaultConfig({
    chains: [ARC_CHAIN],
    transports: {
      [ARC_CHAIN.id]: http(ARC_RPC_URL),
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
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
