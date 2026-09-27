// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFXConverter
/// @notice Plug-in slot for StableFX engine (or any FX adapter)
interface IFXConverter {
    /// @notice Convert `amountIn` of `tokenIn` to `tokenOut`
    /// @param tokenIn  Source token address
    /// @param tokenOut Destination token address
    /// @param amountIn Amount of tokenIn (in token's own decimals)
    /// @return amountOut Amount of tokenOut received
    function convert(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external returns (uint256 amountOut);

    /// @notice Quote conversion without executing
    function quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut);
}
