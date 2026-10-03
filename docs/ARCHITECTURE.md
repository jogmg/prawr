# Prawr Architecture

## High-level design

Prawr separates the viewer experience from the creator experience.

### Viewer experience

- Public homepage for live discovery
- Stream cards showing title, creator, category, rate, and live status
- /watch/{slug} route for a locked access flow
- viewer-funded capped escrow before a paid viewing session
- server-clock usage derived from heartbeats (prototype; playback is not verified)
- operator-finalized charge with unused-cap refund

### Creator experience

- Protected /creator application
- stream creation and editing
- earnings, payouts, and status tracking
- access to stream share links and analytics

## Core payment flow

1. Creator publishes stream metadata and rate.
2. Viewer browses and selects a stream.
3. Viewer reviews the terms and funds a capped escrow session from their connected wallet.
4. The backend meters server elapsed time between client heartbeats and caps large gaps; it does not prove that playback occurred.
5. The configured settlement operator finalizes no more than the funded cap; unused funds become refundable.
6. Creator withdraws the chain-confirmed creator balance.

## Recommended stack

- Frontend: Next.js + Tailwind + wagmi + ConnectKit + viem
- Backend: NestJS + TypeScript + MongoDB + Mongoose
- Contracts: Solidity + Foundry
- Settlement rail: viewer-funded Arc-native session escrow; Circle Gateway Nanopayments may serve separate discrete paid resources

## Critical design rule

The frontend counter is UX only. The backend derives a provisional amount from server-clock heartbeats, but those signals are not proof of playback. Escrow funding is disabled by default; chain funding verification, durable state, and automatic finalization are not implemented.
