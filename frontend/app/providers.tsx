"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { useState } from "react";
import { Toaster } from "sonner";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { createAppQueryClient } from "./lib/queries/query-config";

const arc = CHAIN_CONFIGS.arc.chain;

const config = createConfig(
  getDefaultConfig({
    chains: [arc],
    transports: {
      [arc.id]: http(
        process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.mainnet.arc.io"
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
        <ConnectKitProvider
          mode="dark"
          customTheme={{
            "--ck-accent-color": "#ddca7d",
            "--ck-accent-text-color": "#ffffff",
            "--ck-border-radius": 12,
          }}
        >
          {children}
          <Toaster
            className="prawr-toaster"
            position="top-right"
            richColors
            closeButton
            theme="dark"
          />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
