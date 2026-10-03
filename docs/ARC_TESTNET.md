# Arc Testnet

Arc Testnet is the target environment for V1 validation. The official Arc docs show that the chain is available and configured as `arcTestnet` in `viem`.

## Required values

- Chain ID: 5042002
- RPC: https://rpc.testnet.arc.io
- Explorer: https://explorer.testnet.arc.io
- USDC gas token: Arc uses USDC as the native gas token

## Testnet requirements

- creator wallet with Arc Testnet connectivity
- viewer wallet with testnet USDC
- test credentials for stream creation and settlement flow
- event indexing verification against chain logs for settlement events
