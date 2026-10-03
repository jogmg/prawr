// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PrawrSettlement.sol";

contract DeployPrawrSettlement is Script {
    function run() external {
        vm.startBroadcast();
        new PrawrSettlement();
        vm.stopBroadcast();
    }
}
