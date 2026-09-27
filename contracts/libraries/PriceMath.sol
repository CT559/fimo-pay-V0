// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PriceMath — safe decimal-aware amount conversion
library PriceMath {
    uint256 internal constant PRICE_PRECISION = 1_000_000; // 6 decimals

    /// @notice Convert `amount` of a token (with `tokenDecimals`) to USD value (6 decimals)
    /// @param amount       Token amount in token's native decimals
    /// @param usdPrice6    USD price with 6 decimal precision (e.g. $1.50 = 1_500_000)
    /// @param tokenDecimals Token's decimals
    /// @return usdAmount   USD value with 6 decimals
    function toUSD(
        uint256 amount,
        uint256 usdPrice6,
        uint8 tokenDecimals
    ) internal pure returns (uint256 usdAmount) {
        // usdAmount = amount * usdPrice6 / 10^tokenDecimals
        usdAmount = (amount * usdPrice6) / (10 ** tokenDecimals);
        // Normalize to 6 decimal USD
        // Already 6 decimals because: (amount in tokenDecimals * price6) / 10^tokenDecimals = USD6
    }

    /// @notice Convert USD amount (6 decimals) to token amount
    /// @param usdAmount6   USD amount with 6 decimal precision
    /// @param usdPrice6    USD price of 1 token unit (6 decimals)
    /// @param tokenDecimals Token's decimals
    /// @return tokenAmount Token amount in token's native decimals
    function fromUSD(
        uint256 usdAmount6,
        uint256 usdPrice6,
        uint8 tokenDecimals
    ) internal pure returns (uint256 tokenAmount) {
        require(usdPrice6 > 0, "PriceMath: zero price");
        tokenAmount = (usdAmount6 * (10 ** tokenDecimals)) / usdPrice6;
    }

    /// @notice Scale amount from srcDecimals to dstDecimals
    function rescale(
        uint256 amount,
        uint8 srcDecimals,
        uint8 dstDecimals
    ) internal pure returns (uint256) {
        if (srcDecimals == dstDecimals) return amount;
        if (srcDecimals < dstDecimals) {
            return amount * (10 ** (dstDecimals - srcDecimals));
        } else {
            return amount / (10 ** (srcDecimals - dstDecimals));
        }
    }
}
