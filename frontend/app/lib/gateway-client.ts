import {
  BatchEvmScheme,
  CHAIN_CONFIGS,
} from "@circle-fin/x402-batching/client";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import {
  createPublicClient,
  formatUnits,
  http,
  parseUnits,
  pad,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { arcTestnet } from "viem/chains";
import type { BatchEvmSigner } from "@circle-fin/x402-batching";

const ARC = CHAIN_CONFIGS.arcTestnet;
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const gatewayWalletAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const gatewayMinterAbi = [
  {
    type: "function",
    name: "gatewayMint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestation", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export type GatewayBalances = {
  wallet: { balance: bigint | null; formatted: string | null };
  gateway: {
    available: bigint;
    formattedAvailable: string;
    withdrawable: bigint;
    formattedWithdrawable: string;
  };
};

export type GatewayWithdrawalSigner = {
  address: Address;
  signTypedData: (params: {
    domain: { name: string; version: string };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
};

function publicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(
      process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.io"
    ),
  });
}

export async function depositToGateway(
  amount: string,
  walletClient: WalletClient
) {
  if (!walletClient.account) throw new Error("Connect a wallet to deposit.");
  const value = parseUnits(amount, 6);
  const account = walletClient.account;
  const client = publicClient();
  const balance = await client.readContract({
    address: ARC.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < value)
    throw new Error("Insufficient Arc Testnet USDC balance.");

  const allowance = await client.readContract({
    address: ARC.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, ARC.gatewayWallet],
  });
  if (allowance < value) {
    const approval = await walletClient.writeContract({
      account,
      chain: arcTestnet,
      address: ARC.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [ARC.gatewayWallet, value],
    });
    await client.waitForTransactionReceipt({ hash: approval });
  }

  const deposit = await walletClient.writeContract({
    account,
    chain: arcTestnet,
    address: ARC.gatewayWallet,
    abi: gatewayWalletAbi,
    functionName: "deposit",
    args: [ARC.usdc, value],
    gas: 120000n,
  });
  await client.waitForTransactionReceipt({ hash: deposit });
  return { depositTxHash: deposit, amount, depositor: account.address };
}

export async function payForStream<T = unknown>(
  url: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown },
  signer: BatchEvmSigner
): Promise<{ data: T; amount: bigint; transaction: string; status: number }> {
  const client = new x402Client();
  client.register(
    "eip155:*",
    new BatchEvmScheme(signer) as unknown as Parameters<
      typeof client.register
    >[1]
  );
  const httpClient = new x402HTTPClient(client);
  const initialResponse = await fetch(url, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (initialResponse.status !== 402) {
    const data = (await initialResponse.json()) as T;
    if (!initialResponse.ok)
      throw new Error(`Watch request failed: ${initialResponse.status}`);
    return {
      data,
      amount: 0n,
      transaction: "",
      status: initialResponse.status,
    };
  }

  const required = httpClient.getPaymentRequiredResponse(
    (name) => initialResponse.headers.get(name),
    await initialResponse
      .clone()
      .json()
      .catch(() => undefined)
  );
  client.setSpendControls({
    allowedAssets: required.accepts.map(({ network, asset }) => ({
      network,
      asset,
      maxAmountPerPayment: "1000000",
    })),
  });
  const payload = await httpClient.createPaymentPayload(required);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(payload);
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...paymentHeaders,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = (await response.json()) as T;
  await httpClient.processPaymentResult(
    payload,
    (name) => response.headers.get(name),
    response.status
  );
  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : JSON.stringify(data);
    throw new Error(
      `Paid watch request failed: ${response.status}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }
  return {
    data,
    amount: BigInt(payload.accepted.amount),
    transaction: (data as { transaction?: string }).transaction ?? "",
    status: response.status,
  };
}

export async function getGatewayBalances(
  address: Address
): Promise<GatewayBalances> {
  const [balance, gatewayResponse] = await Promise.all([
    publicClient()
      .readContract({
        address: ARC.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })
      .catch(() => null),
    fetch(`${API_BASE_URL}/settlement/gateway/balances/${address}`, {
      cache: "no-store",
    }),
  ]);
  if (!gatewayResponse.ok) throw new Error("Failed to load Gateway balance.");
  const gateway = (await gatewayResponse.json()) as {
    gateway: { available: string; pending: string };
  };
  const available = parseUnits(gateway.gateway.available || "0", 6);
  const withdrawable = parseUnits(gateway.gateway.pending || "0", 6);
  return {
    wallet: {
      balance,
      formatted: balance === null ? null : formatUnits(balance, 6),
    },
    gateway: {
      available,
      formattedAvailable: formatUnits(available, 6),
      withdrawable,
      formattedWithdrawable: formatUnits(withdrawable, 6),
    },
  };
}

export async function withdrawFromGateway(
  amount: string,
  recipient: Address,
  walletClient: WalletClient,
  signer: GatewayWithdrawalSigner,
  feeRetry = 0
) {
  if (!walletClient.account) throw new Error("Connect a wallet to withdraw.");
  const value = parseUnits(amount, 6);
  const destination = CHAIN_CONFIGS.arcTestnet;
  const addressToBytes32 = (address: Address) =>
    pad(address.toLowerCase() as Address, { size: 32 });
  const intent = {
    maxBlockHeight: BigInt(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    ),
    maxFee: parseUnits("2.01", 6),
    spec: {
      version: 1,
      sourceDomain: ARC.domain,
      destinationDomain: destination.domain,
      sourceContract: addressToBytes32(ARC.gatewayWallet),
      destinationContract: addressToBytes32(destination.gatewayMinter),
      sourceToken: addressToBytes32(ARC.usdc),
      destinationToken: addressToBytes32(destination.usdc),
      sourceDepositor: addressToBytes32(signer.address),
      destinationRecipient: addressToBytes32(recipient),
      sourceSigner: addressToBytes32(signer.address),
      destinationCaller: addressToBytes32(
        "0x0000000000000000000000000000000000000000"
      ),
      value,
      salt: `0x${Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (byte) => byte.toString(16).padStart(2, "0")
      ).join("")}` as `0x${string}`,
      hookData: "0x" as `0x${string}`,
    },
  };
  const signature = await signer.signTypedData({
    domain: { name: "GatewayWallet", version: "1" },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      TransferSpec: [
        { name: "version", type: "uint32" },
        { name: "sourceDomain", type: "uint32" },
        { name: "destinationDomain", type: "uint32" },
        { name: "sourceContract", type: "bytes32" },
        { name: "destinationContract", type: "bytes32" },
        { name: "sourceToken", type: "bytes32" },
        { name: "destinationToken", type: "bytes32" },
        { name: "sourceDepositor", type: "bytes32" },
        { name: "destinationRecipient", type: "bytes32" },
        { name: "sourceSigner", type: "bytes32" },
        { name: "destinationCaller", type: "bytes32" },
        { name: "value", type: "uint256" },
        { name: "salt", type: "bytes32" },
        { name: "hookData", type: "bytes" },
      ],
      BurnIntent: [
        { name: "maxBlockHeight", type: "uint256" },
        { name: "maxFee", type: "uint256" },
        { name: "spec", type: "TransferSpec" },
      ],
    },
    primaryType: "BurnIntent",
    message: intent,
  });

  const response = await fetch(`${GATEWAY_API_URL}/v1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ burnIntent: intent, signature }], (_, field) =>
      typeof field === "bigint" ? field.toString() : field
    ),
  });
  const result = (await response.json()) as {
    success?: boolean;
    error?: string;
    message?: string;
    attestation?: `0x${string}`;
    signature?: `0x${string}`;
  };
  if (
    !response.ok ||
    result.success === false ||
    !result.attestation ||
    !result.signature
  ) {
    const errorMessage =
      result.message ?? result.error ?? "Gateway withdrawal failed.";
    const shortfall = errorMessage.match(
      /available\s+([0-9]+(?:\.[0-9]+)?),\s*required\s+([0-9]+(?:\.[0-9]+)?)/i
    );

    if (feeRetry === 0 && shortfall) {
      const available = parseUnits(shortfall[1], 6);
      const required = parseUnits(shortfall[2], 6);
      const adjustedValue = value - (required - available);
      if (adjustedValue > 0n && adjustedValue < value) {
        return withdrawFromGateway(
          formatUnits(adjustedValue, 6),
          recipient,
          walletClient,
          signer,
          feeRetry + 1
        );
      }
    }

    throw new Error(errorMessage);
  }

  const mintTxHash = await walletClient.writeContract({
    account: walletClient.account,
    chain: arcTestnet,
    address: destination.gatewayMinter,
    abi: gatewayMinterAbi,
    functionName: "gatewayMint",
    args: [result.attestation, result.signature],
  });
  await publicClient().waitForTransactionReceipt({ hash: mintTxHash });
  return { mintTxHash, amount: formatUnits(value, 6) };
}
