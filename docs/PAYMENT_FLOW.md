# Payment Flow

## Session authorization

A viewer signs an authorization that includes the stream and maximum charge for a specific session. This is not a blockchain settlement, and it is not a per-second payment. It is a session-level spend cap.

## Usage meter

The backend records playback state transitions and heartbeats. These events are converted into valid billable time only after validation.

## Receipt validation

Each receipt must:

- match stream and session IDs
- be signed by the viewer wallet
- include the correct creator identity
- be monotonic with cumulative accounting
- remain below the maximum authorization
- not be expired
- not be a replay of a prior valid receipt

## Aggregation

Receipts accumulate and are rolled into settlement checkpoints instead of one blockchain transaction per second.

## Settlement

The preferred design is Circle Gateway Nanopayments for batched, gasless settlement. If that cannot support the end-to-end V1 flow, the fallback is a custom Arc-native settlement contract that pays verified creator balances in USDC.
