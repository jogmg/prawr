# Implementation Plan: Prawr MVP with Circle Gateway Nanopayments

## Goal
Build a working MVP on `feat/alt-wallet` where viewers pay per-minute for streams using Circle Gateway Nanopayments (gasless, batched USDC payments via x402/EIP-3009), creators withdraw earnings from Gateway balance, and all flows work end-to-end on Arc Testnet before manual testing.

---

## Current Context / Assumptions

**Branch**: `feat/alt-wallet` (simplified auth model, no escrow/heartbeat)
- Viewer signs session authorization → backend validates → session created
- **Current gap**: Settlement uses custom `PrawrSettlement.sol` contract (fallback), not Gateway Nanopayments
- Docs claim Gateway is "preferred" but implementation is contract-only

**Gateway Nanopayments architecture (from Circle docs)**:
- Buyer: Deposits USDC into Gateway Wallet contract (one-time, on-chain, pays gas)
- Buyer: Signs EIP-3009 `TransferWithAuthorization` off-chain (zero gas) for each payment
- Seller: Verifies signature via Gateway `verify` API, settles via `settle` API (batched)
- Seller: Funds accumulate in Gateway balance → withdraw via `GatewayClient.withdraw()`
- **Chain**: Arc Testnet (chainId 5042002), GatewayWallet contract: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- **USDC**: 6 decimals on Arc (not 18)
- **SDK**: `@circle-fin/x402-batching` for both buyer (`GatewayClient`) and seller (`createGatewayMiddleware`, `BatchFacilitatorClient`)

**Environment needed**:
- Circle developer account + API key (for Gateway API access)
- WalletConnect project ID
- Arc Testnet RPC (default: `https://rpc.testnet.arc.io`)
- Testnet USDC from Circle faucet
- MongoDB for persistence

---

## Architecture / Proposed Approach

**Settlement rail**: Circle Gateway Nanopayments (primary). The custom `PrawrSettlement.sol` is deprecated/removed.

**Flow**:
1. Viewer connects wallet, deposits USDC to Gateway Wallet (one-time, via frontend `GatewayClient.deposit()`)
2. Viewer authorizes stream session (signs EIP-712 message with streamId, maxCharge, viewerWallet)
3. Backend validates auth, creates session, returns `paymentRequirements` (x402 format with Gateway `extra` metadata)
4. Frontend `GatewayClient.pay()` handles 402 flow: signs EIP-3009 auth, retries with `PAYMENT-SIGNATURE` header
5. Backend middleware (`createGatewayMiddleware`) verifies + settles via Gateway API
6. Creator dashboard shows Gateway balance via `GatewayClient.getBalances()`, withdraws via `GatewayClient.withdraw()`

**Backend role**: x402 resource server with Gateway middleware. Validates session auth, issues payment requirements per second of watch time, settles via Gateway.

**Frontend role**: Buyer (viewer) uses `GatewayClient` for deposit/pay/withdraw. Seller (creator) uses `GatewayClient` for balance/withdraw.

---

## Step-by-Step Tasks

### Phase 0: Foundation & Configuration

#### Task 0.1: Install dependencies
**Files**: `package.json`, `backend/package.json`, `frontend/package.json`
**Commands**:
```bash
# Root
npm install

# Backend - add Gateway SDK
cd backend && npm install @circle-fin/x402-batching express

# Frontend - add Gateway SDK
cd frontend && npm install @circle-fin/x402-batching
```
**Verify**: `npm run build` succeeds in all workspaces.

#### Task 0.2: Create environment files with full comments

**File**: `frontend/.env.example` (update existing)
```bash
# Frontend - Next.js reads these at build time (NEXT_PUBLIC_*)

# Backend API base URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# Arc Testnet RPC for wagmi/viem wallet connections
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.io

# WalletConnect project ID from https://dashboard.reown.com/
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id_here

# Circle Gateway configuration
# Get these from Circle Developer Dashboard after creating a Gateway app
NEXT_PUBLIC_GATEWAY_API_KEY=your_gateway_api_key_here
NEXT_PUBLIC_GATEWAY_FACILITATOR_URL=https://gateway.circle.com  # or your facilitator URL

# Arc Testnet chain ID for Gateway (CAIP-2 format: eip155:5042002)
NEXT_PUBLIC_GATEWAY_CHAIN=eip155:5042002

# USDC contract on Arc Testnet (6 decimals)
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000

# Gateway Wallet contract on Arc Testnet (for EIP-712 verifyingContract)
NEXT_PUBLIC_GATEWAY_WALLET_ADDRESS=0x0077777d7EBA4688BDeF3E311b846F25870A19B9
```

**File**: `backend/.env.example` (update existing)
```bash
# Backend - NestJS server

# Server port
PORT=3001

# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/prawr

# JWT secret for any auth tokens
JWT_SECRET=dev-secret-change-in-prod

# Arc Testnet RPC for viem public client
ARC_RPC_URL=https://rpc.testnet.arc.io
ARC_CHAIN_ID=5042002

# Circle Gateway - SELLER (backend) configuration
# Your wallet address that receives payments (creator payouts aggregate here)
GATEWAY_SELLER_ADDRESS=0xYourSellerWalletAddress

# Gateway API key from Circle Developer Dashboard
GATEWAY_API_KEY=your_gateway_api_key_here

# Gateway facilitator URL (default Circle Gateway)
GATEWAY_FACILITATOR_URL=https://gateway.circle.com

# Arc Testnet CAIP-2 chain identifier
GATEWAY_CHAIN=eip155:5042002

# USDC contract on Arc Testnet
USDC_ADDRESS=0x3600000000000000000000000000000000000000

# Gateway Wallet contract on Arc Testnet
GATEWAY_WALLET_ADDRESS=0x0077777d7EBA4688BDeF3E311b846F25870A19B9

# Rate per minute in USDC (6 decimals) - e.g., "20000" = $0.02/min
DEFAULT_RATE_PER_MINUTE=20000
```

**File**: `contracts/.env.example` (update existing)
```bash
# Contracts - Foundry deployment only

# Arc Testnet RPC for deployment
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io

# Private key for testnet deployer wallet (generate with: arc-cast wallet new)
# NEVER use mainnet key, NEVER commit this value
PRIVATE_KEY=your_testnet_deployer_private_key_here

# Note: PrawrSettlement.sol is DEPRECATED with Gateway Nanopayments
# This is kept only for reference/history
PRAWR_SETTLEMENT_ADDRESS=
```

**File**: `frontend/.env` (create from example - user fills in)
**File**: `backend/.env` (create from example - user fills in)
**File**: `contracts/.env` (create from example - user fills in)

**Verify**: `cat frontend/.env backend/.env contracts/.env` shows all files present with user values.

#### Task 0.3: Add MongoDB to backend
**File**: `backend/src/app.module.ts`
```typescript
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { SettlementModule } from "./settlement/settlement.module";
import { StreamsModule } from "./streams/streams.module";

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI ?? "mongodb://localhost:27017/prawr"),
    StreamsModule,
    SettlementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```
**Verify**: `npm --workspace backend run build` succeeds.

---

### Phase 1: Backend - x402 Resource Server with Gateway Middleware

#### Task 1.1: Create payment requirements helper
**File**: `backend/src/gateway/gateway.config.ts` (NEW)
```typescript
import { PaymentRequirements } from "@circle-fin/x402-batching";

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
    network: process.env.GATEWAY_CHAIN ?? "eip155:5042002",
    asset: process.env.USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000",
    amount,
    payTo,
    maxTimeoutSeconds: 604900, // 7 days + buffer (required for Gateway batching)
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: process.env.GATEWAY_WALLET_ADDRESS ?? "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    },
    description,
    resource: {
      url: resourceUrl,
      description,
      mimeType: "application/json",
    },
  };
}
```

#### Task 1.2: Create Gateway middleware for Express/NestJS
**File**: `backend/src/gateway/gateway.middleware.ts` (NEW)
```typescript
import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching";
import { createGatewayPaymentRequirements } from "./gateway.config";

@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  private middleware = createGatewayMiddleware({
    sellerAddress: process.env.GATEWAY_SELLER_ADDRESS!,
    networks: [process.env.GATEWAY_CHAIN ?? "eip155:5042002"],
    facilitatorUrl: process.env.GATEWAY_FACILITATOR_URL,
    description: "Prawr stream access",
  });

  use(req: Request, res: Response, next: NextFunction) {
    // Attach payment requirements to request for route handlers
    (req as any).gatewayRequirements = createGatewayPaymentRequirements({
      amount: "0", // Will be overridden per-request
      payTo: process.env.GATEWAY_SELLER_ADDRESS!,
      resourceUrl: req.originalUrl,
    });
    this.middleware(req, res, next);
  }
}
```

#### Task 1.3: Create per-second payment requirements endpoint
**File**: `backend/src/streams/streams.controller.ts` (add endpoint)
```typescript
@Get("sessions/:sessionId/payment-requirements")
async getPaymentRequirements(@Param("sessionId") sessionId: string) {
  const session = this.streamsService.getSessionById(sessionId);
  if (!session) {
    return { message: "Session not found" };
  }

  const stream = this.streamsService.getStreamById(session.streamId);
  if (!stream) {
    return { message: "Stream not found" };
  }

  // Calculate charge for 1 second of viewing
  const ratePerMinute = stream.ratePerMinute; // e.g., 0.02 USDC/min
  const chargePerSecond = ratePerMinute / 60; // USDC per second
  const chargeBaseUnits = Math.round(chargePerSecond * 1_000_000).toString(); // 6 decimals

  const requirements = createGatewayPaymentRequirements({
    amount: chargeBaseUnits,
    payTo: process.env.GATEWAY_SELLER_ADDRESS!,
    resourceUrl: `/streams/sessions/${sessionId}/watch`,
    description: `Watch ${stream.title} - $${ratePerMinute}/min`,
  });

  return {
    sessionId: session.sessionId,
    streamId: stream.id,
    ratePerMinute: stream.ratePerMinute,
    chargePerSecond: chargeBaseUnits,
    paymentRequirements: requirements,
  };
}
```

#### Task 1.4: Protect watch endpoint with Gateway middleware
**File**: `backend/src/streams/streams.controller.ts` (add endpoint)
```typescript
@Post("sessions/:sessionId/watch")
@UseInterceptors(GatewayMiddleware) // Apply middleware
watchSecond(@Param("sessionId") sessionId: string, @Req() req: any) {
  // If middleware passes, payment was verified and settled
  const session = this.streamsService.getSessionById(sessionId);
  if (!session) {
    return { message: "Session not found" };
  }

  // Record this second as watched (for analytics/receipts)
  this.streamsService.recordWatchSecond(sessionId);

  return {
    sessionId: session.sessionId,
    status: "paid",
    message: "Access granted for 1 second",
  };
}
```

#### Task 1.5: Add GatewayMiddleware to StreamsModule
**File**: `backend/src/streams/streams.module.ts`
```typescript
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StreamsController } from "./streams.controller";
import { StreamsService } from "./streams.service";
import { Stream, StreamSchema } from "./stream.schema";
import { WatchSession, WatchSessionSchema } from "./watch-session.schema";
import { GatewayMiddleware } from "../gateway/gateway.middleware";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stream.name, schema: StreamSchema },
      { name: WatchSession.name, schema: WatchSessionSchema },
    ]),
  ],
  controllers: [StreamsController],
  providers: [StreamsService, GatewayMiddleware],
  exports: [StreamsService],
})
export class StreamsModule {}
```

#### Task 1.6: Update StreamsService for per-second tracking
**File**: `backend/src/streams/streams.service.ts`
- Add `recordWatchSecond(sessionId: string)` method
- Add `secondsWatched` field to `WatchSessionRecord`
- Keep existing session authorization logic (unchanged)

**Verify**: `npm --workspace backend run test` passes.

---

### Phase 2: Frontend - GatewayClient Integration

#### Task 2.1: Create Gateway client wrapper
**File**: `frontend/app/lib/gateway-client.ts` (NEW)
```typescript
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

let gatewayClient: GatewayClient | null = null;

export function getGatewayClient(signerPrivateKey?: string): GatewayClient {
  if (gatewayClient) return gatewayClient;

  const config: any = {
    chain: "arcTestnet",
    rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.io",
  };

  if (signerPrivateKey) {
    config.privateKey = signerPrivateKey as `0x${string}`;
  }

  gatewayClient = new GatewayClient(config);
  return gatewayClient;
}

export async function depositToGateway(amount: string, privateKey: string) {
  const client = getGatewayClient(privateKey);
  return client.deposit(amount);
}

export async function payForStream(url: string, privateKey: string) {
  const client = getGatewayClient(privateKey);
  return client.pay(url);
}

export async function getGatewayBalances(address?: string, privateKey?: string) {
  const client = getGatewayClient(privateKey);
  return client.getBalances(address);
}

export async function withdrawFromGateway(amount: string, privateKey: string, options?: { chain?: string; recipient?: string }) {
  const client = getGatewayClient(privateKey);
  return client.withdraw(amount, options);
}
```

#### Task 2.2: Update watch page to use Gateway pay flow
**File**: `frontend/app/watch/[slug]/page.tsx`
- Replace `handleAuthorizeSession` with Gateway deposit + pay flow
- Add "Deposit to Gateway" button (one-time, shows if wallet balance > 0 but Gateway balance = 0)
- After authorization, poll `/streams/sessions/:sessionId/watch` with Gateway payment
- Show real-time Gateway balance and stream cost

**Key changes**:
```typescript
// After session authorization, get payment requirements
const req = await fetch(`${API_BASE_URL}/streams/sessions/${session.sessionId}/payment-requirements`);
const { paymentRequirements, chargePerSecond } = await req.json();

// Pay for each second (GatewayClient handles 402 flow automatically)
const result = await payForStream(
  `${API_BASE_URL}/streams/sessions/${session.sessionId}/watch`,
  viewerPrivateKey // from wallet - need to extract from wagmi
);
```

**Note**: Frontend needs access to signer for EIP-3009 signing. Use `wagmi`'s `useSignMessage` with `GatewayEvmScheme` pattern, or use `GatewayClient` with private key (for demo only - production should use wallet signing).

#### Task 2.3: Update creator dashboard to use Gateway balances
**File**: `frontend/app/creator/page.tsx`
- Replace contract `claim()` with `GatewayClient.getBalances()` and `withdraw()`
- Show "Gateway Balance" and "Wallet Balance" separately
- Withdraw button calls `withdrawFromGateway()`

```typescript
const { gateway, wallet } = await getGatewayBalances(address, creatorPrivateKey);
// gateway.available = settled funds ready to withdraw
// gateway.pending = funds in current batch
// wallet = on-chain USDC balance
```

#### Task 2.4: Add Gateway deposit UI to watch page
**File**: `frontend/app/watch/[slug]/page.tsx`
- Check Gateway balance on load
- If 0, show "Deposit to Gateway" button with amount input
- On deposit, call `depositToGateway(amount, privateKey)` and wait for tx confirmation

---

### Phase 3: Backend - Settlement Worker (Aggregation)

#### Task 3.1: Create settlement aggregation service
**File**: `backend/src/settlement/gateway-settlement.service.ts` (NEW)
```typescript
import { Injectable } from "@nestjs/common";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Receipt, ReceiptDocument } from "./receipt.schema";

@Injectable()
export class GatewaySettlementService {
  private facilitator = new BatchFacilitatorClient({
    facilitatorUrl: process.env.GATEWAY_FACILITATOR_URL,
  });

  constructor(
    @InjectModel(Receipt.name) private receiptModel: Model<ReceiptDocument>,
  ) {}

  async settlePendingReceipts() {
    const pending = await this.receiptModel
      .find({ settled: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(100)
      .exec();

    for (const receipt of pending) {
      try {
        // Gateway settle expects the full payment payload
        // For nanopayments, we settle each receipt individually via facilitator
        const requirements = createGatewayPaymentRequirements({
          amount: receipt.charge, // already in base units
          payTo: process.env.GATEWAY_SELLER_ADDRESS!,
          resourceUrl: `/streams/sessions/${receipt.sessionId}/watch`,
        });

        // Note: In production, buyer submits payment directly to seller endpoint
        // This service would handle any failed settlements or reconciliation
        await this.receiptModel.findByIdAndUpdate(receipt._id, {
          settled: true,
          settledAt: new Date(),
        });
      } catch (error) {
        console.error(`Failed to settle receipt ${receipt.receiptId}`, error);
      }
    }
  }

  async getCreatorGatewayBalance(creatorWallet: string) {
    // This would query Gateway API for the seller's balance
    // For now, return aggregated receipts
    const receipts = await this.receiptModel
      .find({ creatorWallet, settled: true })
      .exec();

    const total = receipts.reduce((sum, r) => sum + parseFloat(r.charge), 0);
    return {
      totalReceived: total.toFixed(6),
      receiptCount: receipts.length,
    };
  }
}
```

#### Task 3.2: Register settlement service and add cron job
**File**: `backend/src/settlement/settlement.module.ts`
```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Receipt.name, schema: ReceiptSchema },
      { name: PayoutClaim.name, schema: PayoutClaimSchema },
    ]),
  ],
  controllers: [SettlementController],
  providers: [SettlementService, GatewaySettlementService],
  exports: [SettlementService, GatewaySettlementService],
})
export class SettlementModule {}
```

**File**: `backend/src/main.ts` (add scheduled settlement)
```typescript
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { GatewaySettlementService } from "./settlement/gateway-settlement.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);

  // Run settlement every 60 seconds
  const settlementService = app.get(GatewaySettlementService);
  setInterval(() => settlementService.settlePendingReceipts(), 60_000);
}

bootstrap();
```

---

### Phase 4: Documentation Updates

#### Task 4.1: Update ARCHITECTURE.md
**File**: `docs/ARCHITECTURE.md`
```markdown
# Prawr Architecture

## High-level design
Prawr separates the viewer experience from the creator experience.

### Viewer experience
- Public homepage for live discovery
- Stream cards showing title, creator, category, rate, and live status
- /watch/{slug} route for a locked access flow
- Wallet authorization before a paid viewing session
- **Gasless per-second payments via Circle Gateway Nanopayments (x402/EIP-3009)**
- **Real-time settlement with batched on-chain finality**

### Creator experience
- Protected /creator application
- Stream creation and editing
- **Earnings tracked in Gateway balance (instant credit after batch settlement)**
- Withdrawals via Gateway to any supported chain
- Access to stream share links and analytics

## Core payment flow
1. Creator publishes stream metadata and rate.
2. Viewer browses and selects a stream.
3. Viewer deposits USDC to Gateway Wallet (one-time, on-chain).
4. Viewer authorizes a session cap (signed message).
5. **Viewer watches stream; frontend pays per-second via Gateway `pay()` (gasless).**
6. **Backend verifies each payment via Gateway `settle()` API (batched).**
7. **Creator Gateway balance updates in real-time; withdraw anytime via `GatewayClient.withdraw()`.**

## Recommended stack
- Frontend: Next.js + Tailwind + wagmi + ConnectKit + viem + @circle-fin/x402-batching
- Backend: NestJS + TypeScript + MongoDB + Mongoose + @circle-fin/x402-batching
- Contracts: **Deprecated** - Gateway Nanopayments replaces custom settlement contract
- Settlement rail: Circle Gateway Nanopayments (gasless, batched, x402 standard)

## Critical design rule
The frontend counter is UX only. The backend must derive the real billable amount from validated session and receipt state, not from a client timer. Gateway settlement provides cryptographic proof of payment per second.
```

#### Task 4.2: Update PAYMENT_FLOW.md
**File**: `docs/PAYMENT_FLOW.md`
```markdown
# Payment Flow

## Session authorization
A viewer signs an authorization that includes the stream and maximum charge for a specific session. This is not a blockchain settlement, and it is not a per-second payment. It is a session-level spend cap.

## Gateway deposit (one-time)
Before watching, the viewer deposits USDC into the Gateway Wallet contract on Arc Testnet.
- One on-chain transaction (pays gas)
- Funds held in Gateway balance for gasless payments
- Uses `GatewayClient.deposit(amount)`

## Per-second payment (x402 + Gateway)
1. Frontend requests `/streams/sessions/:sessionId/payment-requirements` → gets x402 requirements with Gateway `extra` metadata
2. Frontend calls `GatewayClient.pay(watchEndpoint)` for each second
3. `GatewayClient` handles 402 flow: signs EIP-3009 `TransferWithAuthorization`, retries with `PAYMENT-SIGNATURE` header
4. Backend Gateway middleware verifies signature and settles via Gateway API
5. Backend records receipt, increments session `secondsWatched`

## Receipt validation
Each receipt must:
- match stream and session IDs
- be backed by a verified Gateway settlement (paymentRequirements matched)
- include the correct creator identity
- be monotonic with cumulative accounting
- remain below the maximum authorization
- not be expired
- not be a replay of a prior valid receipt

## Aggregation
Receipts accumulate and are rolled into settlement checkpoints. Gateway handles batched on-chain settlement automatically.

## Settlement
Circle Gateway Nanopayments for batched, gasless settlement. No custom contract needed.
- Creator earnings accumulate in Gateway balance
- Withdraw via `GatewayClient.withdraw()` to any supported chain
- Cross-chain withdrawals supported
```

#### Task 4.3: Update SMART_CONTRACTS.md
**File**: `docs/SMART_CONTRACTS.md`
```markdown
# Smart Contracts

## Status: DEPRECATED
The custom `PrawrSettlement.sol` contract is **deprecated** in favor of Circle Gateway Nanopayments.

## Why Gateway Nanopayments
- Gasless payments for viewers (EIP-3009 off-chain signatures)
- Batched settlement (thousands of payments per on-chain transaction)
- x402 standard compliance (interoperable)
- Cross-chain withdrawals
- Circle-managed infrastructure (no contract maintenance)

## Historical contract (for reference)
The contract in `contracts/src/PrawrSettlement.sol` implemented a non-custodial Arc session-escrow slice. It was an experimental foundation, not production-ready payment accounting.

### Contract responsibilities (historical)
- let viewers fund a session cap directly from their wallet
- bind each escrow to its viewer, creator, cap, and expiry
- let the configured operator finalize at most once and never above the funded cap
- credit unused funds to a viewer refund balance, claimable after finalization or expiry
- hold creator claimable balances and restrict withdrawals to credited amounts
- expose session, refund, and claim events for indexing

## Migration path
All settlement logic moved to:
- Backend: `GatewaySettlementService` + `createGatewayMiddleware`
- Frontend: `GatewayClient` for deposit/pay/withdraw/balance
- No smart contract deployment required for MVP
```

#### Task 4.4: Update README.md
**File**: `README.md` - Update "Arc Testnet setup" and "Architecture highlights" sections to reflect Gateway Nanopayments flow. Remove contract deployment instructions. Add Gateway deposit instructions.

---

### Phase 5: End-to-End Verification

#### Task 5.1: Start all services
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

#### Task 5.2: Manual test checklist
1. **Homepage** → Click stream → `/watch/arc-market-briefing`
2. **Connect wallet** (ConnectKit) → Arc Testnet
3. **Deposit to Gateway** → Enter amount (e.g., "5" USDC) → Confirm tx → Wait for confirmation
4. **Authorize session** → Sign message → Session created
5. **Watch** → Timer runs, frontend calls `pay()` per second → Gateway balance decreases
6. **Stop watching** → Session ends, final cost shown
7. **Creator dashboard** → Connect creator wallet → Shows Gateway balance
8. **Withdraw** → Click withdraw → Funds move to wallet → Confirm on Arc Testnet Explorer

#### Task 5.3: Verify Gateway settlement
```bash
# Check Gateway balance via API
curl -H "Authorization: Bearer $GATEWAY_API_KEY" \
  https://gateway.circle.com/v1/balances?address=$SELLER_ADDRESS

# Check on-chain Gateway Wallet contract
cast call $GATEWAY_WALLET_ADDRESS "balanceOf(address)" $SELLER_ADDRESS --rpc-url https://rpc.testnet.arc.io
```

---

### Phase 6: Cleanup & Polish

#### Task 6.1: Remove deprecated contract files (optional)
- `contracts/src/PrawrSettlement.sol` → archive or delete
- `contracts/test/PrawrSettlement.t.sol` → archive or delete
- `contracts/script/DeployPrawrSettlement.s.sol` → archive or delete
- Update `contracts/foundry.toml` if needed

#### Task 6.2: Remove SettlementController contract endpoints
**File**: `backend/src/settlement/settlement.controller.ts` - Remove `/claim` and `/claim/finalize` endpoints (replaced by Gateway withdraw)

#### Task 6.3: Update tests
- Backend tests: Mock Gateway facilitator client
- Frontend tests: Mock GatewayClient
- Contract tests: Archive or update to test Gateway integration

---

## Tests / Validation

### Backend
```bash
npm --workspace backend run test
npm --workspace backend run lint
npm --workspace backend run build
```

### Frontend
```bash
npm --workspace frontend run lint
npm --workspace frontend run build
```

### Contract (optional - deprecated)
```bash
cd contracts && arc-forge test --network arc
```

### Integration
```bash
# Start backend + frontend
npm run dev:backend &
npm run dev:frontend &

# Test payment requirements endpoint
curl http://localhost:3001/streams/sessions/<sessionId>/payment-requirements

# Test watch endpoint (requires valid payment signature)
# Use GatewayClient.pay() from frontend or manual curl with PAYMENT-SIGNATURE header
```

---

## Risks, Tradeoffs, and Open Questions

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Gateway API rate limits / downtime | Payments fail | Retry logic, fallback to direct contract (future) |
| EIP-3009 signing complexity on frontend | UX friction | Use `GatewayClient` abstraction; document wallet signing flow |
| 7-day `validBefore` requirement | Auth expires | Frontend re-signs auth before expiry |
| No ERC-1271 support | Smart contract wallets excluded | Document limitation; standard Gateway transfers support ERC-1271 |
| Testnet USDC faucet limits | Can't fund Gateway | Use multiple faucets; document alternatives |

### Tradeoffs
1. **Gateway vs Custom Contract**: Gateway adds external dependency but removes gas UX friction and contract maintenance. Correct choice for MVP.
2. **Per-second payments**: More API calls but real-time UX. Could batch client-side (e.g., pay every 10s) for optimization.
3. **Seller address**: Single `GATEWAY_SELLER_ADDRESS` receives all payments. Creator payouts are off-chain accounting + Gateway withdraw. Simpler than per-creator contracts.

### Open Questions
1. **Creator payout splitting**: How to split Gateway balance among multiple creators? Options: (a) single seller address, backend tracks shares, creator withdraws via backend API that calls `GatewayClient.withdraw()` to their address; (b) each creator has own Gateway deposit. **Recommend (a) for MVP**.
2. **Session cap enforcement**: Backend must track cumulative payments per session and reject when cap reached. Add check in `watchSecond()`.
3. **Refunds**: Unused session cap → viewer can withdraw from Gateway balance themselves via `GatewayClient.withdraw()`.
4. **Gateway API key rotation**: Plan for key rotation in production.

---

## Implementation Order Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 0 | Deps, .env files, MongoDB | 30 min |
| 1 | Backend Gateway middleware + payment requirements | 60 min |
| 2 | Frontend GatewayClient + watch/creator UX | 90 min |
| 3 | Settlement worker + reconciliation | 45 min |
| 4 | Documentation updates | 30 min |
| 5 | E2E manual test | 30 min |
| 6 | Cleanup deprecated code | 30 min |
| **Total** | | **~5.5 hours** |

---

## Notes for Implementer

- **TDD cycle per task**: Write failing test → run → implement minimal code → run → pass → commit
- **Gateway SDK**: `@circle-fin/x402-batching` is the only package needed (buyer + seller)
- **USDC decimals**: 6 on Arc (not 18). `parseUnits("0.01", 6)` = 10000 base units
- **Chain ID**: Arc Testnet = 5042002 (EVM), CAIP-2 = `eip155:5042002`
- **Gateway Wallet verifyingContract**: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` (Arc Testnet)
- **Frontend signing**: For production, use wallet-based signing (wagmi `useSignTypedData`) not private key. Demo can use private key for simplicity.
- **Middleware order**: Gateway middleware must run BEFORE route handler to return 402 if unpaid
- **Payment requirements**: Must include `extra.verifyingContract` for Gateway EIP-712 domain
- **Commit frequently**: One logical change per commit with conventional messages