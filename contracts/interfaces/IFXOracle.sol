// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFXOracle
/// @notice Interface for FX price oracle (e.g. Chainlink, Arc native oracle)
interface IFXOracle {
    /// @notice Returns price of `token` in USD (6 decimals, same as USDC)
    function getUSDPrice(address token) external view returns (uint256 price, uint256 updatedAt);
}
