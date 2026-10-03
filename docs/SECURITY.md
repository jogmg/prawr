# Security

## Core assumptions

- client timers are not trusted for financial finality
- server-side validation is required for every billable duration
- wallet signatures must be validated against the exact stream/session data
- settlement must be idempotent and replay-resistant

## Key controls

- max authorization cap enforcement
- session expiration enforcement
- cumulative receipt monotonicity
- duplicate settlement prevention
- creator claim confirmation from the explicit connected wallet
- backend-held executor logic without frontend wallet privileges

## Arc-specific guardrails

Arc uses USDC as the native gas token and has special semantics around value transfers and decimals. Any production implementation must respect the Arc EVM differences as documented by Arc.
