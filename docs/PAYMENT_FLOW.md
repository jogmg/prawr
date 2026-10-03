# Payment Flow

## Session funding

A viewer funds a specific session escrow from their own Arc wallet. The deposited amount is the hard maximum charge for that session. The contract binds the session to the viewer and creator and enforces the cap. Arc native USDC value uses 18 decimals.

## Usage meter

The backend prototype derives elapsed time from server receipt times for token-authorized start, heartbeat, pause, resume, and stop requests. It ignores client-supplied charge amounts, caps each heartbeat gap at 30 seconds, and stops at the session authorization cap. The displayed client timer is not used for accounting. This does not prove that video played, and the current in-memory session store is lost on restart.

## Finalization and refund

The settlement operator can finalize a session once and charge no more than its deposited cap. The unused difference becomes a viewer refund balance; an unfinalized session can be refunded by its viewer after expiry. Creator claims are limited to balances credited by finalized sessions.

The backend does not yet verify the escrow-open transaction, persist session/funding state, or submit operator finalization. Thus this prototype cannot settle real watch-time charges. Testnet escrow funding is opt-in; do not enable it for real funds.

## Circle Gateway Nanopayments

Gateway Nanopayments supports Arc Testnet and Mainnet and batches EIP-3009 payments, but each exact payment requires its own EOA authorization. There is no documented reusable session spend cap, and the nanopayment path does not support ERC-1271 smart-contract signatures. It is therefore not used for the streaming session rail; it may fit discrete paid API/resource requests.
