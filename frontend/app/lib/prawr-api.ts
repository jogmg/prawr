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
    name: "creatorBalances",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "openSession",
    stateMutability: "payable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "creator", type: "address" },
      { name: "expiresAt", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimCreatorBalance",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export { PRAWR_SETTLEMENT_ADDRESS } from "./arc-network";

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
}): Promise<{
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  maxCharge: string;
  accessToken: string;
  status: "authorized";
  charge: string;
}> {
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

  return (await response.json()) as {
    sessionId: string;
    streamId: string;
    viewerWallet: string;
    maxCharge: string;
    accessToken: string;
    status: "authorized";
    charge: string;
  };
}

export type WatchSessionSnapshot = {
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  creatorWallet: string;
  ratePerMinute: number;
  maxCharge: string;
  status: "authorized" | "playing" | "paused" | "completed" | "capped";
  billableMilliseconds: number;
  charge: string;
  startedAt?: string;
  stoppedAt?: string;
};

export function startWatchSession(sessionId: string, accessToken: string) {
  return controlWatchSession(sessionId, accessToken, "start");
}

export function heartbeatWatchSession(sessionId: string, accessToken: string) {
  return controlWatchSession(sessionId, accessToken, "heartbeat");
}

export function resumeWatchSession(sessionId: string, accessToken: string) {
  return controlWatchSession(sessionId, accessToken, "resume");
}

export function stopWatchSession(sessionId: string, accessToken: string) {
  return controlWatchSession(sessionId, accessToken, "stop");
}

async function controlWatchSession(
  sessionId: string,
  accessToken: string,
  action: "start" | "heartbeat" | "pause" | "resume" | "stop"
): Promise<WatchSessionSnapshot> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to ${action} watch session: ${response.status}`);
  }

  return (await response.json()) as WatchSessionSnapshot;
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
