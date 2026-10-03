// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PrawrSettlement {
    error UnauthorizedSettlement();
    error InvalidAmount();
    error InvalidExpiry();
    error InvalidRecipient();
    error DuplicateSession();
    error SessionNotFound();
    error SessionNotExpired();
    error SessionAlreadyClosed();
    error ChargeExceedsCap();
    error InsufficientCreatorBalance();
    error InsufficientRefundBalance();
    error ReentrantCall();
    error TransferFailed();

    struct SessionEscrow {
        address viewer;
        address creator;
        uint256 cap;
        uint64 expiresAt;
        bool closed;
    }

    mapping(bytes32 => SessionEscrow) public sessions;
    mapping(address => uint256) public creatorBalances;
    mapping(address => uint256) public viewerRefunds;

    address public immutable settlementOperator;
    uint256 private entered = 1;

    event SessionOpened(
        bytes32 indexed sessionId, address indexed viewer, address indexed creator, uint256 cap, uint64 expiresAt
    );
    event SessionFinalized(
        bytes32 indexed sessionId, address indexed viewer, address indexed creator, uint256 charged, uint256 refunded
    );
    event SessionRefunded(bytes32 indexed sessionId, address indexed viewer, uint256 amount);
    event CreatorClaimed(address indexed creator, uint256 amount, address indexed recipient);
    event ViewerRefundClaimed(address indexed viewer, uint256 amount, address indexed recipient);

    modifier nonReentrant() {
        if (entered != 1) revert ReentrantCall();
        entered = 2;
        _;
        entered = 1;
    }

    constructor(
        address operator
    ) {
        if (operator == address(0)) revert InvalidRecipient();
        settlementOperator = operator;
    }

    function openSession(
        bytes32 sessionId,
        address creator,
        uint64 expiresAt
    ) external payable {
        if (sessionId == bytes32(0)) revert InvalidRecipient();
        if (creator == address(0)) revert InvalidRecipient();
        if (msg.value == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        if (sessions[sessionId].viewer != address(0)) revert DuplicateSession();

        sessions[sessionId] = SessionEscrow({
            viewer: msg.sender, creator: creator, cap: msg.value, expiresAt: expiresAt, closed: false
        });

        emit SessionOpened(sessionId, msg.sender, creator, msg.value, expiresAt);
    }

    function finalizeSession(
        bytes32 sessionId,
        uint256 finalCharge
    ) external {
        if (msg.sender != settlementOperator) revert UnauthorizedSettlement();

        SessionEscrow storage session = sessions[sessionId];
        if (session.viewer == address(0)) revert SessionNotFound();
        if (session.closed) revert SessionAlreadyClosed();
        if (finalCharge > session.cap) revert ChargeExceedsCap();

        session.closed = true;
        creatorBalances[session.creator] += finalCharge;
        uint256 refund = session.cap - finalCharge;
        viewerRefunds[session.viewer] += refund;

        emit SessionFinalized(sessionId, session.viewer, session.creator, finalCharge, refund);
    }

    function refundExpiredSession(
        bytes32 sessionId
    ) external {
        SessionEscrow storage session = sessions[sessionId];
        if (session.viewer == address(0)) revert SessionNotFound();
        if (session.viewer != msg.sender) revert InvalidRecipient();
        if (session.closed) revert SessionAlreadyClosed();
        if (block.timestamp < session.expiresAt) revert SessionNotExpired();

        session.closed = true;
        viewerRefunds[session.viewer] += session.cap;

        emit SessionRefunded(sessionId, session.viewer, session.cap);
    }

    function claimCreatorBalance(
        address payable recipient,
        uint256 amount
    ) external nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (creatorBalances[msg.sender] < amount) revert InsufficientCreatorBalance();

        creatorBalances[msg.sender] -= amount;
        emit CreatorClaimed(msg.sender, amount, recipient);
        _sendValue(recipient, amount);
    }

    function claimViewerRefund(
        address payable recipient,
        uint256 amount
    ) external nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (viewerRefunds[msg.sender] < amount) revert InsufficientRefundBalance();

        viewerRefunds[msg.sender] -= amount;
        emit ViewerRefundClaimed(msg.sender, amount, recipient);
        _sendValue(recipient, amount);
    }

    function _sendValue(
        address payable recipient,
        uint256 amount
    ) private {
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert TransferFailed();
    }
}
