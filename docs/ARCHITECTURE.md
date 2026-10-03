# Prawr Architecture

## High-level design

Prawr separates the viewer experience from the creator experience.

### Viewer experience

- Public homepage for live discovery
- Stream cards showing title, creator, category, rate, and live status
- /watch/{slug} route for a locked access flow
- wallet authorization before a paid viewing session
- meter usage with server-side validation
- signed receipts and periodic settlement

### Creator experience

- Protected /creator application
- stream creation and editing
- earnings, payouts, and status tracking
- access to stream share links and analytics

## Core payment flow

1. Creator publishes stream metadata and rate.
2. Viewer browses and selects a stream.
3. Viewer reviews payment terms and authorizes a session cap.
4. Viewer watches the stream and backend meters valid activity.
5. The backend validates usage and emits signed cumulative receipts.
6. The backend aggregates receipts and settles net positions.
7. Creator balance is updated and claimable funds can be withdrawn.

## Recommended stack

- Frontend: Next.js + Tailwind + wagmi + ConnectKit + viem
- Backend: NestJS + TypeScript + MongoDB + Mongoose
- Contracts: Solidity + Foundry
- Settlement rail: Circle Gateway Nanopayments preferred; Arc-native fallback contract as a secure backup

## Critical design rule

The frontend counter is UX only. The backend must derive the real billable amount from validated session and receipt state, not from a client timer.
