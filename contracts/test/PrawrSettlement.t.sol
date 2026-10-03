// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PrawrSettlement.sol";

contract ReentrantRecipient {
    PrawrSettlement internal settlement;
    bool public reentryBlocked;

    constructor(
        PrawrSettlement settlementContract
    ) {
        settlement = settlementContract;
    }

    function claim(
        uint256 amount
    ) external {
        settlement.claimCreatorBalance(payable(address(this)), amount);
    }

    receive() external payable {
        (bool success, bytes memory result) = address(settlement)
            .call(
                abi.encodeWithSelector(PrawrSettlement.claimCreatorBalance.selector, payable(address(this)), msg.value)
            );
        reentryBlocked = !success && result.length >= 4 && bytes4(result) == PrawrSettlement.ReentrantCall.selector;
    }
}

contract PrawrSettlementTest is Test {
    PrawrSettlement internal settlement;
    address internal creator = address(0xBEEF);
    address internal viewer = address(0xCAFE);

    function setUp() public {
        settlement = new PrawrSettlement(address(this));
        vm.deal(viewer, 10 ether);
    }

    function test_openSessionEscrowsViewerFundsAndBindsParticipants() public {
        bytes32 sessionId = keccak256("session-1");
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, expiresAt);

        (address sessionViewer, address sessionCreator, uint256 cap, uint64 expiry, bool closed) =
            settlement.sessions(sessionId);
        assertEq(sessionViewer, viewer);
        assertEq(sessionCreator, creator);
        assertEq(cap, 1 ether);
        assertEq(expiry, expiresAt);
        assertFalse(closed);
        assertEq(address(settlement).balance, 1 ether);
    }

    function test_openSessionRejectsDuplicateSessionId() public {
        bytes32 sessionId = keccak256("duplicate");
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.startPrank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, expiresAt);
        vm.expectRevert(PrawrSettlement.DuplicateSession.selector);
        settlement.openSession{ value: 1 ether }(sessionId, creator, expiresAt);
        vm.stopPrank();
    }

    function test_finalizeCreditsCreatorAndMakesUnusedCapRefundable() public {
        bytes32 sessionId = keccak256("finalize");
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, expiresAt);

        settlement.finalizeSession(sessionId, 0.4 ether);

        assertEq(settlement.creatorBalances(creator), 0.4 ether);
        assertEq(settlement.viewerRefunds(viewer), 0.6 ether);
        assertEq(address(settlement).balance, 1 ether);

        vm.prank(viewer);
        settlement.claimViewerRefund(payable(viewer), 0.6 ether);
        assertEq(viewer.balance, 9.6 ether);
        assertEq(settlement.viewerRefunds(viewer), 0);
    }

    function test_finalizeRejectsUnauthorizedOperator() public {
        bytes32 sessionId = keccak256("unauthorized");
        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, uint64(block.timestamp + 1 hours));

        vm.expectRevert(PrawrSettlement.UnauthorizedSettlement.selector);
        vm.prank(address(0xBAD));
        settlement.finalizeSession(sessionId, 0.5 ether);
    }

    function test_finalizeRejectsChargeAboveViewerCap() public {
        bytes32 sessionId = keccak256("over-cap");
        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, uint64(block.timestamp + 1 hours));

        vm.expectRevert(PrawrSettlement.ChargeExceedsCap.selector);
        settlement.finalizeSession(sessionId, 1 ether + 1);
    }

    function test_finalizeRejectsSecondFinalization() public {
        bytes32 sessionId = keccak256("replay");
        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, uint64(block.timestamp + 1 hours));
        settlement.finalizeSession(sessionId, 0.5 ether);

        vm.expectRevert(PrawrSettlement.SessionAlreadyClosed.selector);
        settlement.finalizeSession(sessionId, 0.5 ether);
    }

    function test_viewerCanRefundExpiredUnfinalizedSession() public {
        bytes32 sessionId = keccak256("expired");
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, expiresAt);

        vm.expectRevert(PrawrSettlement.SessionNotExpired.selector);
        vm.prank(viewer);
        settlement.refundExpiredSession(sessionId);

        vm.warp(expiresAt);
        vm.prank(viewer);
        settlement.refundExpiredSession(sessionId);

        assertEq(settlement.viewerRefunds(viewer), 1 ether);
        assertEq(settlement.creatorBalances(creator), 0);
    }

    function test_claimCreatorBalanceTransfersOnlyCreditedFunds() public {
        bytes32 sessionId = keccak256("creator-claim");
        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, creator, uint64(block.timestamp + 1 hours));
        settlement.finalizeSession(sessionId, 0.75 ether);

        vm.prank(creator);
        settlement.claimCreatorBalance(payable(creator), 0.75 ether);

        assertEq(creator.balance, 0.75 ether);
        assertEq(settlement.creatorBalances(creator), 0);
    }

    function test_claimBlocksReentrantRecipient() public {
        ReentrantRecipient recipient = new ReentrantRecipient(settlement);
        bytes32 sessionId = keccak256("reentrant-claim");
        vm.prank(viewer);
        settlement.openSession{ value: 1 ether }(sessionId, address(recipient), uint64(block.timestamp + 1 hours));
        settlement.finalizeSession(sessionId, 0.5 ether);

        recipient.claim(0.5 ether);

        assertTrue(recipient.reentryBlocked());
        assertEq(settlement.creatorBalances(address(recipient)), 0);
        assertEq(address(recipient).balance, 0.5 ether);
    }
}
