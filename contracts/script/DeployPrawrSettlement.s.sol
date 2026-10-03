// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PrawrSettlement.sol";

contract DeployPrawrSettlement is Script {
    error InvalidArcNetwork();
    error UnexpectedChainId(uint256 actual, uint256 expected);
    error MainnetDeploymentDisabled();

    function run() external {
        string memory network = vm.envString("ARC_NETWORK");
        uint256 expectedChainId;
        uint256 deployerPrivateKey;

        if (keccak256(bytes(network)) == keccak256(bytes("arcTestnet"))) {
            expectedChainId = 5042002;
            deployerPrivateKey = vm.envUint("ARC_TESTNET_PRIVATE_KEY");
        } else if (keccak256(bytes(network)) == keccak256(bytes("arc"))) {
            expectedChainId = 5042;
            if (!vm.envOr("ALLOW_MAINNET", false)) revert MainnetDeploymentDisabled();
            deployerPrivateKey = vm.envUint("ARC_MAINNET_PRIVATE_KEY");
        } else {
            revert InvalidArcNetwork();
        }

        if (block.chainid != expectedChainId) {
            revert UnexpectedChainId(block.chainid, expectedChainId);
        }

        address settlementOperator = vm.envAddress("SETTLEMENT_OPERATOR");
        vm.startBroadcast(deployerPrivateKey);
        new PrawrSettlement(settlementOperator);
        vm.stopBroadcast();
    }
}
