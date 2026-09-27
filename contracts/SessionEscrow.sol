// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SessionEscrow
/// @notice Records session lifecycle: OPEN → SETTLED or CANCELLED
///         Does NOT lock funds — payment is atomic on settle.
///         Used for all 5 services (4 device + remittance).
contract SessionEscrow is Ownable {
    enum Status { None, Open, Settled, Cancelled }

    struct Session {
        address  user;
        bytes32  deviceId;       // zero for remittance sessions
        address  token;          // stablecoin used
        uint256  estimatedUSD6;  // estimate at open time
        uint256  finalUSD6;      // final amount at settle
        Status   status;
        uint256  openedAt;
        uint256  settledAt;
        bool     isRemittance;
    }

    mapping(bytes32 => Session) public sessions;

    event SessionOpened(bytes32 indexed sessionId, address indexed user, bytes32 deviceId, bool isRemittance);
    event SessionSettled(bytes32 indexed sessionId, uint256 finalUSD6, address token);
    event SessionCancelled(bytes32 indexed sessionId, string reason);

    error SessionExists(bytes32 sessionId);
    error SessionNotOpen(bytes32 sessionId);
    error Unauthorized();

    // Only SettlementRouter (owner) can settle/cancel
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Open a new session (called by user or agent on their behalf)
    function openSession(
        bytes32 sessionId,
        address user,
        bytes32 deviceId,
        address token,
        uint256 estimatedUSD6,
        bool isRemittance
    ) external onlyOwner {
        if (sessions[sessionId].status != Status.None) revert SessionExists(sessionId);
        sessions[sessionId] = Session({
            user: user,
            deviceId: deviceId,
            token: token,
            estimatedUSD6: estimatedUSD6,
            finalUSD6: 0,
            status: Status.Open,
            openedAt: block.timestamp,
            settledAt: 0,
            isRemittance: isRemittance
        });
        emit SessionOpened(sessionId, user, deviceId, isRemittance);
    }

    /// @notice Settle a session (called by SettlementRouter after payment)
    function settleSession(bytes32 sessionId, uint256 finalUSD6) external onlyOwner {
        Session storage s = sessions[sessionId];
        if (s.status != Status.Open) revert SessionNotOpen(sessionId);
        s.status = Status.Settled;
        s.finalUSD6 = finalUSD6;
        s.settledAt = block.timestamp;
        emit SessionSettled(sessionId, finalUSD6, s.token);
    }

    /// @notice Cancel a session — supports auto-refund flow (FIX A5)
    function cancelSession(bytes32 sessionId, string calldata reason) external onlyOwner {
        Session storage s = sessions[sessionId];
        if (s.status != Status.Open) revert SessionNotOpen(sessionId);
        s.status = Status.Cancelled;
        emit SessionCancelled(sessionId, reason);
    }

    function getSession(bytes32 sessionId) external view returns (Session memory) {
        return sessions[sessionId];
    }

    function isOpen(bytes32 sessionId) external view returns (bool) {
        return sessions[sessionId].status == Status.Open;
    }
}
