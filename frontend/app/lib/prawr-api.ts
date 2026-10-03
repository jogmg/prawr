export type StreamRecord = {
  id: string;
  title: string;
  creatorId: string;
  creatorWallet: string;
  category: string;
  ratePerMinute: number;
  status: "live" | "scheduled" | "offline";
  createdAt: string;
};

export function buildSessionAuthorizationMessage({
  streamId,
  viewerWallet,
  maxCharge,
  issuedAt,
}: {
  streamId: string;
  viewerWallet: string;
  maxCharge: string;
  issuedAt: string;
}) {
  return [
    "Prawr session authorization",
    `Stream: ${streamId}`,
    `Viewer: ${viewerWallet}`,
    `Max charge: ${maxCharge} USDC`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

export const PRAWR_SETTLEMENT_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const PRAWR_SETTLEMENT_ADDRESS = process.env
  .NEXT_PUBLIC_PRAWR_SETTLEMENT_ADDRESS as `0x${string}` | undefined;

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function listStreams(): Promise<StreamRecord[]> {
  const response = await fetch(`${API_BASE_URL}/streams`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load streams: ${response.status}`);
  }

  const data = (await response.json()) as StreamRecord[];
  return data;
}

export async function createSession(payload: {
  streamId: string;
  viewerWallet: string;
  maxCharge: string;
  authorizationHash: string;
  issuedAt?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/streams/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`);
  }

  return response.json();
}

export type CreatorPayoutSummary = {
  creatorWallet: string;
  totalReceived: string;
  receiptCount: number;
  receipts: Array<{
    receiptId: string;
    sessionId: string;
    streamId: string;
    viewerWallet: string;
    creatorWallet: string;
    charge: string;
    createdAt: string;
  }>;
  pendingClaims: Array<{
    claimId: string;
    creatorWallet: string;
    amount: string;
    status: "pending" | "claimed";
    createdAt: string;
  }>;
};

export async function claimPayout(payload: {
  creatorWallet: string;
  amount: string;
}) {
  const response = await fetch(`${API_BASE_URL}/settlement/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create payout claim: ${response.status}`);
  }

  return response.json();
}

export async function getCreatorPayoutSummary(
  creatorWallet: string
): Promise<CreatorPayoutSummary> {
  const response = await fetch(
    `${API_BASE_URL}/settlement/summary/${encodeURIComponent(creatorWallet)}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch payout summary: ${response.status}`);
  }

  return response.json() as Promise<CreatorPayoutSummary>;
}

export async function finalizePayoutClaim(payload: {
  creatorWallet: string;
  claimId: string;
}) {
  const response = await fetch(`${API_BASE_URL}/settlement/claim/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to finalize payout claim: ${response.status}`);
  }

  return response.json();
}
