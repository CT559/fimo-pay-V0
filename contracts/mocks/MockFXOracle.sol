// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IFXOracle.sol";

/// @title MockFXOracle — returns fixed prices for local testing
contract MockFXOracle is IFXOracle {
    mapping(address => uint256) public prices; // 6-decimal USD price

    function setPrice(address token, uint256 usdPrice6) external {
        prices[token] = usdPrice6;
    }

    function getUSDPrice(address token) external view returns (uint256 price, uint256 updatedAt) {
        price = prices[token];
        if (price == 0) price = 1_000_000; // default $1.00
        updatedAt = block.timestamp;
    }
}
