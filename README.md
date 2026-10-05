# Prawr

Prawr is a decentralized micropayment streaming MVP built on Arc. The project is intentionally structured as a monorepo with three main areas:

- backend: NestJS service for creators, streams, viewer sessions, receipts, and settlement aggregation
- frontend: Next.js app for the public viewer homepage and protected creator dashboard
- contracts: Solidity/Foundry contract scaffolding for settlement and creator payout logic

## Current status

The Arc Testnet MVP currently supports Mongo-backed stream discovery, creator stream management, direct MP4/WebM playback, wallet-signed session caps, per-second Circle Gateway x402 payments during active playback, and persisted payment receipts. Creator summaries read those receipts, and Gateway payments are addressed to the stream creator's wallet.

Video hosting and live ingest are not implemented. A creator must provide a publicly reachable direct MP4 or WebM URL that the viewer's browser can play. The player pauses metering while paused or buffering. The settlement contract remains scaffolding; Gateway receipts are not rolled into contract payouts.

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
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
Copy-Item contracts/.env.example contracts/.env
```

Start MongoDB locally or set `MONGODB_URI` in `backend/.env`. Nest loads this
file through `ConfigModule`; the API defaults to port `3001`.

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

Set `GATEWAY_API_KEY` and the optional fallback recipient in `backend/.env`,
with `GATEWAY_FACILITATOR_URL=https://gateway-api-testnet.circle.com`. Keep
Circle credentials server-side; never use a `NEXT_PUBLIC_` variable for a
secret. Gateway payments are sent to each stream's `creatorWallet`, so create a
test stream with the connected creator wallet address.

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

Connect the creator wallet in `/creator` and use **Create Stream** to save a
title, category, rate, and publicly reachable direct MP4/WebM playback URL. The
homepage and watch route then use the Mongo-backed stream ID. Each successful
Gateway-paid second while the video is playing creates a receipt in MongoDB.
This is testnet code only and has not been validated with live Circle
credentials; use testnet funds only. The Arc contract deployment settings are
separate and do not participate in the current Gateway watch flow.

## Architecture highlights

- Public viewer homepage and watch flow in Next.js
- Creator dashboard under /creator
- Protected stream access and monetization flow
- Arc USDC settlement compatibility
- Circle Gateway Nanopayments preferred for batched micropayments
- Server-side metering and receipt validation for correctness

## Documentation

See the docs folder for the architecture and payment flow notes.
