// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title IssuerRegistry
/// @notice Catalog of supported stablecoins across 6 countries.
///         Logic is country-agnostic — countryCode is a DATA field only.
///         Adding a new country = addIssuer() with its token, no logic change needed.
contract IssuerRegistry is Ownable {
    struct Issuer {
        address token;
        string  symbol;
        string  countryCode; // "VN","PH","KR","JP","TH","TW" — data only, not logic
        address priceFeed;   // IFXOracle address for this token
        bool    active;
    }

    mapping(address => Issuer) public issuers;   // token => Issuer
    address[] public tokenList;

    event IssuerAdded(address indexed token, string symbol, string countryCode);
    event IssuerToggled(address indexed token, bool active);

    error AlreadyRegistered(address token);
    error NotRegistered(address token);
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Register a new stablecoin issuer
    function addIssuer(
        address token,
        string calldata symbol,
        string calldata countryCode,
        address priceFeed
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (issuers[token].token != address(0)) revert AlreadyRegistered(token);
        issuers[token] = Issuer(token, symbol, countryCode, priceFeed, true);
        tokenList.push(token);
        emit IssuerAdded(token, symbol, countryCode);
    }

    /// @notice Enable or disable an issuer
    function setActive(address token, bool active) external onlyOwner {
        if (issuers[token].token == address(0)) revert NotRegistered(token);
        issuers[token].active = active;
        emit IssuerToggled(token, active);
    }

    function isActive(address token) external view returns (bool) {
        return issuers[token].active;
    }

    function getIssuer(address token) external view returns (Issuer memory) {
        return issuers[token];
    }

    function allTokens() external view returns (address[] memory) {
        return tokenList;
    }

    function tokenCount() external view returns (uint256) {
        return tokenList.length;
    }
}
