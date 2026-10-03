# Smart Contracts

This repo includes the initial Arc-native settlement contract skeleton in the contracts folder. The goal is to define the model for creator settlement and payout accounting in a form that can later be hardened for production.

## Contract responsibilities

- record verified settlement requests
- hold creator net balances
- cap claims by accumulated amounts
- resist double-claim and replay attempts
- expose settlement metadata for event indexing

## Design note

The Prawr MVP prefers Circle Gateway Nanopayments for batched settlement, while the Solidity contract is a fallback or cross-check layer that defines the expected accounting semantics in a production-grade system.
