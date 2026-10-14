# Prawr Contracts

This folder contains Solidity contracts and Foundry scripts for a possible Arc settlement flow. The contract code is scaffolding. The current app uses Circle Gateway x402 payments and MongoDB receipts; it does not submit those receipts to this contract or use the contract for creator payouts.

## Test

Install [Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry), then run tests from this folder:

```bash
arc-forge test --network arc
```

## Deploy To Arc Testnet

Copy the example settings and use a dedicated, disposable Testnet wallet:

```powershell
Copy-Item contracts/.env.example contracts/.env
```

Set `ARC_TESTNET_RPC_URL` and `PRIVATE_KEY` in `contracts/.env`. Never use a Mainnet wallet key, commit a real key, or send it to the frontend. Get Testnet USDC from the [Circle faucet](https://faucet.circle.com/) if needed.

From this folder, load the environment and deploy:

```bash
set -a
source .env
set +a
arc-forge script script/DeployPrawrSettlement.s.sol:DeployPrawrSettlement \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

The app's current Gateway payment flow is separate from this deployment. Do not expect deploying the contract to change how viewer payments or creator receipts work.

## Planned Work

Before using a contract for real funds, the project must decide whether on-chain settlement is still needed alongside Circle Gateway, define how verified Gateway receipts become payout claims, and add thorough tests and security review. This is not production-ready contract code.

See the [root README](../README.md) for the overall goal and project status.

## Author

jogmg <joattah3@gmail.com>
