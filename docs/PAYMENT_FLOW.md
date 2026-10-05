# Payment Flow

## Session authorization

A viewer signs an authorization binding the session to the stream and viewer wallet. The signature does not grant spending authority; each viewing block is separately paid through x402.

## Prepaid viewing blocks

Before playback begins, the viewer pays for 30 seconds of viewing. The backend computes the exact block price from the stream rate. Payment grants prepaid time; heartbeats consume that credit and playback pauses when it runs out. Unused prepaid time is not refunded when a viewer stops early. Viewers can continue buying blocks as long as their Gateway balance can cover each payment.

The viewer explicitly pays for each next block. The client displays the server-calculated duration and amount before requesting the wallet signature. This reduces signature prompts from once per second to once per block, while keeping payment approval in the viewer's hands.

Playback URLs must be protected for this to enforce payment. A public direct media URL can be played outside the app and bypass the payment gate.

## Receipt validation

Each receipt must:

- match stream and session IDs
- be signed by the viewer wallet
- include the correct creator identity
- be monotonic with cumulative accounting
- match the amount and duration of the requested viewing block
- not be expired
- not be a replay of a prior valid receipt

## Aggregation

Receipts accumulate and are rolled into settlement checkpoints instead of one blockchain transaction per second.

## Settlement

The preferred design is Circle Gateway Nanopayments for batched, gasless settlement. If that cannot support the end-to-end V1 flow, the fallback is a custom Arc-native settlement contract that pays verified creator balances in USDC.
