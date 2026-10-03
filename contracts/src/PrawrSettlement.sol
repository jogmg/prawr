// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PrawrSettlement {
    error UnauthorizedSettlement();
    error UnauthorizedClaim();
    error InvalidAmount();
    error DuplicateSettlement();
    error IncorrectSettlementValue();
    error InsufficientCreatorBalance();
    error InvalidRecipient();

    struct SettlementRecord {
        bytes32 settlementId;
        address viewer;
        address creator;
        uint256 amount;
        uint256 timestamp;
        bool settled;
        bool claimed;
    }

    mapping(bytes32 => SettlementRecord) public settlements;
    mapping(address => uint256) public creatorBalances;

    address public immutable settlementOperator;

    event SettlementRecorded(
        bytes32 indexed settlementId,
        address indexed viewer,
        address indexed creator,
        uint256 amount,
        uint256 timestamp
    );

    event CreatorBalanceCredited(address indexed creator, uint256 amount);
    event CreatorClaimed(address indexed creator, uint256 amount, address indexed recipient);

    constructor() {
        settlementOperator = msg.sender;
    }

    function recordSettlement(
        bytes32 settlementId,
        address viewer,
        address creator,
        uint256 amount
    ) external payable {
        if (msg.sender != settlementOperator) revert UnauthorizedSettlement();
        if (amount == 0) revert InvalidAmount();
        if (msg.value != amount) revert IncorrectSettlementValue();
        if (viewer == address(0) || creator == address(0)) revert InvalidRecipient();
        if (settlements[settlementId].settled) revert DuplicateSettlement();

        settlements[settlementId] = SettlementRecord({
            settlementId: settlementId,
            viewer: viewer,
            creator: creator,
            amount: amount,
            timestamp: block.timestamp,
            settled: true,
            claimed: false
        });

        creatorBalances[creator] += amount;

        emit SettlementRecorded(settlementId, viewer, creator, amount, block.timestamp);
        emit CreatorBalanceCredited(creator, amount);
    }

    function claim(address payable recipient, uint256 amount) external {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (creatorBalances[msg.sender] < amount) revert InsufficientCreatorBalance();

        creatorBalances[msg.sender] -= amount;
        emit CreatorClaimed(msg.sender, amount, recipient);
        recipient.transfer(amount);
    }
}
