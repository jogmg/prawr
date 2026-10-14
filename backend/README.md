# Prawr Backend

The backend is a NestJS API. It stores streams, watch sessions, payment receipts, and creator settlement data in MongoDB. It also verifies wallet-signed session authorization and handles Circle Gateway payment requests.

## Current Features

- List and read stream records.
- Create watch sessions after validating a wallet signature.
- Control sessions and track prepaid viewing time.
- Request the next viewing block through Circle Gateway x402.
- Save verified payment receipts for creator summaries.
- Check Twitch and YouTube stream status when provider credentials are configured.

The current stream record contains a playback URL, and public stream endpoints return it. This is acceptable only for sources intended to be public. It does not provide protected video delivery or prevent viewers from reusing that URL.

## Run And Test

From the repository root, install dependencies and copy the example environment file:

```bash
npm install
```

```powershell
Copy-Item backend/.env.example backend/.env
```

Start MongoDB and run the API:

```bash
npm run dev:backend
```

The API listens on port `3001` by default. Backend commands:

```bash
npm --workspace backend run build
npm --workspace backend test
npm --workspace backend run lint
```

## Configuration

Set `MONGODB_URI` to the MongoDB database. The current app implementation targets Arc Mainnet, so configure the Circle Gateway facilitator URL, chain, and API key for Mainnet to match the frontend. If you intentionally switch to Testnet, change all network settings together. Optional YouTube and Twitch credentials enable provider status checks.

Do not expose Circle credentials, video-provider credentials, signing keys, or other secrets through frontend settings or API responses. A video delivery integration should keep provider API credentials and playback-token signing keys on the backend.

## Planned Work

- Add creator ownership checks to every stream-management endpoint.
- Support direct broadcasts from creators' preferred streaming tools through authenticated backend routes, instead of relying only on externally hosted playback URLs.
- Keep ingest keys and permanent playback identifiers out of public stream responses.
- Issue short-lived signed playback tokens only after checking viewer entitlement; ensure the video provider enforces access on manifests and media segments.
- Improve live status updates with provider webhooks or faster status checks.
- Add rate limits, audit events, and production-focused error handling.

These items are not implemented yet. For the overall goal and roadmap, see the [root README](../README.md).

## Author

Joshua Attah jogmg <joattah3@gmail.com>
