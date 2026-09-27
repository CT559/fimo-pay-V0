// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IComplianceScreener.sol";

/// @title MockComplianceScreener — always returns false (not blocked) for testing
contract MockComplianceScreener is IComplianceScreener {
    mapping(address => bool) public blocklist;

    function setBlocked(address wallet, bool blocked) external {
        blocklist[wallet] = blocked;
    }

    function isBlocked(address wallet) external view returns (bool) {
        return blocklist[wallet];
    }
}
