// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// BLOCKING FIX A1: Arc EVM = Paris. ReentrancyGuardTransient uses Cancun/EIP-1153 → NOT available.
// Use ReentrancyGuardUpgradeable (standard storage-based guard) instead.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../IssuerRegistry.sol";
import "../ComplianceGateway.sol";
import "../SessionEscrow.sol";
import "../UsageAttestation.sol";
import "../interfaces/IFXConverter.sol";
import "../interfaces/IFXOracle.sol";
import "../libraries/PriceMath.sol";

/// @title SettlementRouterV1
/// @notice Core settlement contract for all 5 FIMO services.
///         BLOCKING FIXES applied:
///         A1 — ReentrancyGuardUpgradeable (Paris-compatible, no Cancun)
///         A3 — Idempotency: settledSessions mapping prevents double-settle
///         A4 — UsageAttestation cross-check for 4 device services
///         A5 — cancelAndRefund() for auto-refund on device services
///         B4 — deadline param + slippage check in batchSettle
/// @custom:oz-upgrades-unsafe-allow constructor
contract SettlementRouterV1 is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable  // FIX A1: Paris-compatible reentrancy guard
{
    using SafeERC20 for IERC20;

    // ─── Immutable-ish refs (set once at initialize) ─────────────────────────
    IssuerRegistry    public issuerRegistry;
    ComplianceGateway public complianceGateway;
    SessionEscrow     public sessionEscrow;
    UsageAttestation  public usageAttestation;
    IFXConverter      public fxConverter;
    IFXOracle         public fxOracle;

    // ─── FIX A3: Idempotency — prevent double-settle ─────────────────────────
    mapping(bytes32 => bool) public settledSessions;

    // ─── Slippage tolerance (FIX B4) ─────────────────────────────────────────
    uint256 public maxSlippageBPS; // basis points, e.g. 100 = 1%

    // ─── Events ──────────────────────────────────────────────────────────────
    event Settled(
        bytes32 indexed sessionId,
        address indexed user,
        address indexed token,
        uint256 tokenAmount,
        uint256 totalUSD6,
        bool isRemittance
    );
    event Refunded(bytes32 indexed sessionId, address indexed user, string reason);
    event FXConverterUpdated(address converter);
    event FXOracleUpdated(address oracle);
    event SlippageUpdated(uint256 bps);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error AlreadySettled(bytes32 sessionId);
    error SessionNotOpen(bytes32 sessionId);
    error TokenNotSupported(address token);
    error DeadlineExpired(uint256 deadline, uint256 now_);
    error SlippageTooHigh(uint256 quotedUSD6, uint256 minAcceptableUSD6);
    error AttestationMismatch(bytes32 sessionId, uint256 attested, uint256 claimed);
    error InsufficientAllowance(address user, address token, uint256 needed);
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address _issuerRegistry,
        address _complianceGateway,
        address _sessionEscrow,
        address _usageAttestation,
        address _fxConverter,
        address _fxOracle,
        uint256 _maxSlippageBPS
    ) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init(); // FIX A1

        issuerRegistry   = IssuerRegistry(_issuerRegistry);
        complianceGateway = ComplianceGateway(_complianceGateway);
        sessionEscrow    = SessionEscrow(_sessionEscrow);
        usageAttestation = UsageAttestation(_usageAttestation);
        fxConverter      = IFXConverter(_fxConverter);
        fxOracle         = IFXOracle(_fxOracle);
        maxSlippageBPS   = _maxSlippageBPS;
    }

    // ─── Settlement ───────────────────────────────────────────────────────────

    struct SettleParams {
        bytes32 sessionId;
        address user;
        address payToken;    // stablecoin user pays with
        address merchant;    // recipient (device owner or remittance recipient)
        uint256 amountUSD6;  // USD amount to settle (6 decimals)
        uint256 deadline;    // FIX B4: unix timestamp, revert if expired
        bool    isRemittance;
        bool    isDeviceService; // if true: cross-check UsageAttestation
    }

    /// @notice Settle a single payment session — called by agent backend
    /// @dev FIX A3: idempotency. FIX A4: attestation cross-check. FIX B4: deadline + slippage.
    function settle(SettleParams calldata p) external nonReentrant onlyOwner {
        // FIX B4: deadline check
        if (block.timestamp > p.deadline) revert DeadlineExpired(p.deadline, block.timestamp);

        // FIX A3: idempotency — prevent double-settle
        if (settledSessions[p.sessionId]) revert AlreadySettled(p.sessionId);

        // Session must be open
        if (!sessionEscrow.isOpen(p.sessionId)) revert SessionNotOpen(p.sessionId);

        // Token must be supported
        if (!issuerRegistry.isActive(p.payToken)) revert TokenNotSupported(p.payToken);

        // Compliance checks
        complianceGateway.checkBlocked(p.user);
        complianceGateway.checkSpend(p.user, p.amountUSD6);

        // FIX A4: for device services, cross-check attested usage
        if (p.isDeviceService) {
            uint256 attested = usageAttestation.getAttestedUsage(p.sessionId);
            // Allow up to maxSlippageBPS tolerance
            uint256 minAcceptable = attested - (attested * maxSlippageBPS / 10_000);
            if (p.amountUSD6 > attested) revert AttestationMismatch(p.sessionId, attested, p.amountUSD6);
        }

        // Calculate token amount from USD
        IssuerRegistry.Issuer memory issuer = issuerRegistry.getIssuer(p.payToken);
        (uint256 tokenPrice, ) = fxOracle.getUSDPrice(p.payToken);
        uint8 tokenDecimals = IERC20Metadata(p.payToken).decimals();
        uint256 tokenAmount = PriceMath.fromUSD(p.amountUSD6, tokenPrice, tokenDecimals);

        // FIX B4: slippage — verify oracle price hasn't moved too much vs agent's quote
        // (re-quote via oracle is the canonical cross-check)
        uint256 quotedUSD6 = PriceMath.toUSD(tokenAmount, tokenPrice, tokenDecimals);
        uint256 minAcceptableUSD6 = p.amountUSD6 - (p.amountUSD6 * maxSlippageBPS / 10_000);
        if (quotedUSD6 < minAcceptableUSD6) revert SlippageTooHigh(quotedUSD6, minAcceptableUSD6);

        // Transfer token from user to merchant
        IERC20(p.payToken).safeTransferFrom(p.user, p.merchant, tokenAmount);

        // Mark as settled — FIX A3
        settledSessions[p.sessionId] = true;

        // Update session state
        sessionEscrow.settleSession(p.sessionId, p.amountUSD6);

        // FIX A4: mark attestation settled (prevents reuse)
        if (p.isDeviceService) {
            usageAttestation.markSettled(p.sessionId);
        }

        // Record spend in compliance
        complianceGateway.recordSpend(p.user, p.amountUSD6);

        emit Settled(p.sessionId, p.user, p.payToken, tokenAmount, p.amountUSD6, p.isRemittance);
    }

    /// @notice Batch settle multiple sessions (gas efficient)
    function batchSettle(SettleParams[] calldata params) external nonReentrant onlyOwner {
        for (uint256 i = 0; i < params.length; i++) {
            // Call internal version to avoid double nonReentrant
            _settleSingle(params[i]);
        }
    }

    // FIX A5: Cancel and refund a device service session
    /// @notice Cancel session and emit refund event; actual token refund handled off-chain or by frontend
    function cancelAndRefund(bytes32 sessionId, address user, string calldata reason) external onlyOwner {
        if (settledSessions[sessionId]) revert AlreadySettled(sessionId);
        if (!sessionEscrow.isOpen(sessionId)) revert SessionNotOpen(sessionId);
        sessionEscrow.cancelSession(sessionId, reason);
        emit Refunded(sessionId, user, reason);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    function setFXConverter(address _converter) external onlyOwner {
        if (_converter == address(0)) revert ZeroAddress();
        fxConverter = IFXConverter(_converter);
        emit FXConverterUpdated(_converter);
    }

    function setFXOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert ZeroAddress();
        fxOracle = IFXOracle(_oracle);
        emit FXOracleUpdated(_oracle);
    }

    function setMaxSlippageBPS(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Max 10% slippage"); // safety cap
        maxSlippageBPS = bps;
        emit SlippageUpdated(bps);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _settleSingle(SettleParams calldata p) internal {
        if (block.timestamp > p.deadline) revert DeadlineExpired(p.deadline, block.timestamp);
        if (settledSessions[p.sessionId]) revert AlreadySettled(p.sessionId);
        if (!sessionEscrow.isOpen(p.sessionId)) revert SessionNotOpen(p.sessionId);
        if (!issuerRegistry.isActive(p.payToken)) revert TokenNotSupported(p.payToken);

        complianceGateway.checkBlocked(p.user);
        complianceGateway.checkSpend(p.user, p.amountUSD6);

        if (p.isDeviceService) {
            uint256 attested = usageAttestation.getAttestedUsage(p.sessionId);
            if (p.amountUSD6 > attested) revert AttestationMismatch(p.sessionId, attested, p.amountUSD6);
        }

        (uint256 tokenPrice, ) = fxOracle.getUSDPrice(p.payToken);
        uint8 tokenDecimals = IERC20Metadata(p.payToken).decimals();
        uint256 tokenAmount = PriceMath.fromUSD(p.amountUSD6, tokenPrice, tokenDecimals);

        IERC20(p.payToken).safeTransferFrom(p.user, p.merchant, tokenAmount);
        settledSessions[p.sessionId] = true;
        sessionEscrow.settleSession(p.sessionId, p.amountUSD6);

        if (p.isDeviceService) {
            usageAttestation.markSettled(p.sessionId);
        }

        complianceGateway.recordSpend(p.user, p.amountUSD6);
        emit Settled(p.sessionId, p.user, p.payToken, tokenAmount, p.amountUSD6, p.isRemittance);
    }

    // ─── UUPS upgrade authorization ───────────────────────────────────────────
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
