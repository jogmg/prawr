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

export type PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
  description?: string;
  resource?: {
    url: string;
    description: string;
    mimeType: string;
  };
};

export type WatchSessionResponse = {
  sessionId: string;
  streamId: string;
  viewerWallet: string;
  maxCharge: string;
  authorizationHash: string;
  createdAt: string;
  status: "authorized";
  secondsWatched: number;
  charge: string;
  accessToken?: string;
};

export type WatchSecondResponse = {
  sessionId: string;
  status: "paid" | "capped" | "completed";
  message: string;
  transaction?: string;
  paymentRequirements?: PaymentRequirements;
};

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
}): Promise<WatchSessionResponse> {
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

  return response.json() as Promise<WatchSessionResponse>;
}

export async function getPaymentRequirements(
  sessionId: string
): Promise<{
  sessionId: string;
  streamId: string;
  ratePerMinute: number;
  chargePerSecond: string;
  paymentRequirements: PaymentRequirements;
}> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/payment-requirements`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get payment requirements: ${response.status}`);
  }

  return response.json();
}

export async function watchSecond(
  sessionId: string
): Promise<WatchSecondResponse> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/watch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.json() as Promise<WatchSecondResponse>;
}

export async function startSession(
  sessionId: string,
  accessToken: string
): Promise<WatchSessionResponse> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to start session: ${response.status}`);
  }

  return response.json() as Promise<WatchSessionResponse>;
}

export async function heartbeatSession(
  sessionId: string,
  accessToken: string
): Promise<WatchSessionResponse> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/heartbeat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to heartbeat session: ${response.status}`);
  }

  return response.json() as Promise<WatchSessionResponse>;
}

export async function pauseSession(
  sessionId: string,
  accessToken: string
): Promise<WatchSessionResponse> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/pause`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to pause session: ${response.status}`);
  }

  return response.json() as Promise<WatchSessionResponse>;
}

export async function resumeSession(
  sessionId: string,
  accessToken: string
): Promise<WatchSessionResponse> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/resume`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to resume session: ${response.status}`);
  }

  return response.json() as Promise<WatchSessionResponse>;
}

export async function stopSession(
  sessionId: string,
  accessToken: string
): Promise<WatchSessionResponse> {
  const response = await fetch(
    `${API_BASE_URL}/streams/sessions/${sessionId}/stop`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to stop session: ${response.status}`);
  }

  return response.json() as Promise<WatchSessionResponse>;
}

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

export async function getGatewayBalances(address: string) {
  const response = await fetch(
    `${API_BASE_URL}/settlement/gateway/balances/${encodeURIComponent(address)}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Gateway balances: ${response.status}`);
  }

  return response.json();
}

export async function withdrawFromGateway(
  amount: string,
  options?: { chain?: string; recipient?: string }
) {
  const response = await fetch(`${API_BASE_URL}/settlement/gateway/withdraw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount, ...options }),
  });

  if (!response.ok) {
    throw new Error(`Failed to withdraw from Gateway: ${response.status}`);
  }

  return response.json();
}
