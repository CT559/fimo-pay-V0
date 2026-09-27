// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./DeviceRegistry.sol";

/// @title UsageAttestation
/// @notice Records EIP-712 signed usage data from IoT devices.
///         Applies to 4 device services (EV, parking, vending, self-checkout).
///         NOT used for remittance (no physical device).
contract UsageAttestation is EIP712 {
    using ECDSA for bytes32;

    DeviceRegistry public immutable deviceRegistry;

    bytes32 public constant USAGE_TYPEHASH = keccak256(
        "Usage(bytes32 sessionId,bytes32 deviceId,address user,uint256 totalUSD6,uint256 nonce,uint256 deadline)"
    );

    struct AttestationData {
        uint256 totalUSD6;   // attested USD amount (6 decimals)
        uint256 timestamp;
        bool    settled;
    }

    mapping(bytes32 => AttestationData) public attestations;  // sessionId => data
    mapping(bytes32 => uint256) public nonces;                // sessionId => nonce (replay guard)

    event UsageAttested(
        bytes32 indexed sessionId,
        bytes32 indexed deviceId,
        address indexed user,
        uint256 totalUSD6
    );
    event SessionMarkedSettled(bytes32 indexed sessionId);

    error InvalidSignature();
    error DeviceNotActive(bytes32 deviceId);
    error ReplayDetected(bytes32 sessionId);
    error DeadlineExpired(uint256 deadline, uint256 now_);
    error AlreadyAttested(bytes32 sessionId);
    error AlreadySettled(bytes32 sessionId);
    error NotRegistered(bytes32 sessionId);

    constructor(address _deviceRegistry)
        EIP712("FIMOUsageAttestation", "1")
    {
        deviceRegistry = DeviceRegistry(_deviceRegistry);
    }

    /// @notice Submit EIP-712 signed usage data from a device
    function attest(
        bytes32 sessionId,
        bytes32 deviceId,
        address user,
        uint256 totalUSD6,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        // Deadline check
        if (block.timestamp > deadline) revert DeadlineExpired(deadline, block.timestamp);
        // Replay guard
        if (nonces[sessionId] != 0) revert ReplayDetected(sessionId);
        // Duplicate attestation guard
        if (attestations[sessionId].timestamp != 0) revert AlreadyAttested(sessionId);
        // Device must be active
        if (!deviceRegistry.isActive(deviceId)) revert DeviceNotActive(deviceId);

        // Verify EIP-712 signature from device signing key
        // The device signs with its private key; owner address is the device's registered owner
        bytes32 structHash = keccak256(abi.encode(
            USAGE_TYPEHASH,
            sessionId,
            deviceId,
            user,
            totalUSD6,
            nonce,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        // Signer must be the device owner (merchant who registered it)
        address deviceOwner = deviceRegistry.getDevice(deviceId).owner;
        if (signer != deviceOwner) revert InvalidSignature();

        nonces[sessionId] = nonce + 1;
        attestations[sessionId] = AttestationData(totalUSD6, block.timestamp, false);

        emit UsageAttested(sessionId, deviceId, user, totalUSD6);
    }

    /// @notice Get attested USD amount for a session (called by SettlementRouter — FIX A4)
    function getAttestedUsage(bytes32 sessionId) external view returns (uint256 totalUSD6) {
        AttestationData storage a = attestations[sessionId];
        if (a.timestamp == 0) revert NotRegistered(sessionId);
        return a.totalUSD6;
    }

    /// @notice SettlementRouter calls this after settle to prevent double-settle
    function markSettled(bytes32 sessionId) external {
        AttestationData storage a = attestations[sessionId];
        if (a.timestamp == 0) revert NotRegistered(sessionId);
        if (a.settled) revert AlreadySettled(sessionId);
        a.settled = true;
        emit SessionMarkedSettled(sessionId);
    }

    function isSettled(bytes32 sessionId) external view returns (bool) {
        return attestations[sessionId].settled;
    }
}
