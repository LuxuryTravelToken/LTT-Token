// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Vesting to manage tokens between addresses and destinations.
 */
contract Vesting {
    using SafeERC20 for IERC20;

    enum Direction {
        PUBLIC_ROUND,
        STAKING,
        TEAM,
        LIQUIDITY,
        MARKETING,
        TREASURY
    }

    struct VestingSchedule {
        uint128 cliffInSeconds; //The duration while token locks.
        uint128 vestingInSeconds; // The duration of vesting in seconds.
        uint256 totalAmount; // The amount of vesting token.
        uint256 claimed; // The amount of vesting token which was claimed.
    }

    error DataLengthsNotMatch();
    error DataLengthsIsZero();
    error TotalAmountLessThanClaimed();
    error ClaimAmountIsZero();
    error InsufficientTokens();
    error IncorrectAmount();
    error ZeroAddress();
    error NotStarted();
    error VestingAlreadyStarted();
    error ForbiddenWithdrawalFromOwnContract();
    error AccessIsDenied();

    /**
     * @notice The number of destinations that participate in the vesting.
     */
    uint8 public constant DIRECTION_COUNT = 6;

    /**
     * @notice Token for distribution.
     */
    IERC20 public immutable token;

    address public admin;

    /**
     * @notice Start date of vesting.
     */
    uint128 public vestingStartTimestamp;

    /**
     * @notice The total amount of tokens at the addresses that are in the vesting.
     */
    uint256 public vestingTotalAmount;

    // Mapping by vesting schedule for a specific address and direction.
    mapping(address => mapping(uint8 => VestingSchedule))
        public vestingSchedules;

    /**
     * @notice Emitted when account claimed tokens.
     * @param account The account address.
     * @param amount The amount of vesting token which was claimed.
     * @param createdAt The creation date when tokens was claimed.
     * @param direction The number of destination.
     */
    event Claimed(
        address indexed account,
        uint256 amount,
        uint128 createdAt,
        uint8 direction
    );

    /**
     * @notice Emitted when admin created vesting schedule for user.
     * @param account The account address.
     * @param amount The amount of vesting token.
     * @param cliff The duration in seconds when token locks.
     * @param vesting The duration of vesting in seconds.
     * @param createdAt The creation date of vesting.
     * @param direction The number of destination.
     */
    event VestingCreated(
        address indexed account,
        uint256 amount,
        uint128 cliff,
        uint128 vesting,
        uint128 createdAt,
        uint8 direction
    );

    modifier onlyAdmin() {
        if (admin != msg.sender) {
            revert AccessIsDenied();
        }
        _;
    }

    constructor(address token_, address admin_) {
        token = IERC20(token_);
        admin = admin_;
    }

    /**
     * @notice Sets a vesting start timestamp.
     */
    function setVestingStartTimestamp() external onlyAdmin {
        if (vestingStartTimestamp != 0) {
            revert VestingAlreadyStarted();
        }

        vestingStartTimestamp = uint128(block.timestamp);
    }

    /**
     * @notice Sets public round vest for user.
     * @param _accounts The array of users.
     * @param _amounts The array of amounts.
     */
    function setPublicRoundVestFor(
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external onlyAdmin {
        _batchVestFor(_accounts, _amounts, 0, 0, uint8(Direction.PUBLIC_ROUND));
    }

    /**
     * @notice Sets staking vest for user.
     * @param _accounts The array of users.
     * @param _amounts The array of amounts.
     */
    function setStakingVestFor(
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external onlyAdmin {
        _batchVestFor(
            _accounts,
            _amounts,
            15768000, // 6 months
            78840000, // 30 months
            uint8(Direction.STAKING)
        );
    }

    /**
     * @notice Sets team vest for user.
     * @param _accounts The array of users.
     * @param _amounts The array of amounts.
     */
    function setTeamVestFor(
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external onlyAdmin {
        _batchVestFor(
            _accounts,
            _amounts,
            31536000, // 12 months
            63072000, // 24 months
            uint8(Direction.TEAM)
        );
    }

    /**
     * @notice Sets liquidity vest for user.
     * @param _accounts The array of users.
     * @param _amounts The array of amounts.
     */
    function setLiquidityVestFor(
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external onlyAdmin {
        _batchVestFor(
            _accounts,
            _amounts,
            0,
            15768000, // 6 months
            uint8(Direction.LIQUIDITY)
        );
    }

    /**
     * @notice Sets marketing vest for user.
     * @param _accounts The array of users.
     * @param _amounts The array of amounts.
     */
    function setMarketingVestFor(
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external onlyAdmin {
        _batchVestFor(
            _accounts,
            _amounts,
            0,
            78840000, // 30 months
            uint8(Direction.MARKETING)
        );
    }

    /**
     * @notice Sets treasury vest for user.
     * @param _accounts The array of users.
     * @param _amounts The array of amounts.
     */
    function setTreasuryVestFor(
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external onlyAdmin {
        _batchVestFor(
            _accounts,
            _amounts,
            15768000, // 6 months
            78840000, // 30 months
            uint8(Direction.TREASURY)
        );
    }

    /**
     * @notice Claims available vested tokens for all vesting schedules of the user.
     * If there are no tokens available for any direction, the transaction will revert.
     * Emits a `Claimed` event for each direction from which tokens were claimed.
     * Transfers the total claimed amount to the user.
     */
    function claim() external {
        uint256 totalVestedAmount = 0;
        // Iterate over all vesting schedules of the user.
        for (uint8 i = 0; i < DIRECTION_COUNT; i++) {
            VestingSchedule memory schedule = vestingSchedules[msg.sender][i];
            // Calculate the available amount of tokens for the current vesting schedule.
            uint256 vestedAmount = _vestedAmount(schedule, i);

            if (vestedAmount > 0) {
                // Increases released amount in vesting.
                vestingSchedules[msg.sender][i].claimed =
                    vestedAmount +
                    schedule.claimed;

                emit Claimed(
                    msg.sender,
                    vestedAmount,
                    uint128(block.timestamp),
                    i
                );
            }

            totalVestedAmount += vestedAmount;
        }

        if (totalVestedAmount == 0) {
            revert ClaimAmountIsZero();
        }

        // Current amount of tokens in vesting.
        vestingTotalAmount -= totalVestedAmount;

        token.safeTransfer(msg.sender, totalVestedAmount);
    }

    /**
     * @notice Rescues stuck tokens from the contract to the specified address.
     * @param _token The address of the token to be withdrawn.
     * @param _to The address to which the tokens will be transferred.
     * @param _amount The amount of stuck tokens.
     * @dev Only the contract owner with the DEFAULT_ADMIN_ROLE can call this function to withdraw tokens.
     */
    function rescueERC20(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyAdmin {
        if (_token == address(0)) {
            revert ZeroAddress();
        }
        if (_token == address(token)) {
            revert ForbiddenWithdrawalFromOwnContract();
        }
        IERC20(_token).transfer(_to, _amount);
    }

    /**
     * @notice Returns the total vesting information for a given account.
     * @param _account The user address.
     * @return totalAmount The total amount of tokens in vesting schedules.
     * @return unlockedAmount The amount of tokens currently unlocked.
     * @return claimedAmount The amount of tokens already claimed.
     * @return lockedAmount The amount of tokens still locked.
     */
    function getTotalVestingInfo(
        address _account
    )
        external
        view
        returns (
            uint256 totalAmount,
            uint256 unlockedAmount,
            uint256 claimedAmount,
            uint256 lockedAmount
        )
    {
        for (uint8 i = 0; i < DIRECTION_COUNT; i++) {
            VestingSchedule memory schedule = vestingSchedules[_account][i];

            unlockedAmount += _vestedAmount(schedule, i);
            totalAmount += schedule.totalAmount;
            claimedAmount += schedule.claimed;
        }

        lockedAmount = totalAmount - claimedAmount - unlockedAmount;
    }

    /**
     * @notice Returns amount of tokens available for vesting distribution.
     */
    function getAvailableAmount() public view returns (uint256) {
        return token.balanceOf(address(this)) - vestingTotalAmount;
    }

    /**
     * @notice Creates vesting schedules for user.
     * @param _account The user address.
     * @param _amount The amount of vesting token.
     * @param _cliff The duration in seconds when token locks.
     * @param _vesting The duration of vesting in seconds.
     * @param _direction The direction of vesting.
     */
    function _vestFor(
        address _account,
        uint256 _amount,
        uint128 _cliff,
        uint128 _vesting,
        uint8 _direction
    ) private {
        if (vestingStartTimestamp == 0) {
            revert NotStarted();
        }
        if (_amount == 0) {
            revert IncorrectAmount();
        }
        if (_account == address(0)) {
            revert ZeroAddress();
        }

        uint256 totalAmount = vestingSchedules[_account][_direction]
            .totalAmount;
        uint256 claimed = vestingSchedules[_account][_direction].claimed;

        // Calculate the delta amount that needs to be additionally vested
        uint256 deltaAmount = _amount > totalAmount ? _amount - totalAmount : 0;

        if (getAvailableAmount() < deltaAmount) {
            revert InsufficientTokens();
        }

        if (totalAmount == 0) {
            // Current amount of tokens in vesting.
            vestingTotalAmount += _amount;
        } else {
            if (_amount < claimed) {
                revert TotalAmountLessThanClaimed();
            }

            // Adjust the total amount of tokens in vesting if totalAmount was modified.
            vestingTotalAmount += _amount - totalAmount;
        }
        vestingSchedules[_account][_direction].cliffInSeconds = _cliff;
        vestingSchedules[_account][_direction].vestingInSeconds = _vesting;
        vestingSchedules[_account][_direction].totalAmount = _amount;

        emit VestingCreated(
            _account,
            _amount,
            _cliff,
            _vesting,
            uint128(block.timestamp),
            _direction
        );
    }

    /**
     * @notice Creates vesting schedules for users.
     * @param _accounts The array of users.
     * @param _amounts The array of amounts.
     * @param _cliff The duration in seconds when token locks.
     * @param _vesting The duration of vesting in seconds.
     * @param _direction The direction of vesting.
     */
    function _batchVestFor(
        address[] calldata _accounts,
        uint256[] calldata _amounts,
        uint128 _cliff,
        uint128 _vesting,
        uint8 _direction
    ) private {
        uint16 accountsCount = uint16(_accounts.length);

        if (accountsCount == 0) {
            revert DataLengthsIsZero();
        }

        if (accountsCount != _amounts.length) {
            revert DataLengthsNotMatch();
        }

        for (uint16 i = 0; i < accountsCount; i++) {
            _vestFor(_accounts[i], _amounts[i], _cliff, _vesting, _direction);
        }
    }

    /**
     * @notice Returns available amount of tokens.
     * @param _vestingSchedule The vesting schedule structure.
     * @param _direction The direction of vesting.
     */
    function _vestedAmount(
        VestingSchedule memory _vestingSchedule,
        uint8 _direction
    ) private view returns (uint256) {
        uint256 totalAmount = _vestingSchedule.totalAmount;
        uint256 claimed = _vestingSchedule.claimed;
        // Duration in seconds from vesting start.
        uint128 passedTimeInSeconds = uint128(block.timestamp) -
            vestingStartTimestamp;

        uint128 cliff = _vestingSchedule.cliffInSeconds;
        uint128 vesting = _vestingSchedule.vestingInSeconds;
        uint128 maxPossibleTime = vesting + cliff;

        if (
            totalAmount == 0 ||
            passedTimeInSeconds < cliff ||
            claimed >= totalAmount
        ) {
            return 0;
        }

        if (_direction == uint8(Direction.LIQUIDITY)) {
            if (passedTimeInSeconds >= maxPossibleTime) {
                return totalAmount - claimed;
            } else if (claimed == 0) {
                return totalAmount / 2;
            }
            return 0;
        }
        if (passedTimeInSeconds >= maxPossibleTime) {
            return totalAmount - claimed;
        } else {
            return (totalAmount * passedTimeInSeconds) / vesting - claimed;
        }
    }
}
