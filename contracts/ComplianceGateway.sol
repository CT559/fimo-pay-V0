// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IComplianceScreener.sol";

/// @title ComplianceGateway
/// @notice Tiered verification (Universal/Telco/GlobalKYC) + self-set daily limits + AML adapter
/// @dev BLOCKING FIX A2: uses standard Ownable, no Cancun-dependent imports
contract ComplianceGateway is Ownable {
    // ─── Tiered Verification ────────────────────────────────────────────────
    enum Tier { None, Universal, Telco, GlobalKYC }

    mapping(address => Tier) public userTier;

    // ─── Personal Limits ────────────────────────────────────────────────────
    // "propose → wait → auto-commit" pattern (same philosophy as wallet recovery)
    uint256 public constant LIMIT_INCREASE_DELAY = 24 hours;
    uint256 public constant DEFAULT_DAILY_LIMIT_USD6 = 500_000_000; // $500 USD (6 dec)

    struct PersonalLimit {
        uint256 current;         // active limit (6 dec USD)
        uint256 proposed;        // pending new limit (only for increases)
        uint256 proposedAt;      // timestamp of proposal
        bool    pendingIncrease;
    }

    mapping(address => PersonalLimit) private _limits;

    // Daily spend tracking (resets at UTC midnight by tracking day bucket)
    mapping(address => uint256) public todaySpentUSD6;  // user => spent today
    mapping(address => uint256) public lastSpendDay;    // user => day bucket

    // ─── AML Screener (plug-in) ──────────────────────────────────────────────
    IComplianceScreener public screener; // default null = off

    // ─── Events ─────────────────────────────────────────────────────────────
    event TierSet(address indexed user, Tier tier);
    event LimitChangeProposed(address indexed user, uint256 newLimit, bool requiresDelay);
    event LimitCommitted(address indexed user, uint256 limit);
    event SpendRecorded(address indexed user, uint256 amountUSD6, uint256 totalToday);
    event ScreenerUpdated(address screener);

    // ─── Errors ─────────────────────────────────────────────────────────────
    error NotYetMature(uint256 readyAt);
    error ExceedsLimit(uint256 requested, uint256 limit);
    error DailyLimitExceeded(uint256 requested, uint256 remaining);
    error Blocked(address wallet);
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─── Tier Management (owner) ─────────────────────────────────────────────
    function setTier(address user, Tier tier) external onlyOwner {
        userTier[user] = tier;
        emit TierSet(user, tier);
    }

    function getTier(address user) external view returns (Tier) {
        return userTier[user];
    }

    // ─── Personal Limit (self-service, shown in Settings screen) ────────────
    /// @notice User calls this from the Settings screen to set their own daily limit
    /// @dev HÀ limit: effective immediately. NÂNG limit: 24h delay.
    function setMyDailyLimit(uint256 newLimitUSD6) external {
        PersonalLimit storage pl = _limits[msg.sender];
        uint256 current = _getCurrentLimit(msg.sender);

        if (newLimitUSD6 <= current) {
            // Decrease: effective immediately
            pl.current = newLimitUSD6;
            pl.pendingIncrease = false;
            emit LimitCommitted(msg.sender, newLimitUSD6);
        } else {
            // Increase: 24h delay (SIM-swap / social engineering protection)
            pl.proposed = newLimitUSD6;
            pl.proposedAt = block.timestamp;
            pl.pendingIncrease = true;
            emit LimitChangeProposed(msg.sender, newLimitUSD6, true);
        }
    }

    /// @notice Commit a pending limit increase after the delay has passed
    function commitLimitIncrease() external {
        PersonalLimit storage pl = _limits[msg.sender];
        if (!pl.pendingIncrease) return;
        uint256 readyAt = pl.proposedAt + LIMIT_INCREASE_DELAY;
        if (block.timestamp < readyAt) revert NotYetMature(readyAt);
        pl.current = pl.proposed;
        pl.pendingIncrease = false;
        emit LimitCommitted(msg.sender, pl.current);
    }

    /// @notice Cancel a pending limit increase
    function cancelLimitIncrease() external {
        PersonalLimit storage pl = _limits[msg.sender];
        pl.pendingIncrease = false;
        pl.proposed = 0;
    }

    function getMyLimit(address user) external view returns (
        uint256 current, uint256 proposed, uint256 readyAt, bool pending
    ) {
        PersonalLimit storage pl = _limits[user];
        current = _getCurrentLimit(user);
        proposed = pl.proposed;
        readyAt = pl.pendingIncrease ? pl.proposedAt + LIMIT_INCREASE_DELAY : 0;
        pending = pl.pendingIncrease;
    }

    // ─── Spend Tracking (called by SettlementRouter) ──────────────────────
    function recordSpend(address user, uint256 amountUSD6) external onlyOwner {
        _checkAndRecord(user, amountUSD6);
    }

    function checkSpend(address user, uint256 amountUSD6) external view {
        uint256 dayLimit = _getCurrentLimit(user);
        uint256 spent = _todaySpent(user);
        if (spent + amountUSD6 > dayLimit) {
            revert DailyLimitExceeded(amountUSD6, dayLimit - spent);
        }
    }

    // ─── AML Screener ────────────────────────────────────────────────────────
    function setScreener(address _screener) external onlyOwner {
        screener = IComplianceScreener(_screener);
        emit ScreenerUpdated(_screener);
    }

    function checkBlocked(address wallet) external view {
        if (address(screener) != address(0) && screener.isBlocked(wallet)) {
            revert Blocked(wallet);
        }
    }

    // ─── Internal ────────────────────────────────────────────────────────────
    function _getCurrentLimit(address user) internal view returns (uint256) {
        uint256 stored = _limits[user].current;
        return stored == 0 ? DEFAULT_DAILY_LIMIT_USD6 : stored;
    }

    function _todaySpent(address user) internal view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        if (lastSpendDay[user] != today) return 0;
        return todaySpentUSD6[user];
    }

    function _checkAndRecord(address user, uint256 amountUSD6) internal {
        uint256 today = block.timestamp / 1 days;
        if (lastSpendDay[user] != today) {
            todaySpentUSD6[user] = 0;
            lastSpendDay[user] = today;
        }
        uint256 dayLimit = _getCurrentLimit(user);
        uint256 newTotal = todaySpentUSD6[user] + amountUSD6;
        if (newTotal > dayLimit) revert DailyLimitExceeded(amountUSD6, dayLimit - todaySpentUSD6[user]);
        todaySpentUSD6[user] = newTotal;
        emit SpendRecorded(user, amountUSD6, newTotal);
    }
}
