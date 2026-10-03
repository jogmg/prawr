# Smart Contracts

The contract in `contracts/src/PrawrSettlement.sol` implements the first non-custodial Arc session-escrow slice. It is an experimental foundation, not production-ready payment accounting.

## Contract responsibilities

- let viewers fund a session cap directly from their wallet
- bind each escrow to its viewer, creator, cap, and expiry
- let the configured operator finalize at most once and never above the funded cap
- credit unused funds to a viewer refund balance, claimable after finalization or expiry
- hold creator claimable balances and restrict withdrawals to credited amounts
- expose session, refund, and claim events for indexing

## Design note

The operator is passed explicitly at deployment and is immutable. The deployment script requires `ARC_NETWORK`, checks the RPC chain ID, and refuses Mainnet unless `ALLOW_MAINNET=true`; separate deployer keys are configured for Testnet and Mainnet. The frontend separately requires a network-specific contract address and verifies code exists before sending a write.

The backend has a prototype server-clock heartbeat meter, but does not verify that video played, verify the escrow-open transaction, persist state, or submit operator finalization. Chain reconciliation and security review also remain. Escrow funding is disabled by default and only available as an explicit Testnet experiment. Do not use real funds or enable Mainnet session writes.
