// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IComplianceScreener
/// @notice Plug-in slot for AML/sanctions oracle (Chainalysis, Elliptic, TRM Labs)
interface IComplianceScreener {
    /// @notice Returns true if address is sanctioned/blocked
    function isBlocked(address wallet) external view returns (bool);
}
