// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IWETHMinimum.sol";

abstract contract AbstractPayFacade {
    address public immutable gridFactory;
    address public immutable weth9;

    constructor(address _factory, address _weth9) {
        gridFactory = _factory;
        weth9 = _weth9;
    }

    /// @dev pay token to recipient
    /// @param token The token to pay
    /// @param payer The address of the payment token
    /// @param recipient The address that receive payment
    /// @param amount The amount to pay
    function pay(address token, address payer, address recipient, uint256 amount) internal {
        if (token == weth9 && address(this).balance >= amount) {
            // pay with WETH9
            Address.sendValue(payable(weth9), amount);
            IWETHMinimum(weth9).transfer(recipient, amount);
        } else if (payer == address(this)) {
            SafeERC20.safeTransfer(IERC20(token), recipient, amount);
        } else {
            SafeERC20.safeTransferFrom(IERC20(token), payer, recipient, amount);
        }
    }
}
