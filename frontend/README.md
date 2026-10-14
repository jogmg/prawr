# Prawr Frontend

The frontend is a Next.js app. It contains the public stream homepage, watch pages, wallet connection, payment controls, and creator dashboard at `/creator`.

## Run Locally

From the repository root:

```bash
npm install
```

```powershell
Copy-Item frontend/.env.example frontend/.env
```

Start the backend and MongoDB, then start the frontend:

```bash
npm run dev:frontend
```

Frontend commands:

```bash
npm --workspace frontend run build
npm --workspace frontend run lint
```

## Configuration

Set `NEXT_PUBLIC_API_BASE_URL` to the backend URL and set the Arc RPC and WalletConnect project ID for the network you use. The current app implementation targets Arc Mainnet. If you intentionally use Arc Testnet, change the RPC and all backend Gateway settings together so the app uses one network consistently.

Variables with the `NEXT_PUBLIC_` prefix are included in browser code and are visible to users. Use them only for public configuration. Never put Circle or video-provider API secrets, private signing keys, creator ingest keys, or wallet private keys there.

## Playback Security

Today the frontend receives the stream's playback URL from the public stream API and passes it to the player. Anyone watching can inspect the URL in browser tools or network requests. Hiding it in the page or encrypting it in frontend code would not secure it.

The planned secure flow is for the backend to authorize a viewer and return a short-lived provider playback token. The player will still use a tokenized URL, which the viewer can inspect, but the provider should reject expired or unsigned requests. This needs provider-side enforcement for HLS/DASH manifests and segments; it is not yet implemented.

The planned live-streaming flow will let creators broadcast directly to Prawr using their preferred streaming tools, such as OBS, instead of relying on YouTube or Twitch playback URLs. This would give Prawr more control over stream access and allow the platform's viewing and payment flow to apply to the live broadcast. Direct streaming is not implemented yet.

See the [root README](../README.md) for the project goal and roadmap.

## Author

jogmg <joattah3@gmail.com>
