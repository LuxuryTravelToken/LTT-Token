// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title Token for distribution.
 */
contract Token is ERC20, ERC20Burnable {
    error TGEExecuted();
    error AccessIsDenied();

    /**
     * @notice The max amount of tokens.
     */
    uint256 public constant MAX_TOTAL_SUPPLY = 100_000_000_000e18;

    /**
     * @notice True if TGE has been executed.
     */
    bool public isExecuted;

    address public admin;

    /**
     * @notice Deployes contract.
     * @param name_ name of the token, as per ERC20.
     * @param symbol_ symbol of the token, as per ERC20.
     * @param admin_ address of the admin.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address admin_
    ) ERC20(name_, symbol_) {
        admin = admin_;
    }

    /**
     * @notice Executes TGE, startes vesting.
     * @param _vesting The vesting contract address.
     */
    function executeTGE(address _vesting) external {
        if (admin != msg.sender) {
            revert AccessIsDenied();
        }
        if (isExecuted) {
            revert TGEExecuted();
        }
        isExecuted = true;

        _mint(_vesting, MAX_TOTAL_SUPPLY);
    }
}
