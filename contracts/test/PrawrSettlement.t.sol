// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PrawrSettlement.sol";

contract PrawrSettlementTest is Test {
    PrawrSettlement internal settlement;

    function setUp() public {
        settlement = new PrawrSettlement();
        vm.deal(address(this), 10 ether);
    }

    function test_recordSettlement_updatesCreatorBalance() public {
        bytes32 settlementId = keccak256("session-1");

        settlement.recordSettlement{value: 1 ether}(
            settlementId,
            address(this),
            address(0xBEEF),
            1 ether
        );

        assertEq(settlement.creatorBalances(address(0xBEEF)), 1 ether);
    }

    function test_recordSettlement_rejectsDuplicate() public {
        bytes32 settlementId = keccak256("session-2");

        settlement.recordSettlement{value: 1 ether}(
            settlementId,
            address(this),
            address(0xBEEF),
            1 ether
        );

        vm.expectRevert(PrawrSettlement.DuplicateSettlement.selector);
        settlement.recordSettlement{value: 1 ether}(
            settlementId,
            address(this),
            address(0xBEEF),
            1 ether
        );
    }

    function test_recordSettlement_rejectsUnauthorizedCaller() public {
        vm.expectRevert(PrawrSettlement.UnauthorizedSettlement.selector);
        vm.prank(address(0xBAD));
        settlement.recordSettlement(
            keccak256("unauthorized"),
            address(0xBAD),
            address(0xBEEF),
            1 ether
        );
    }

    function test_recordSettlement_rejectsMismatchedFunding() public {
        vm.expectRevert(PrawrSettlement.IncorrectSettlementValue.selector);
        settlement.recordSettlement{value: 0.5 ether}(
            keccak256("underfunded"),
            address(this),
            address(0xBEEF),
            1 ether
        );
    }

    function test_claimTransfersFundsAndReducesCreatorBalance() public {
        address payable recipient = payable(address(0xCAFE));
        settlement.recordSettlement{value: 1 ether}(
            keccak256("claimable"),
            address(this),
            address(this),
            1 ether
        );

        settlement.claim(recipient, 1 ether);

        assertEq(settlement.creatorBalances(address(this)), 0);
        assertEq(recipient.balance, 1 ether);
    }
}
