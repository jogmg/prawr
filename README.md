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

## Arc Testnet setup

The frontend wallet targets Arc Testnet (chain ID `5042002`). Before using the
wallet or deploying the settlement contract, copy the app examples and fill in
your local values:

```powershell
Copy-Item frontend/.env.example frontend/.env
Copy-Item contracts/.env.example contracts/.env
```

`frontend/.env` is read by Next.js. Set these values there:

- `NEXT_PUBLIC_ARC_RPC_URL` is the public Arc Testnet RPC used by wagmi/viem.
  The default is `https://rpc.testnet.arc.io`; use a provider URL instead if
  you have one.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is the project ID for WalletConnect
  wallet discovery. Create one in the [Reown dashboard](https://dashboard.reown.com/).
- `NEXT_PUBLIC_PRAWR_SETTLEMENT_ADDRESS` is the deployed Prawr settlement
  contract address. Leave it empty until deployment; payout actions stay
  disabled without it.
- `NEXT_PUBLIC_API_BASE_URL` points the frontend to the NestJS API.

`contracts/.env` is used only when deploying from the contracts directory with
Arc Foundry:

- `ARC_TESTNET_RPC_URL` is the endpoint used to deploy and query Arc Testnet.
- `PRIVATE_KEY` is the private key for a dedicated, disposable testnet deployer
  wallet. Generate a new key with `arc-cast wallet new`; never use a mainnet
  wallet key, commit this value, or send it to the browser.
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
arc-forge test --network arc
arc-forge script script/DeployPrawrSettlement.s.sol:DeployPrawrSettlement \
	--rpc-url "$ARC_TESTNET_RPC_URL" \
	--private-key "$PRIVATE_KEY" \
	--broadcast
```

Copy the `Deployed to` address from the output into
`frontend/.env` as `NEXT_PUBLIC_PRAWR_SETTLEMENT_ADDRESS`, then restart the
frontend so Next.js includes the value. Confirm the deployment on the [Arc
Testnet Explorer](https://explorer.testnet.arc.io/).

The contract and creator claim UI are wired, but live receipt settlement is not
enabled. The public receipt-creation endpoint is intentionally unavailable until
the backend implements server-side playback metering and signed cumulative
receipt validation; the current in-memory service does not do that. Do not fund
an operator or use real funds until that path is implemented and tested. The
Arc settings in `backend/.env.example` are placeholders for a future worker; the
current backend reads `PORT` from the process environment and does not load
`.env` files or submit chain transactions.

## Architecture highlights

- Public viewer homepage and watch flow in Next.js
- Creator dashboard under /creator
- Protected stream access and monetization flow
- Arc USDC settlement compatibility
- Circle Gateway Nanopayments preferred for batched micropayments
- Server-side metering and receipt validation for correctness

## Documentation

See the docs folder for the architecture and payment flow notes.
