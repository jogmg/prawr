# Prawr

![Prawr project banner](frontend/public/assets/og-image.png)

Prawr is a live-streaming platform project built around small, pay-as-you-watch payments.

## About

Prawr connects creators and viewers through a public stream directory, a creator dashboard, and a wallet-based viewing flow. The current app uses Arc Mainnet and Circle Gateway x402 to charge for prepaid blocks of viewing time. Stream data, watch sessions, and payment receipts are stored by a NestJS backend in MongoDB, while a Next.js frontend provides the viewer and creator experiences.

The app currently plays Twitch and YouTube embeds, HLS (`.m3u8`), and direct MP4/WebM sources. Creators provide an existing playback URL. That URL is sent to the browser and can be found in API responses, player details, or network requests. The app does not yet host video or provide a direct creator broadcasting service. This is an MVP, not a production-ready payment service.

## Table Of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Goal](#goal)
- [Project Status](#project-status)
- [In Progress And Next](#in-progress-and-next)
- [Network And Secrets](#network-and-secrets)
- [Project Areas](#project-areas)
- [Maintainers](#maintainers)
- [Contributing](#contributing)

## Background

The original payment idea was to send a tiny payment directly from a viewer's wallet to the creator for every second watched, without requiring the viewer to fund a separate balance first. Research and a partial implementation exposed practical problems:

- Asking the wallet to approve every payment would interrupt playback. Avoiding repeated approval prompts requires additional wallet or smart-contract support.
- Blockchain transactions can take longer than one second to submit and confirm, so they cannot reliably settle in sync with each second of video.
- Network fees and transaction overhead can cost more than a tiny viewing payment.
- Payments depend on the viewer's wallet, network connection, and available funds. A rejected or delayed payment makes it harder to decide whether playback should continue.
- Retries, pending transactions, and matching payment records to exact playback time add complexity and can cause accounting mismatches.

The current app uses Circle Gateway x402 to batch small payment requests and grant prepaid viewing time. Viewers fund a Gateway balance first, so this is not the original no-deposit design. The Solidity contract is a separate scaffold and does not process current Gateway payments or receipts.

## Install

You need Node.js 20 or newer and MongoDB. From the repository root, install dependencies and copy the example settings:

```bash
npm install
```

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
Copy-Item contracts/.env.example contracts/.env
```

Start MongoDB and configure the local environment files before running the services.

## Usage

Run the backend and frontend in separate terminals from the repository root:

```bash
npm run dev:backend
npm run dev:frontend
```

The backend defaults to port `3001`. Connect a wallet in the creator area and create a stream with a title, category, rate, and supported playback URL. Viewers can open a stream, authorize a watch session with their wallet, and pay for viewing time through the Gateway flow. The player pauses metering while paused or buffering.

See the [frontend README](frontend/README.md) for frontend commands and the [backend README](backend/README.md) for backend commands and configuration.

## API

The API is a NestJS service. Its implementation is in `backend/src/`; the backend README describes how to run and test it. API routes cover stream discovery, watch sessions, payment requirements, Gateway payments, and creator settlement summaries.

## Goal

Prawr aims to help creators earn directly from viewers through small payments instead of requiring a large subscription. Creators should be able to broadcast through Prawr, set a price, and reach viewers. Viewers should be able to discover streams, choose how long to watch, and pay for that time.

## Project Status

The current implementation targets Arc Mainnet. Viewers sign a session authorization with their wallet. Circle Gateway x402 payments buy prepaid viewing time, and the backend records payment receipts. HLS sources must allow playback from the Prawr site, while Twitch and YouTube content must allow embedding.

The project is still an MVP. It has no direct video hosting or creator ingest, and playback URLs are visible to viewers. The separate Solidity settlement contract has Testnet deployment instructions, but it is not part of the current Gateway payment flow.

## In Progress And Next

These improvements are planned and are not available in the current app:

- **Direct creator broadcasting:** Let creators broadcast to Prawr using their preferred streaming tools instead of relying on public third-party playback URLs. This would give Prawr more control over stream access and paid viewing.
- **Protected playback:** Keep permanent playback identifiers and creator ingest credentials out of public APIs. The backend should issue short-lived playback access only after checking the viewer's session and paid time. The video delivery service must enforce access for the playlist and every media segment. Expiring links can limit reuse, but cannot prevent screen recording.
- **Live status updates:** Detect when a broadcast starts or ends and update the homepage, using provider events or timely status checks.
- **Creator and stream authorization:** Verify creator ownership on server-side actions and protect stream management, credentials, sessions, and payment operations.
- **Production payments and operations:** Improve payment failure handling, monitoring, rate limits, abuse detection, and audit logs before broad release.

## Network And Secrets

The current app targets Arc Mainnet. Keep the frontend RPC, Gateway facilitator URL and chain identifier, and wallet settings on the same network. If you switch to Testnet, update all related settings together and use Testnet funds. Do not mix Mainnet and Testnet settings.

Keep Circle credentials, database credentials, video-service credentials, signing keys, and wallet private keys on the server or in deployment secrets. Never put secrets in `NEXT_PUBLIC_` variables or commit real credentials. Frontend variables with that prefix are visible in browser code.

## Project Areas

- [Backend](backend/README.md): NestJS API, MongoDB records, session controls, payment verification, and receipts.
- [Frontend](frontend/README.md): Next.js viewer experience, creator dashboard, wallet connection, and player.
- [Contracts](contracts/README.md): Foundry/Solidity settlement scaffold and separate Testnet deployment notes.

## Maintainers

- **Joshua Attah** - [Website](https://jogmg-frontend.vercel.app) · [Email](mailto:joattah3@gmail.com)

## Contributing

Contributions are welcome. Before starting a large change, open an issue to discuss the approach. For a pull request, describe the change, include relevant tests, and run the checks for the area you changed. Do not include secrets or real wallet private keys in code, logs, or screenshots.
