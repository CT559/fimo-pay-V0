// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DeviceRegistry
/// @notice Tracks authorized IoT devices (EV charger, parking, vending, self-checkout)
///         Each device has an owner (merchant) and an ECDSA signing key (EIP-712)
contract DeviceRegistry is Ownable {
    struct Device {
        address owner;      // merchant wallet
        bytes32 deviceType; // keccak256("EV_CHARGER"|"PARKING"|"VENDING"|"SELF_CHECKOUT")
        string  metadata;   // JSON: location, model, etc.
        bool    active;
    }

    mapping(bytes32 => Device) public devices; // deviceId => Device
    mapping(address => bytes32[]) public ownerDevices; // owner => deviceIds

    event DeviceRegistered(bytes32 indexed deviceId, address indexed owner, bytes32 deviceType);
    event DeviceToggled(bytes32 indexed deviceId, bool active);

    error AlreadyRegistered(bytes32 deviceId);
    error NotRegistered(bytes32 deviceId);
    error Unauthorized();
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerDevice(
        bytes32 deviceId,
        bytes32 deviceType,
        string calldata metadata
    ) external {
        if (devices[deviceId].owner != address(0)) revert AlreadyRegistered(deviceId);
        devices[deviceId] = Device(msg.sender, deviceType, metadata, true);
        ownerDevices[msg.sender].push(deviceId);
        emit DeviceRegistered(deviceId, msg.sender, deviceType);
    }

    function setActive(bytes32 deviceId, bool active) external {
        Device storage d = devices[deviceId];
        if (d.owner == address(0)) revert NotRegistered(deviceId);
        if (d.owner != msg.sender && owner() != msg.sender) revert Unauthorized();
        d.active = active;
        emit DeviceToggled(deviceId, active);
    }

    function isActive(bytes32 deviceId) external view returns (bool) {
        return devices[deviceId].active;
    }

    function getDevice(bytes32 deviceId) external view returns (Device memory) {
        return devices[deviceId];
    }
}
