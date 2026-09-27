// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IFXConverter.sol";
import "../interfaces/IFXOracle.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title MockFXEngine — 1-to-1 mock converter for local/testnet testing
contract MockFXEngine is IFXConverter {
    IFXOracle public oracle;

    constructor(address _oracle) {
        oracle = IFXOracle(_oracle);
    }

    function quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) public view returns (uint256 amountOut) {
        (uint256 priceIn, ) = oracle.getUSDPrice(tokenIn);
        (uint256 priceOut, ) = oracle.getUSDPrice(tokenOut);
        uint8 decimalsIn = _decimals(tokenIn);
        uint8 decimalsOut = _decimals(tokenOut);
        // amountOut = amountIn * priceIn / priceOut, adjusted for decimals
        amountOut = (amountIn * priceIn * (10 ** decimalsOut)) / (priceOut * (10 ** decimalsIn));
    }

    function convert(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external returns (uint256 amountOut) {
        amountOut = quote(tokenIn, tokenOut, amountIn);
        // In a real engine, tokens would be transferred here
        // For mock, we just return the calculated amount
    }

    function _decimals(address token) internal view returns (uint8) {
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 6;
        }
    }
}
