# Testing

The monorepo should include unit tests for backend verification and contract tests for payout logic. The first scaffold focuses on architecture and code skeleton, but the following test plan is required before a production-ready release:

- backend receipt validation tests
- session heartbeat validation tests
- settlement idempotency tests
- max authorization threshold tests
- creator claim flow tests
- contract replay, expiry, and double-claim tests
- end-to-end Arc Testnet session flow tests
