# Prawr

Prawr is a live-streaming platform project built around small, pay-as-you-watch payments. It uses Arc and Circle Gateway for its current payment flow.

## Goal

The goal is to let creators earn directly from viewers, one small payment at a time. A creator should be able to start a live broadcast, set a price, and share it through Prawr. Viewers should be able to discover streams, choose how long to watch, and pay without needing a large subscription.

## Project Status

The current MVP stores streams in MongoDB and supports Twitch and YouTube embeds, HLS (`.m3u8`), and direct MP4/WebM playback. Viewers sign a session authorization with their wallet. Circle Gateway x402 payments buy viewing time, and the backend records payment receipts. Metering pauses when the player is paused or buffering.

Creators currently provide an existing playback URL. This means that URL is sent to the browser and can be found in API responses, player details, or network requests. HLS sources must allow playback from the Prawr site, and Twitch/YouTube streams must allow embedding.

Prawr does not yet host video or provide its own creator ingest. A managed live-video delivery integration is not implemented. The current app implementation targets Arc Mainnet, but it is still an MVP and should not be treated as production-ready.

### Original Payment Plan

The first payment design aimed to send tiny payments directly from the viewer's wallet to the creator as each second of video was watched. The goal was to avoid asking viewers to deposit money into a separate balance before watching, and to make payments happen in the background. A settlement contract was partially explored, but research and implementation exposed several practical challenges:

- A wallet may ask the viewer to approve each transaction. Repeating that every second would interrupt playback; allowing transactions without repeated prompts requires additional wallet or smart-contract support.
- Blockchain transactions take time to submit and confirm, so they cannot reliably settle once per second in step with playback.
- Transaction fees and on-chain overhead can be larger than the tiny per-second payment itself.
- The flow depends on the viewer's wallet, network connection, and available funds. A rejected or delayed transaction makes it difficult to decide whether playback should continue and how much the creator is owed.
- Tracking retries, failed or pending transactions, and the exact amount of video watched adds complexity and can lead to payment or accounting mismatches.

The current MVP uses Circle Gateway x402 to batch small payment requests and grant prepaid viewing time. Viewers fund a Gateway balance first, so this is not the original no-deposit design. The Solidity contract remains a separate scaffold and does not process current Gateway payments or receipts.

## In Progress And Next

These are planned improvements, not features that the current app already provides:

- **Direct creator broadcasting:** Let creators stream to Prawr from their preferred broadcasting tools instead of relying on public third-party playback URLs. Prawr would manage the live ingest and delivery flow, giving the platform more control over stream access and paid viewing.
- **Protected playback links:** Keep the provider's permanent playback ID and creator ingest key off public APIs. After checking a viewer's session and paid time, the backend would issue a short-lived signed playback token. The video provider must enforce that token for the playlist and every media segment. This makes copied links expire; it does not make playback impossible to record.
- **Live status updates:** Check the video provider for active broadcasts and update stream status so the homepage lists streams that are actually live. Faster updates could use provider webhooks or server notifications instead of relying only on periodic checks.
- **Creator and stream authorization:** Verify creator ownership on server-side actions, protect ingest-key retrieval and rotation, and limit access to session and payment operations. A connected wallet in the interface alone is not server authorization.
- **Production payment and settlement:** Validate the payment flow with production-grade configuration, improve monitoring and failure handling, and decide whether the separate settlement contract should be completed or retired.
- **Operational controls:** Add rate limits, abuse monitoring, audit logs, and clear handling for provider or payment outages before opening the service broadly.

## Run Locally

You need Node.js 20 or newer and MongoDB. Install dependencies and copy the example settings:

```bash
npm install
```

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
Copy-Item contracts/.env.example contracts/.env
```

Start MongoDB, then run the backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

The backend defaults to port `3001`. See [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md), and [contracts/README.md](contracts/README.md) for component-specific setup and commands.

## Network And Secrets

The current app implementation targets Arc Mainnet. Keep the frontend RPC, Gateway facilitator URL and chain identifier, and wallet settings on the same network. If you intentionally switch the app to Arc Testnet, change all related settings together and use Testnet funds. Do not mix Mainnet and Testnet settings. The separate Solidity contract scaffold has Testnet deployment instructions and is not part of the current Gateway payment flow.

Keep Circle API credentials, database credentials, provider credentials, signing keys, and wallet private keys on the server or in deployment secrets. Never put them in `NEXT_PUBLIC_` variables or commit real secrets. The frontend variables are public by design.

## Project Areas

- [Backend](backend/README.md): NestJS API, MongoDB records, session controls, payment verification, and receipts.
- [Frontend](frontend/README.md): Next.js viewer experience, creator dashboard, wallet connection, and player.
- [Contracts](contracts/README.md): Foundry/Solidity settlement scaffold and deployment notes.

## Author

jogmg <joattah3@gmail.com>
