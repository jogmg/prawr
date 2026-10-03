# Prawr

Prawr is a decentralized micropayment streaming MVP built on Arc. The project is intentionally structured as a monorepo with three main areas:

- backend: NestJS service for creators, streams, viewer sessions, receipts, and settlement aggregation
- frontend: Next.js app for the public viewer homepage and protected creator dashboard
- contracts: Solidity/Foundry contract scaffolding for settlement and creator payout logic

## Current status

This repository is the initial implementation scaffold for Phase 1 and the early architecture baseline. It includes:

- Arc-first project structure
- backend service skeleton
- frontend app skeleton
- contract skeleton for settlement logic
- project docs and architecture notes

## Getting started

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

## Arc network setup

The frontend defaults to Arc Testnet (chain ID `5042002`) and can be switched
to Arc Mainnet (chain ID `5042`) with the guarded settings below. Before using
the wallet or deploying the settlement contract, copy the app examples and fill
in your local values:

```powershell
Copy-Item frontend/.env.example frontend/.env
Copy-Item contracts/.env.example contracts/.env
```

`frontend/.env` is read by Next.js. Set these values there:

- `NEXT_PUBLIC_ARC_NETWORK` selects `arcTestnet` or `arc`; it defaults to
  Testnet. To enable Mainnet, also set `NEXT_PUBLIC_ALLOW_MAINNET=true`.
- `NEXT_PUBLIC_ENABLE_SESSION_ESCROW` is a Testnet-only development switch. It
  defaults to `false`; only enable it after deploying the escrow contract to
  Arc Testnet. Mainnet escrow writes are intentionally disabled until backend
  metering, finalization, reconciliation, and security review are complete.
- `NEXT_PUBLIC_ARC_RPC_URL` overrides the RPC for the selected network. Without
  an override, the app uses `https://rpc.testnet.arc.io` on Testnet and
  `https://rpc.mainnet.arc.io` on Mainnet.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is the project ID for WalletConnect
  wallet discovery. Create one in the [Reown dashboard](https://dashboard.reown.com/).
- `NEXT_PUBLIC_PRAWR_SETTLEMENT_ADDRESS_ARC_TESTNET` and
  `NEXT_PUBLIC_PRAWR_SETTLEMENT_ADDRESS_ARC` are separate deployed contract
  addresses. Writes remain disabled until the selected network has a valid
  contract address and bytecode.
- `NEXT_PUBLIC_API_BASE_URL` points the frontend to the NestJS API.

`contracts/.env` is used only when deploying from the contracts directory with
Arc Foundry:

- `ARC_NETWORK` must be `arcTestnet` or `arc`; the deployment script checks the
  RPC chain ID matches the selected network.
- `ALLOW_MAINNET` must be set to `true` to deploy to Arc Mainnet. Leave it
  `false` for development.
- `ARC_TESTNET_RPC_URL` is the endpoint used to deploy and query Arc Testnet.
- `ARC_MAINNET_RPC_URL` is the endpoint used to deploy and query Arc Mainnet.
- `ARC_TESTNET_PRIVATE_KEY` is the key for a dedicated, disposable Testnet
  deployer wallet. Generate it with `arc-cast wallet new`; never reuse it on
  Mainnet or commit it.
- `ARC_MAINNET_PRIVATE_KEY` is separate and should only be added to a protected
  deployment environment for an explicitly approved Mainnet deployment. Do not
  copy the Testnet key into this variable.
- `SETTLEMENT_OPERATOR` is the address of the Circle Developer-Controlled EOA
  that the backend will use to finalize capped sessions. It is set as an
  immutable contract operator at deployment; it can be different from the
  deployer wallet. The current backend does not yet submit these transactions.
- `PRAWR_SETTLEMENT_ADDRESS` records the deployment output for your own notes.
  The deploy command does not consume it.

Install [Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry),
then get testnet USDC for the deployer from the [Circle faucet](https://faucet.circle.com/)
(select Arc Testnet). Arc uses native USDC for transaction value and gas. For
this contract, values passed as `msg.value` use 18 decimals; the optional USDC
ERC-20 interface at `0x3600000000000000000000000000000000000000` uses 6 decimals.

From `contracts/`, load the local settings and deploy:

```bash
set -a
source .env
set +a
if [ "$ARC_NETWORK" = "arc" ]; then
  RPC_URL="$ARC_MAINNET_RPC_URL"
else
  RPC_URL="$ARC_TESTNET_RPC_URL"
fi
arc-forge test --network arc
arc-forge script script/DeployPrawrSettlement.s.sol:DeployPrawrSettlement \
	--rpc-url "$RPC_URL" \
	--broadcast
```

Copy the `Deployed to` address from the output into the matching network address
variable in `frontend/.env`, then restart the frontend so Next.js includes the
value. Confirm the deployment on the selected Arc explorer.

The backend now meters elapsed time from server-received heartbeats, excludes
paused time, caps accepted heartbeat gaps at 30 seconds, and stops at the signed
session cap. Session state and access tokens are in memory and reset on restart.
Heartbeats are client signals, not proof that video played; the backend does not
yet verify escrow funding onchain, persist sessions, or submit finalization
transactions. The public arbitrary receipt-creation endpoint remains disabled.
Do not enable escrow funding for real funds. The Arc settings in
`backend/.env.example` are placeholders; the backend does not yet load `.env`
files or submit chain transactions.

## Architecture highlights

- Public viewer homepage and watch flow in Next.js
- Creator dashboard under /creator
- Protected stream access and monetization flow
- Arc USDC settlement compatibility
- Viewer-funded capped Arc session escrow
- Circle Gateway Nanopayments remains a possible rail for discrete paid resources, not streaming session settlement
- Durable session state, playback verification, escrow-funding verification, and operator finalization remain unfinished

## Documentation

See the docs folder for the architecture and payment flow notes.
