import { isAddress, type Address } from "viem";
import { arc, arcTestnet } from "viem/chains";

const network = process.env.NEXT_PUBLIC_ARC_NETWORK ?? "arcTestnet";

if (network !== "arcTestnet" && network !== "arc") {
  throw new Error("NEXT_PUBLIC_ARC_NETWORK must be arcTestnet or arc");
}

if (network === "arc" && process.env.NEXT_PUBLIC_ALLOW_MAINNET !== "true") {
  throw new Error("Set NEXT_PUBLIC_ALLOW_MAINNET=true to enable Arc Mainnet");
}

export const ARC_CHAIN = network === "arc" ? arc : arcTestnet;
export const ARC_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_RPC_URL ??
  (network === "arc"
    ? "https://rpc.mainnet.arc.io"
    : "https://rpc.testnet.arc.io");

const settlementAddress =
  network === "arc"
    ? process.env.NEXT_PUBLIC_PRAWR_SETTLEMENT_ADDRESS_ARC
    : process.env.NEXT_PUBLIC_PRAWR_SETTLEMENT_ADDRESS_ARC_TESTNET;

if (settlementAddress && !isAddress(settlementAddress)) {
  throw new Error(
    "Configured Prawr settlement address is not a valid EVM address"
  );
}

export const PRAWR_SETTLEMENT_ADDRESS = settlementAddress as
  | Address
  | undefined;
