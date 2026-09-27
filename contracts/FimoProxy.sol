// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Import ERC1967Proxy so Foundry generates its artifact.
// This lets deploy_contract target FimoProxy which IS the proxy,
// and pass encoded initialize() calldata as the _data constructor arg.
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title FimoProxy
/// @notice Thin wrapper — re-exports ERC1967Proxy so Foundry produces
///         contracts/out/FimoProxy.sol/FimoProxy.json with the correct
///         constructor(address _logic, bytes memory _data).
contract FimoProxy is ERC1967Proxy {
    constructor(address _logic, bytes memory _data)
        ERC1967Proxy(_logic, _data)
    {}
}
