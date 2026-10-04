# Gateway Nanopayments MVP: Status and Handoff Plan

**Audit date:** 2026-10-03  
**Branch:** `feat/alt-wallet`  
**Reference:** `.hermes/plans/2026-10-03_153000-gateway-nanopayments-mvp-plan.md`

## Handoff Notes

- The working tree is heavily modified and uncommitted. Treat its current contents as the active implementation; do not reset, checkout, or overwrite existing edits.
- Local `.env`, `backend/.env`, `frontend/.env`, and `contracts/.env` files exist. Their values were not inspected. Do not print or commit secrets.
- The root production build and backend tests pass, but this is not evidence of a live Gateway/Arc E2E run.
- Do not implement the old Phase 3 pseudocode as written. The watch endpoint's `createGatewayMiddleware` already verifies and settles each x402 payment inline. A second worker that marks receipts settled without submitting payment payloads would be incorrect.

## Status Summary

| Area                                  | Status                          | Evidence / remaining                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0: dependencies and persistence | Mostly complete                 | Gateway dependencies, env examples, Mongo root connection, stream/session/receipt schemas exist. Backend `.env` loading is not configured in source.                                                    |
| Phase 1: x402 server                  | Partially complete              | Middleware, per-second price gate, session cap checks, wallet binding, and Mongo receipts exist. Metering paths still conflict; requirement helper/preview is not the actual x402 requirement response. |
| Phase 2: viewer/creator client        | Partially complete              | Wallet-backed deposits, x402 signing, balance fetch, and withdrawal code exist. Creator balance/withdraw does not match the centralized seller address; dashboard still uses legacy in-memory receipts. |
| Phase 3: settlement/accounting        | Not complete; redesign required | Gateway handles payment settlement inline. Mongo receipts are written, but there is no durable creator earnings/claim ledger or dashboard query over those receipts.                                    |
| Phase 4: documentation                | Not complete                    | README and architecture/payment/smart-contract/testing docs still describe the old contract/fallback flow.                                                                                              |
| Phase 5: testnet E2E                  | Not done                        | No live wallet, deposit, x402 pay, Gateway settlement, creator balance, or withdrawal was verified.                                                                                                     |
| Phase 6: legacy cleanup               | Not done                        | Solidity contract/deployment files and legacy claim/finalize API remain. Removal is optional; document deprecation before deciding to delete.                                                           |

## Detailed Checklist

### Phase 0: Foundation and Configuration

- **0.1 Dependencies: COMPLETE.** `@circle-fin/x402-batching` is installed in backend and frontend. Root workspaces include backend and frontend.
- **0.2 Env examples: PARTIAL.** Backend, frontend, and contracts examples contain Gateway/Arc values. Local `.env` files exist, but values were intentionally not inspected. Backend code reads `process.env` directly and does not load `.env`; startup currently depends on the environment being injected externally. `NEXT_PUBLIC_GATEWAY_API_KEY` is present in the frontend example; never put a secret key in a `NEXT_PUBLIC_*` variable. The current browser wrapper does not use it.
- **0.3 MongoDB: COMPLETE, runtime unverified.** `MongooseModule.forRoot()` is configured and stream, session, and Gateway receipt schemas are registered. No live Mongo connection was tested in this audit.

### Phase 1: Backend x402 Resource Server

- **1.1 Payment requirements helper: PARTIAL.** `backend/src/gateway/gateway.config.ts` defines a requirements-shaped object, but the helper is not used by the middleware or payment-requirements route. The route returns a price/network preview; actual requirements are emitted by the x402 middleware's 402 response.
- **1.2 Gateway middleware: IMPLEMENTED, E2E UNVERIFIED.** `backend/src/gateway/gateway.middleware.ts` creates Circle Gateway middleware and binds `authorization.from` to the session wallet before verification. It also passes Gateway API configuration from backend env.
- **1.3 Requirements endpoint: PARTIAL.** `GET /streams/sessions/:sessionId/payment-requirements` checks session/stream and returns a preview. Frontend payment currently relies on the 402 response from the protected watch endpoint, not a complete requirements object from this route.
- **1.4 Paid watch route: PARTIAL.** `POST /streams/sessions/:sessionId/watch` gates a per-second price, checks playing state/cap, rejects mismatched payment amount/payer, updates session accounting, and returns transaction metadata. The process-local `activePayments` set is not cross-process serialization. Receipt creation follows session save without an atomic transaction/idempotency strategy.
- **1.5 Module registration: COMPLETE.** `StreamsModule` registers stream, session, Gateway receipt models and imports GatewayModule.
- **1.6 Per-second tracking: PARTIAL.** Session/stream state and Gateway receipts are modeled in Mongo. Paid ticks update session charge and seconds. Existing heartbeat/pause/stop methods still add elapsed time and recalculate charge, so Gateway-paid amounts are not yet the sole source of truth (see P0 next steps).

### Phase 2: Frontend Gateway Flow

- **2.1 Client wrapper: IMPLEMENTED VIA A DIFFERENT WALLET-SAFE APPROACH.** `frontend/app/lib/gateway-client.ts` uses Circle's `BatchEvmScheme` with x402 core and a wagmi-provided signer for micropayments. Deposits use connected-wallet ERC-20 approval plus Gateway deposit. It does not use `GatewayClient`, which requires a private key. Withdrawal implements the Gateway transfer/burn-intent signature flow with the connected wallet. Builds pass, but no chain transaction was manually validated.
- **2.2 Watch flow: PARTIAL.** The watch page authorizes/starts a session and pays through x402 once per second. It has no in-flight browser guard; slow requests can overlap and receive backend 409 responses. Payment failures are logged but do not present a recoverable payment state. It does not refresh displayed balance after every payment.
- **2.3 Creator dashboard: PARTIAL/BLOCKED BY PAYOUT MODEL.** It reads legacy creator summaries plus a Gateway balance for the connected creator wallet, and can withdraw from that wallet. Payments are currently addressed to `GATEWAY_SELLER_ADDRESS`, so the creator wallet balance is not necessarily where stream earnings accumulate. The legacy summary is in-memory and does not query `gateway_receipts`.
- **2.4 Deposit UI: IMPLEMENTED, E2E UNVERIFIED.** Watch page exposes a deposit amount and calls the connected wallet flow; approval/deposit wait for receipts. Test with actual Arc Testnet USDC before relying on it.

### Phase 3: Aggregation and Reconciliation

- **3.1/3.2 Worker and cron: NOT IMPLEMENTED; DO NOT COPY THE DRAFT VERBATIM.** Gateway middleware already performs verification and settlement. Implement durable accounting/reconciliation over `gateway_receipts` instead of a second settlement worker. The original example worker did not actually settle payments and would mark records settled without a facilitator settlement call.
- Creator earnings, reserved/paid-out amounts, claims, and reconciliation need a durable model and authenticated API/UI. Decide first whether this MVP uses one creator wallet, per-creator Gateway recipients, or a pooled seller wallet with a secure backend payout signer.

### Phases 4-6

- **Phase 4: NOT DONE.** `README.md`, `docs/ARCHITECTURE.md`, `docs/PAYMENT_FLOW.md`, `docs/SMART_CONTRACTS.md`, `docs/TESTING.md`, and `docs/ARC_TESTNET.md` still include the custom-contract/fallback or old receipt/heartbeat narrative. Update them only after selecting the actual seller/payout model.
- **Phase 5: NOT DONE.** No manual testnet path has been completed. Environment file presence is not configuration validation.
- **Phase 6: NOT DONE.** `contracts/src/PrawrSettlement.sol`, its tests/deploy script, `/settlement/claim`, `/settlement/claim/finalize`, and legacy in-memory payout code remain. Keep until docs mark the contract historical and the replacement payout path is tested; then decide whether to archive/remove.

## Ordered Next Work

### P0: Make Paid Usage Authoritative

1. Change Gateway-mode pause/stop/heartbeat behavior so it never adds un-paid elapsed time or overwrites the cumulative amount charged from successful Gateway payments. Preserve heartbeat metering only if a separate non-Gateway mode still needs it.
2. Add regression tests for stop/pause after paid ticks, cap boundary, and failed/no-payment ticks. Verify final seconds and charge equal persisted paid receipts, subject to rounding policy.
3. Replace or supplement the browser `setInterval` loop with one request at a time. Surface payment errors and stop/retry deliberately rather than silently retrying every second.

**Acceptance:** stopping a session cannot increase its Gateway charge beyond the sum of verified settled payments; cap and display match persisted values.

### P1: Choose and Implement Creator Settlement Ownership

Before implementing payout UI, choose one model and record it in the docs:

- **Single-creator test MVP:** configure `GATEWAY_SELLER_ADDRESS` as that creator's wallet and verify balance/withdraw on that same address. This does not support multiple creators.
- **Per-creator recipient model:** issue each stream's x402 requirements to that creator's Gateway address and bind the Gateway middleware to the same recipient. Each creator can then withdraw their own Gateway balance. Validate whether the deployed Gateway facilitator/sdk supports this runtime recipient flow.
- **Pooled seller model:** retain one seller wallet, create durable creator earnings/claim accounting, authenticate creator claims, and implement a secure backend-controlled payout process. This requires custody/key-management decisions; never expose the seller private key in frontend env or source.

Do not claim creator withdrawals are complete until the dashboard reads the recipient balance that actually receives the settled payments and the withdrawal signer controls that balance.

### P1: Durable Receipt and Earnings Integration

1. Add a creator receipt/earnings API backed by `gateway_receipts`; replace the dashboard's legacy in-memory summary for Gateway payments.
2. Define receipt identity/idempotency and failure recovery. The current service saves session totals and then creates a receipt in separate writes; define behavior if receipt creation fails after settlement and prevent duplicate accounting/replay.
3. Add creator attribution, payout state, and reconciliation against Gateway settlement metadata. Do not add a cron worker that re-settles payments already settled by middleware.

### P2: Runtime Configuration and Validation

1. Load backend `.env` using the project-standard config mechanism and validate required Gateway seller/facilitator/chain values at startup.
2. Remove `NEXT_PUBLIC_GATEWAY_API_KEY` from the frontend example; document that Circle secrets belong server-side. Keep non-secret RPC/contract values public as appropriate.
3. Fix backend lint invocation/config so generated `backend/dist` is ignored and source files are linted. Current `npm --workspace backend run lint` fails because ESLint cannot find a configuration while traversing `backend/dist`.
4. Add controller/middleware integration tests for 402 response, valid paid request, payer mismatch rejected before settlement, and facilitator failure. Current tests cover service accounting, not x402 HTTP behavior.

### P2: Docs and Legacy Status

After the architecture is chosen, update README plus `docs/ARCHITECTURE.md`, `docs/PAYMENT_FLOW.md`, `docs/SMART_CONTRACTS.md`, `docs/TESTING.md`, and `docs/ARC_TESTNET.md`. Explicitly state whether the contract is historical, how creator payouts work, required server/client env values, and what is or is not tested. Remove contract deployment instructions only after confirming the replacement path.

### P3: Arc Testnet Manual E2E

Run backend with reachable MongoDB and configured server-only Gateway settings, then frontend with Arc Testnet wallet configuration. Verify in order:

1. Connect viewer wallet on Arc Testnet and confirm native USDC wallet balance.
2. Deposit a small test amount; confirm approval/deposit transaction and Gateway balance.
3. Sign session authorization and create/start session.
4. Make one paid watch request; verify Circle 402/retry/settlement, response transaction, persisted session charge/seconds, and durable Mongo receipt.
5. Pay several more seconds, stop, and confirm stop does not add un-paid time.
6. Verify creator earnings and balance at the chosen actual recipient; withdraw and verify the transaction on Arc Testnet Explorer.
7. Record tx hashes, config shape (never secrets), expected/actual amounts, and any facilitator/API issues in the docs.

## Current Verification Snapshot

- `npm --workspace backend run test -- --runInBand`: PASS, 18 tests across 3 suites.
- `npm run build`: PASS for backend and frontend.
- `npm --workspace frontend run lint`: PASS with the existing `<img>` optimization warning in `frontend/app/page.tsx`.
- `npm --workspace backend run lint`: FAIL; ESLint cannot find a config while traversing generated `backend/dist`.
- Live Mongo, Circle Gateway, Arc deposit/payment/withdrawal, and E2E: NOT RUN.
- Frontend build warnings: missing optional `@react-native-async-storage/async-storage` and `pino-pretty` modules through wallet connector dependency traces; build still succeeds.

## Important Implementation Notes

- USDC uses 6 decimals. Gateway middleware `payment.amount` is atomic units; the controller compares against `parseUnits(price, 6)` and converts with `formatUnits`.
- `gateway.config.ts` is currently not the source of requirements returned by the protected route; x402 requirements are generated by middleware from `require(price)`.
- Session authorization currently uses a personal-sign message (`signMessageAsync` / `recoverMessageAddress`), not EIP-712. Keep the implementation/docs consistent if that choice remains.
- `activePayments` is only process-local; it is not a durable or multi-instance lock.
- Gateway middleware settles before the controller handler. Payer identity is checked by the middleware's `onBeforeVerify` hook; keep this pre-settlement check in place.
- Avoid committing or exposing private keys, API keys, or local `.env` files. Preserve the existing dirty worktree while continuing.
